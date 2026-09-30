export type DraftConflict = { path: string; baseline: unknown; local: unknown; remote: unknown };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const identified = (value: unknown): value is { id: string }[] => Array.isArray(value) && value.every(item => record(item) && typeof item.id === 'string') && new Set(value.map(item => item.id)).size === value.length;

// Arrays of entities are merged by identity. Other arrays (platforms, workflow
// steps) are atomic so an overlapping edit requires a deliberate choice.
export const mergeDraft = <T,>(baseline: T, local: T, remote: T, choices: Record<string, 'local' | 'remote'> = {}) => {
  const conflicts: DraftConflict[] = [];
  const merge = (base: unknown, mine: unknown, latest: unknown, path: string): unknown => {
    if (same(mine, base)) return latest;
    if (same(latest, base) || same(mine, latest)) return mine;
    if (identified(base) && identified(mine) && identified(latest)) {
      const ids = [...new Set([...latest.map(item => item.id), ...mine.map(item => item.id)])];
      return ids.map(id => merge(base.find(item => item.id === id), mine.find(item => item.id === id), latest.find(item => item.id === id), `${path}[${id}]`)).filter(item => item !== undefined);
    }
    if (record(base) && record(mine) && record(latest)) {
      return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(latest)])].map(key => [key, merge(base[key], mine[key], latest[key], path ? `${path}.${key}` : key)]).filter(([, value]) => value !== undefined));
    }
    if (!choices[path]) conflicts.push({ path, baseline: base, local: mine, remote: latest });
    return choices[path] === 'remote' ? latest : mine;
  };
  return { value: structuredClone(merge(baseline, local, remote, '') as T), conflicts };
};
