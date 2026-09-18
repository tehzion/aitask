import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Palette families that must be remapped by the alias layer in index.css so the
// light and dark themes stay consistent. A color utility from one of these
// families must either appear in index.css or be listed in ALLOWLIST.
const PALETTE_FAMILIES = new Set([
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'white', 'black',
]);

const PREFIX = /^(?:bg|text|border|ring|ring-offset|divide|from|via|to|placeholder|fill|stroke|outline|decoration|caret|accent|shadow)-/;
const TOKEN_PATTERN = /\b(?:bg|text|border|ring|ring-offset|divide|from|via|to|placeholder|fill|stroke|outline|decoration|caret|accent|shadow)-[a-z]+(?:-\d{2,3})?(?:\/\d+)?/g;

// Intentional raw-Tailwind usages that do not need a theme alias:
// decorative dots/fills, explicit dark-mode companions, translucent overlays on
// colored/dark surfaces, colored shadows, and mid-tone text/icons on dark
// backgrounds. Keep this list small and justified.
const ALLOWLIST = new Set([
  'bg-amber-200/50', 'bg-amber-400', 'bg-amber-950/30',
  'bg-indigo-50/60',
  'bg-blue-200/50', 'bg-blue-400', 'bg-blue-500',
  'bg-emerald-400', 'bg-pink-400', 'bg-purple-500', 'bg-violet-400',
  'bg-red-950/30', 'bg-slate-950/35', 'bg-slate-950/45',
  'bg-white/10', 'bg-white/15', 'bg-white/35',
  'border-amber-800/70', 'border-amber-900/70',
  'border-red-100/70', 'border-red-900/70', 'border-slate-700',
  'ring-white/10',
  'shadow-amber-50/40', 'shadow-blue-50/40', 'shadow-emerald-50/40',
  'shadow-red-50/40', 'shadow-slate-950/10', 'shadow-slate-950/20',
  'text-amber-100', 'text-amber-200', 'text-amber-500',
  'text-amber-950',
  'text-blue-500', 'text-emerald-500', 'text-red-100', 'text-red-400',
  'text-red-500', 'text-sky-300', 'text-slate-100',
  'text-white/65', 'text-white/70', 'text-white/80',
]);

const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
};

const paletteFamilyOf = (token: string) => token
  .replace(PREFIX, '')
  .replace(/-\d{2,3}(?:\/\d+)?$/, '')
  .replace(/\/.*$/, '');

describe('theme alias coverage', () => {
  it('remaps every palette color utility or documents it as an intentional exception', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');
    const files = collectSourceFiles(join(process.cwd(), 'src'))
      .filter(file => !/\.test\.tsx?$/.test(file));

    const used = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.match(TOKEN_PATTERN) ?? []) used.add(match);
    }

    const uncovered = [...used]
      .filter(token => {
        if (!PALETTE_FAMILIES.has(paletteFamilyOf(token))) return false;
        if (css.includes(token)) return false;
        return !ALLOWLIST.has(token);
      })
      .sort();

    expect(uncovered).toEqual([]);
  });
});
