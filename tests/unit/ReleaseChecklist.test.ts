import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CHANGELOG, compareVersions } from '@/systems/Changelog';

/**
 * What every release must bring (#207, CLAUDE.md「セーブデータを消さない」): forgetting one fails CI with what to add.
 */
const ROOT = process.cwd();
const VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const SHORT = VERSION.replace(/-alpha(\.\d+)?$/, (_m, patch: string | undefined) => patch ?? '');
const SAVES = join(ROOT, 'tests', 'fixtures', 'saves');
/** During the alpha a release needs no save fixture of its own (CLAUDE.md, 2026-10-20); from the beta on it does. */
const SAVES_REQUIRED = !VERSION.includes('alpha');

describe(`release checklist for ${VERSION} (#207)`, () => {
  it('has a save fixture made with this version (from the beta on)', () => {
    if (!SAVES_REQUIRED) return;
    const file = `save-${SHORT}.json`;
    expect(existsSync(join(SAVES, file)), `tests/fixtures/saves/${file} を追加してください (この版のコードで作ったセーブ)`).toBe(true);
  });

  it('has its 更新内容 for the title screen', () => {
    expect(CHANGELOG.some((e) => e.version === VERSION), `src/data/changelog.json に ${VERSION} の更新内容を追加してください`).toBe(true);
  });

  it('docs/VERSIONS.md names it as the released version and lists it', () => {
    const doc = readFileSync(join(ROOT, 'docs', 'VERSIONS.md'), 'utf8');
    expect(doc, `docs/VERSIONS.md の「現在の位置」の公開中を **${VERSION}** にしてください`).toMatch(new RegExp(`公開中[^\\n]*\\*\\*${VERSION.replace(/\./g, '\\.')}\\*\\*`));
    expect(doc, `docs/VERSIONS.md の一覧に ${VERSION} の行を追加してください`).toContain(`| ${VERSION} |`);
  });

  it('has its balance review (#223), from 0.0.27 on', () => {
    if (compareVersions(VERSION, '0.0.27-alpha') < 0) return;
    expect(existsSync(join(ROOT, 'docs', 'balance', `${SHORT}.md`)), `docs/balance/${SHORT}.md にバランス確認の結果を書いてください (CLAUDE.md「版ごとのバランス確認」)`).toBe(true);
  });

  it('the E2E reads the previous version\'s save (from the beta on)', () => {
    if (!SAVES_REQUIRED) return;
    const versions = readdirSync(SAVES).map((f) => /^save-(.+)\.json$/.exec(f)?.[1]).filter((v): v is string => !!v).sort(compareVersions);
    const previous = versions[versions.indexOf(SHORT) - 1];
    const spec = readFileSync(join(ROOT, 'tests', 'e2e', 'screens.spec.ts'), 'utf8');
    expect(spec, `tests/e2e/screens.spec.ts の PREVIOUS_SAVE を save-${previous}.json にしてください`).toContain(`'save-${previous}.json'`);
  });
});
