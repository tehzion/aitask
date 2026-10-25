export const csvValue = (value: unknown): string => {
  let text = value == null ? '' : String(value);
  // Spreadsheet engines may skip whitespace before recognizing a formula.
  // eslint-disable-next-line no-control-regex -- deliberately guard spreadsheet control prefixes
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export const serializeCsv = (rows: readonly (readonly unknown[])[]) => rows.map(row => row.map(csvValue).join(',')).join('\r\n');
export const reportAssigneeName = (id: string | undefined, members: readonly { id: string; name: string }[], labels: { unassigned: string; unavailable: string }) => !id ? labels.unassigned : members.find(member => member.id === id)?.name || labels.unavailable;

export const createCsvBlob = (rows: readonly (readonly unknown[])[]) => new Blob([`\ufeff${serializeCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
