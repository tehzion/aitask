import { sha256 } from '@noble/hashes/sha2';
import type { PersistedWorkspaceState } from './supabaseSnapshot';

export const companyNameKey = (name: string) => name.normalize('NFC').trim().toLowerCase();
export const legacyCompanyId = (name: string) => `CL-legacy-${Array.from(sha256(new TextEncoder().encode(companyNameKey(name))), byte => byte.toString(16).padStart(2, '0')).join('')}`;

// Names can change; resolve every record in an ID group together. Never split
// a relationship by resolving a stale name on one row independently.
export const normalizeCompanyIdentities = (state: PersistedWorkspaceState): PersistedWorkspaceState => {
  const collections = ['tasks', 'projects', 'clientPlans', 'serviceCycles', 'deliverables', 'cycleComments', 'addons', 'servicePricingSnapshots'] as const;
  type CompanyRecord = { clientId?: string; clientName?: string };
  const records: CompanyRecord[] = collections.flatMap(key => state[key] as CompanyRecord[]);
  const namesById = new Map<string, Set<string>>();
  records.forEach(record => {
    if (!record.clientId) return;
    const names = namesById.get(record.clientId) || new Set<string>();
    if (record.clientName?.trim()) names.add(companyNameKey(record.clientName));
    namesById.set(record.clientId, names);
  });
  const profileNamesById = new Map<string, Set<string>>();
  state.clients.forEach(client => {
    const names = profileNamesById.get(client.id) || new Set<string>();
    names.add(companyNameKey(client.clientName));
    profileNamesById.set(client.id, names);
  });
  // A historical slug collision cannot make two companies share a profile ID.
  // Its ambiguous work records keep their group until explicitly reconciled.
  const clients = state.clients.map(client => profileNamesById.get(client.id)!.size > 1
    ? { ...client, id: legacyCompanyId(client.clientName) } : client);
  const authoritativeIds = new Set(clients.map(client => client.id));
  const idsByName = new Map<string, Set<string>>();
  const remember = (id: string, name: string) => {
    const key = companyNameKey(name);
    const ids = idsByName.get(key) || new Set<string>(); ids.add(id); idsByName.set(key, ids);
  };
  clients.forEach(client => remember(client.id, client.clientName));
  const remap = new Map<string, string>();
  namesById.forEach((names, id) => {
    if (authoritativeIds.has(id)) return;
    const matches = new Set(Array.from(names).flatMap(name => Array.from(idsByName.get(name) || [])));
    if (matches.size === 1) remap.set(id, matches.values().next().value!);
  });
  const owners = new Map<string, string>();
  [...state.clientPlans, ...state.projects, ...state.tasks].forEach(item => {
    if (item.createdBy && !owners.has(companyNameKey(item.clientName))) owners.set(companyNameKey(item.clientName), item.createdBy);
  });
  [...state.tasks, ...state.projects].forEach(record => {
    const name = record.clientName.trim(); const key = companyNameKey(name);
    if (!name || idsByName.has(key)) return;
    let id = record.clientId && !remap.has(record.clientId) ? record.clientId : legacyCompanyId(name);
    // Preserve ambiguous groups without inventing a canonical profile for them.
    if (record.clientId && (namesById.get(record.clientId)?.size || 0) > 1) return;
    if (authoritativeIds.has(id)) return;
    if (clients.some(client => client.id === id && companyNameKey(client.clientName) !== key)) id = legacyCompanyId(name);
    const now = new Date(0).toISOString();
    clients.push({ id, clientName: name, createdBy: owners.get(key), discovered: true, createdAt: now, updatedAt: now });
    remember(id, name);
  });
  const resolve = (record: CompanyRecord) => {
    if (record.clientId) return remap.get(record.clientId) || record.clientId;
    const matches = idsByName.get(companyNameKey(record.clientName || ''));
    return matches?.size === 1 ? matches.values().next().value : undefined;
  };
  const normalized = { ...state, clients };
  collections.forEach(key => {
    // All collections retain their original shape; only the foreign key changes.
    Object.assign(normalized, { [key]: state[key].map(item => ({ ...item, clientId: resolve(item) })) });
  });
  return normalized;
};
