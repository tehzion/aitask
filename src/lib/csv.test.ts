import { describe, expect, it } from 'vitest';
import { csvValue, reportAssigneeName, serializeCsv } from './csv';
describe('spreadsheet exports', () => {
  it.each(['=SUM(1,2)', '+1', '-1', '@SUM(1)', '  =1', '\t=1', '\r=1', '\n=1', '\u0000=1'])('neutralizes formula/control prefix %j', value => {
    expect(csvValue(value)).toBe(`"'${value}"`);
  });
  it('preserves Unicode, quotes and multiline cells', () => {
    expect(serializeCsv([['设计', 'a"b', 'first\nsecond'], [null, 'plain', 42]])).toBe('"设计","a""b","first\nsecond"\r\n"","plain","42"');
  });
  it('uses readable names and distinguishes unassigned and unavailable members', () => {
    const labels = { unassigned: 'Unassigned', unavailable: 'Unavailable member' };
    expect(reportAssigneeName('u1', [{ id: 'u1', name: 'Designer' }], labels)).toBe('Designer');
    expect(reportAssigneeName('', [], labels)).toBe('Unassigned');
    expect(reportAssigneeName('deleted', [], labels)).toBe('Unavailable member');
  });
});
