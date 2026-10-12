// Revert only rows still owned by the failed optimistic action. An inserted
// remote row or a replacement object belongs to newer work and is preserved.
export const rollbackUnchangedRows = <T extends { id: string }>(current: T[], before: T[], submitted: T[]): T[] => {
  if (current === submitted) return before;
  const originals = new Map(before.map(row => [row.id, row]));
  const staged = new Map(submitted.map(row => [row.id, row]));
  return current.flatMap(row => {
    if (row !== staged.get(row.id)) return [row];
    const original = originals.get(row.id);
    return original ? [original] : [];
  });
};
