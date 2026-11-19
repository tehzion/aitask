import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

/**
 * The translator fills placeholders first and looks the finished sentence up
 * afterwards, so t('Step {n} of {total}', { n, total }) can never find a
 * Chinese entry for "Step 2 of 5" and silently stays English. Copy with
 * placeholders must use a message id (src/lib/messages.ts), which formats each
 * locale itself.
 */
describe('placeholder copy', () => {
  it('never passes English prose with {placeholders} and values straight to t()', () => {
    const offenders: string[] = [];
    const pattern = /\bt\(\s*'([^']*\{[a-zA-Z]+\}[^']*)'\s*,/g;
    for (const file of walk('src')) {
      if (!/\.(ts|tsx)$/.test(file) || /\.test\.|messages\.ts$/.test(file)) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${file}:${line} ${match[1].slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
