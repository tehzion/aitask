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

const manifest = JSON.parse(await readFile(resolve('dist/.vite/manifest.json'), 'utf8'));
const visited = new Set();
const eagerFiles = new Set();
const visit = key => {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`[bundle] Missing manifest dependency: ${key}`);
  if (chunk.file.endsWith('.js')) eagerFiles.add(chunk.file);
  (chunk.imports || []).forEach(visit);
};
Object.entries(manifest).filter(([, chunk]) => chunk.isEntry).forEach(([key]) => visit(key));
let eagerRaw = 0;
let eagerGzip = 0;
for (const file of eagerFiles) {
  const source = await readFile(resolve('dist', file));
  eagerRaw += source.byteLength;
  eagerGzip += gzipSync(source, { level: 9 }).byteLength;
}
console.log(`[bundle] Eager JS graph (${eagerFiles.size} chunks): ${(eagerRaw / 1024).toFixed(1)} KiB raw, ${(eagerGzip / 1024).toFixed(1)} KiB gzip (300 KiB gzip cap).`);
if (eagerGzip > 300 * 1024) throw new Error('[bundle] Eager JavaScript dependency graph exceeds 300 KiB gzip.');
console.log('[bundle] Bundle-size budgets passed.');
