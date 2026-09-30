import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const executable = process.env.AITASK_LIBREOFFICE || '/Applications/LibreOffice.app/Contents/MacOS/soffice';
const root = mkdtempSync(join(tmpdir(), 'aitask-csv-qa-'));
try {
  // Exercise the actual application serializer, not a duplicate in the test.
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/csv.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { createCsvBlob } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const inputs = ['=1+1', '+1+1', '-1+1', '@SUM(1,1)', '\t=1+1', '\r=1+1', '  =1+1', '"quoted"', 'first\nsecond', 'Unicode 中文'];
  const csv = join(root, 'export.csv');
  writeFileSync(csv, Buffer.from(await createCsvBlob([['Value'], ...inputs.map(value => [value])]).arrayBuffer()));
  execFileSync(executable, [`-env:UserInstallation=file://${root}/profile`, '--headless', '--convert-to', 'xlsx', '--outdir', root, csv], { timeout: 60000 });
  const sheet = execFileSync('unzip', ['-p', join(root, 'export.xlsx'), 'xl/worksheets/sheet1.xml'], { encoding: 'utf8' });
  const strings = execFileSync('unzip', ['-p', join(root, 'export.xlsx'), 'xl/sharedStrings.xml'], { encoding: 'utf8' });
  assert(!/<f(?:\s|>)/.test(sheet), 'formula-leading CSV values must import as text');
  assert.equal((sheet.match(/<row\b/g) || []).length, inputs.length + 1, 'multiline and quoted fields remain single rows');
  const text = strings.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
  assert(text.includes('Unicode 中文')); assert(text.includes('first\nsecond')); assert(text.includes('=1+1'));
  console.log('[csv] LibreOffice imported formulas as text and preserved quotes, multiline fields and Unicode.');
} finally { rmSync(root, { recursive: true, force: true }); }
