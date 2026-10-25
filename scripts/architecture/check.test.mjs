import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { boundaryViolation, collectImports, findCycles } from './check.mjs';

const manifest = { modules: { tasks: { public: ['domain/taskCompletion.ts'], composition: ['application/tasksActions.ts'] } } };

test('finds runtime cycles including an isolated self import', () => {
  const graph = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['self', ['self']]]);
  assert.deepEqual(findCycles(graph), [['a', 'b', 'c', 'a'], ['self', 'self']]);
});

test('a shared dependency is not a cycle', () => {
  assert.deepEqual(findCycles(new Map([['page', ['left', 'right']], ['left', ['shared']], ['right', ['shared']], ['shared', []]])), []);
});

test('collects side effects, re-exports, dynamic imports and type imports', () => {
  assert.deepEqual(collectImports('example.ts', `import './copy'; export { value } from './public'; const load = () => import('./lazy'); type Contract = import('./types').Contract;`), ['./copy', './public', './lazy', './types']);
});

test('type-only edges do not become runtime dependencies', () => {
  const source = `import type { Contract } from './types'; import { execute } from './runtime'; export const run = (value: Contract) => execute(value);`;
  const emitted = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  assert.deepEqual(collectImports('example.js', emitted), ['./runtime']);
});

test('cross-feature imports require explicitly published leaf entry points', () => {
  assert.equal(boundaryViolation('src/modules/reports/domain/report.ts', 'src/modules/tasks/domain/taskCompletion.ts', manifest), null);
  assert.match(boundaryViolation('src/modules/reports/domain/report.ts', 'src/modules/tasks/application/private.ts', manifest), /private tasks/);
});

test('only the workspace composition root may import a private action factory', () => {
  assert.equal(boundaryViolation('src/app/store/workspaceStore.ts', 'src/modules/tasks/application/tasksActions.ts', manifest), null);
  assert.match(boundaryViolation('src/app/shell/Layout.tsx', 'src/modules/tasks/application/tasksActions.ts', manifest), /private tasks/);
});

test('feature action factories cannot import the composed store', () => {
  assert.match(boundaryViolation('src/modules/tasks/application/tasksActions.ts', 'src/app/store/workspaceStore.ts', manifest), /receive state access/);
  assert.equal(boundaryViolation('src/modules/notifications/hooks/useNotificationReadActions.ts', 'src/app/store/workspaceStore.ts', manifest), null);
});

test('shared and infrastructure code cannot depend on feature UI', () => {
  assert.match(boundaryViolation('src/shared/utils/date.ts', 'src/modules/tasks/pages/Tasks.tsx', manifest), /shared code/);
  assert.match(boundaryViolation('src/infrastructure/api/request.ts', 'src/modules/tasks/pages/Tasks.tsx', manifest), /infrastructure/);
  assert.match(boundaryViolation('src/infrastructure/api/request.ts', 'src/app/store/workspaceStore.ts', manifest), /infrastructure/);
});

test('domain rules cannot depend on UI', () => {
  assert.match(boundaryViolation('src/modules/reports/domain/report.ts', 'src/modules/tasks/components/Task.tsx', manifest), /domain rules/);
});
