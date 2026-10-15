// Read-only local reproduction. Imports current TypeScript helpers without a
// server, browser, database connection, or persistent application state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function loadSource(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const source = readFileSync(url, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: specifier => {
      assert.equal(specifier, './departments');
      return loadSource(new URL('./departments.ts', url));
    },
  }, { filename: url.pathname });
  cache.set(url.href, module.exports);
  return module.exports;
}

const { canDeleteClientProfile } = loadSource(new URL('../../../src/lib/access.ts', import.meta.url));
const cases = [
  {
    company: 'Lumea Skin Lab Sdn Bhd',
    pm: 'e30941ff-d813-408c-885f-51d0875ffefe',
    profiles: [
      { id: 'CL-1789636987542-u8qh6', clientName: 'Lumea Skin Lab Sdn Bhd', createdBy: 'u-boss' },
      { id: 'CL-1790583083252-76vlv', clientName: 'LUMEA SKIN LAB SDN BHD', createdBy: 'e30941ff-d813-408c-885f-51d0875ffefe' },
    ],
    expectedAllowed: false,
    expectedSelectedOwned: true,
  },
  {
    company: 'Le Motor',
    pm: '29d92182-57a3-4d42-a1d0-11e6d67146cb',
    profiles: [
      { id: 'CL-1792042519625-t499q', clientName: 'Le Motor', createdBy: '29d92182-57a3-4d42-a1d0-11e6d67146cb' },
      { id: 'CL-migrated-79a8ac767300c08a4ba67c18', clientName: 'Le Motor', createdBy: 'u-boss' },
    ],
    expectedAllowed: true,
    expectedSelectedOwned: false,
  },
];

for (const item of cases) {
  const actor = { id: item.pm, name: 'PM audit fixture', role: 'Project Manager', departments: ['Management'], department: 'Management' };
  const profiles = item.profiles.map(profile => ({ ...profile, createdAt: '', updatedAt: '' }));
  assert.equal(canDeleteClientProfile(actor, item.company, profiles.filter(p => p.createdBy === actor.id)), true);
  assert.equal(canDeleteClientProfile(actor, item.company, profiles.filter(p => p.createdBy !== actor.id)), false);
  const allowed = canDeleteClientProfile(actor, item.company, profiles);
  // Clients.tsx overwrites summary.profile for each same-key profile, retaining
  // the last; secureWorkspace.ts loads profiles in entity_id order.
  const selected = profiles.at(-1);
  assert.equal(allowed, item.expectedAllowed);
  assert.equal(selected.createdBy === actor.id, item.expectedSelectedOwned);
  console.log(JSON.stringify({ company: item.company, frontendDeleteAllowed: allowed, selectedProfile: selected.id, selectedProfileOwnedByActor: selected.createdBy === actor.id }));
}
