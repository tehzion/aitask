import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const assetsDir = resolve('dist/assets');
const files = await readdir(assetsDir);

const findAsset = (pattern, label) => {
  const match = files.find(file => pattern.test(file));
  if (!match) throw new Error(`[bundle] ${label} asset was not found in dist/assets.`);
  return match;
};

const budgets = [
  { label: 'initial index JS', file: findAsset(/^index-[A-Za-z0-9_-]+\.js$/, 'index'), rawBytes: 500_000, gzipBytes: 150_000 },
  { label: 'report chart JS', file: findAsset(/^(?:reportsCharts|BarChart|recharts)-[A-Za-z0-9_-]+\.js$/, 'report charts'), rawBytes: 420_000, gzipBytes: 125_000 },
];

for (const budget of budgets) {
  const source = await readFile(join(assetsDir, budget.file));
  const rawBytes = source.byteLength;
  const gzipBytes = gzipSync(source, { level: 9 }).byteLength;
  console.log(`[bundle] ${budget.label}: ${(rawBytes / 1024).toFixed(1)} kB raw, ${(gzipBytes / 1024).toFixed(1)} kB gzip (budgets ${(budget.rawBytes / 1024).toFixed(0)}/${(budget.gzipBytes / 1024).toFixed(0)} kB)`);
  if (rawBytes > budget.rawBytes || gzipBytes > budget.gzipBytes) {
    throw new Error(`[bundle] ${budget.label} exceeds its documented size budget.`);
  }
}

console.log('[bundle] Bundle-size budgets passed.');
