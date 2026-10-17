import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { UI_GLYPHS } from '@/ui/fontGlyphs';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|json)$/.test(name) ? [path] : [];
  });
}

describe('UI_GLYPHS', () => {
  it('covers every non-ASCII character used in src/', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(__dirname, '../../src'))) {
      for (const ch of readFileSync(file, 'utf8')) {
        if (ch.codePointAt(0)! > 0x7f) used.add(ch);
      }
    }
    const missing = [...used].filter((ch) => !UI_GLYPHS.includes(ch)).sort().join('');
    expect(missing, `Add these characters to src/ui/fontGlyphs.ts: ${missing}`).toBe('');
  });
});
