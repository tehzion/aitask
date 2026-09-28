import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = new URL('../src/', import.meta.url);
const strict = process.argv.includes('--strict');
const ignoredFiles = new Set(['i18n.ts', 'i18n.test.ts']);
const uiAttributes = new Set(['aria-label', 'aria-description', 'placeholder', 'title', 'alt']);
const messageCalls = new Set(['t', 'msg', 'formatMessage']);
const effectCalls = new Set(['addToast', 'setError', 'setStatusError', 'setErrorMessage', 'confirm', 'alert']);
const intentionalRawUiText = new Set(['AT', 'AiTask', 'Facebook', 'Boss Koo']);
const hasWords = value => /[A-Za-z]{2,}/.test(value) && !/^https?:\/\//.test(value);

const filesIn = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !ignoredFiles.has(entry.name) && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.test.ts')) files.push(path);
  }
  return files;
};

const isSkipped = node => {
  for (let current = node; current; current = current.parent) {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      const attributes = ts.isJsxElement(current)
        ? current.openingElement.attributes.properties
        : current.attributes.properties;
      if (attributes.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'data-i18n-skip')) return true;
    }
  }
  return false;
};

const isMessageCall = node => ts.isCallExpression(node) && (
  (ts.isIdentifier(node.expression) && messageCalls.has(node.expression.text))
  || (ts.isPropertyAccessExpression(node.expression) && messageCalls.has(node.expression.name.text))
);

const literalText = node => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join('{value}');
  return null;
};

const auditFile = (fileName, sourceText) => {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const report = (node, kind, value) => {
    if (!hasWords(value)) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ file: relative(new URL('../', import.meta.url).pathname, fileName), line: position.line + 1, kind, value: value.replace(/\s+/g, ' ').trim().slice(0, 140) });
  };

  const visit = node => {
    if (ts.isJsxText(node)) {
      const value = node.getText(source);
      if (hasWords(value) && !intentionalRawUiText.has(value.trim())) report(node, isSkipped(node) ? 'mixed-or-skipped JSX text' : 'raw JSX text', value);
    }
    if (ts.isJsxAttribute(node) && uiAttributes.has(node.name.text) && node.initializer) {
      const value = ts.isStringLiteral(node.initializer)
        ? node.initializer.text
        : ts.isJsxExpression(node.initializer) && node.initializer.expression ? literalText(node.initializer.expression) : null;
      if (value && !isSkipped(node)) report(node, 'raw accessible attribute', value);
    }
    if (ts.isCallExpression(node) && !isMessageCall(node)) {
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      if (effectCalls.has(name) && node.arguments.length > 0) {
        const value = literalText(node.arguments[0]);
        if (value) report(node.arguments[0], `raw ${name} message`, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
};

const files = await filesIn(new URL('../src/', import.meta.url).pathname);
const findings = (await Promise.all(files.map(async file => auditFile(file, await readFile(file, 'utf8'))))).flat();

console.log(`i18n AST audit: ${findings.length} finding(s) across ${files.length} source files.`);
for (const finding of findings.slice(0, 120)) {
  console.log(`${finding.file}:${finding.line} [${finding.kind}] ${finding.value}`);
}
if (findings.length > 120) console.log(`… ${findings.length - 120} additional finding(s) omitted.`);
if (strict && findings.length > 0) process.exitCode = 1;
