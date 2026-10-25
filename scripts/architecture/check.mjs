import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const slash = value => value.replaceAll('\\', '/');
const featureOf = file => /^src\/modules\/([^/]+)\//.exec(file)?.[1];
const isTest = file => /\.(?:test|spec)\.tsx?$/.test(file);
const isUi = file => /\/(?:components|pages|hooks)\//.test(file) || /\.tsx$/.test(file);

export function collectImports(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      imports.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return [...new Set(imports)];
}

export function findCycles(graph) {
  const visited = new Set();
  const active = [];
  const cycles = [];
  const visit = file => {
    const position = active.indexOf(file);
    if (position !== -1) { cycles.push([...active.slice(position), file]); return; }
    if (visited.has(file)) return;
    visited.add(file);
    active.push(file);
    for (const target of graph.get(file) || []) visit(target);
    active.pop();
  };
  for (const file of graph.keys()) visit(file);
  return cycles;
}

export function boundaryViolation(source, target, manifest) {
  if (source.startsWith('src/shared/') && /^(?:src\/app|src\/modules)\//.test(target)) {
    return 'shared code must not depend on application or feature implementation';
  }
  if (source.startsWith('src/infrastructure/') && (target.startsWith('src/app/') || (featureOf(target) && isUi(target)))) {
    return 'infrastructure must not depend on the app, feature UI, or composed store';
  }
  if (/\/(?:domain|rules|authorization)\//.test(source) && (isUi(target) || target === 'src/app/store/workspaceStore.ts')) {
    return 'domain rules must not depend on UI or the composed store';
  }
  if (/\/application\/[^/]*Actions\.ts$/.test(source) && target === 'src/app/store/workspaceStore.ts') {
    return 'action factories receive state access instead of importing the composed store';
  }
  const targetFeature = featureOf(target);
  if (targetFeature && featureOf(source) !== targetFeature) {
    const entry = target.replace(`src/modules/${targetFeature}/`, '');
    const feature = manifest.modules[targetFeature];
    if (source === 'src/app/store/workspaceStore.ts' && feature?.composition.includes(entry)) return null;
    if (!feature?.public.includes(entry)) return `private ${targetFeature} implementation; use a declared public entry point`;
  }
  return null;
}

export function inspectArchitecture(root = repositoryRoot, manifest) {
  const configFile = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const cache = ts.createModuleResolutionCache(root, value => value, config.options);
  const files = readdirSync(resolve(root, 'src'), { recursive: true })
    .filter(file => /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !isTest(file))
    .map(file => `src/${slash(file)}`).sort();
  const runtime = new Map();
  const all = new Map();
  const violations = [];
  const resolveImport = (file, specifier) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
    if (/\.(?:css|svg|png|woff2?)$/.test(specifier) && existsSync(resolve(dirname(resolve(root, file)), specifier))) return null;
    const resolved = ts.resolveModuleName(specifier, resolve(root, file), config.options, ts.sys, cache).resolvedModule;
    if (!resolved) { violations.push(`${file}: unresolved import ${specifier}`); return null; }
    return slash(relative(root, resolved.resolvedFileName));
  };
  for (const file of files) {
    const source = readFileSync(resolve(root, file), 'utf8');
    const dependencies = collectImports(file, source).map(specifier => resolveImport(file, specifier)).filter(Boolean);
    const emitted = ts.transpileModule(source, { fileName: file, compilerOptions: { ...config.options, noEmit: false, verbatimModuleSyntax: false } }).outputText;
    const runtimeDependencies = collectImports(file.replace(/\.tsx?$/, '.js'), emitted).map(specifier => resolveImport(file, specifier)).filter(Boolean);
    all.set(file, dependencies);
    runtime.set(file, runtimeDependencies);
    for (const target of dependencies) {
      if (isTest(target)) violations.push(`${file} -> ${target}: production code imports a test`);
      if (manifest) {
        const problem = boundaryViolation(file, target, manifest);
        if (problem) violations.push(`${file} -> ${target}: ${problem}`);
      }
    }
  }
  if (manifest) for (const [name, entry] of Object.entries(manifest.modules)) {
    for (const file of [...entry.public, ...entry.composition]) {
      if (!all.has(`src/modules/${name}/${file}`)) violations.push(`Declared ${name} entry point does not exist: ${file}`);
    }
  }
  const runtimeCycles = findCycles(runtime);
  violations.push(...runtimeCycles.map(cycle => `Runtime cycle: ${cycle.join(' -> ')}`));
  return { files: files.length, runtimeEdges: [...runtime.values()].reduce((sum, edges) => sum + edges.length, 0), typeOnlyEdges: [...all].reduce((sum, [file, edges]) => sum + edges.filter(edge => !runtime.get(file).includes(edge)).length, 0), runtimeCycles, typeGraphCycles: findCycles(all), violations: [...new Set(violations)], runtime, all };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'architecture-boundaries.json'), 'utf8'));
  const report = inspectArchitecture(repositoryRoot, manifest);
  console.log(`[architecture] ${report.files} files, ${report.runtimeEdges} runtime edges, ${report.typeOnlyEdges} type-only edges, ${report.runtimeCycles.length} runtime cycles, ${report.typeGraphCycles.length} type-inclusive cycles`);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...report, runtime: Object.fromEntries(report.runtime), all: Object.fromEntries(report.all) }, null, 2));
  for (const violation of report.violations) console.error(`[architecture] ${violation}`);
  if (report.violations.length) process.exitCode = 1;
}
