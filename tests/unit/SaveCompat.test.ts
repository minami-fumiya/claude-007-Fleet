import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { listBackups, loadSave, parseSaveChecked, resetProgressCache, SAVE_VERSION, STORAGE_KEY } from '@/utils/ProgressStore';
import { addBackup, backupLabel, ISaveBackup, MAX_BACKUPS, parseBackups, rawVersion } from '@/utils/SaveBackup';
import { fleetSlots } from '@/systems/RankSystem';
import { nationCaptains } from '@/systems/CaptainRoster';
import { Nation } from '@/types/Nation';

/**
 * Save compatibility (CLAUDE.md "セーブデータを消さない"): every released version's save in tests/fixtures/saves
 * must load in this build without losing ships, resources, cleared areas, research, captains or slots.
 * A release that changes the save format adds its own fixture here.
 */
const DIR = join(__dirname, '..', 'fixtures', 'saves');
const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

describe('every released save loads without losing progress', () => {
  it('has a fixture for each save version up to this one', () => {
    const versions = new Set(fixtures.map((f) => rawVersion(readFileSync(join(DIR, f), 'utf8'))));
    for (let v = 1; v <= SAVE_VERSION; v++) expect(versions, `save v${v}`).toContain(v);
  });

  for (const file of fixtures) {
    it(file, () => {
      const raw = readFileSync(join(DIR, file), 'utf8');
      const stored = JSON.parse(raw) as Record<string, unknown>;
      const { save, ok } = parseSaveChecked(raw);
      expect(ok).toBe(true);
      expect(save.version).toBe(SAVE_VERSION);
      // v1 was one flat progress object (the IJN's); v2+ keeps one slot per nation.
      const before = (stored.nations ?? { IJN: stored }) as Record<string, Record<string, unknown>>;
      for (const [nation, old] of Object.entries(before)) {
        const np = save.nations[nation as Nation];
        expect(np, nation).toBeDefined();
        for (const id of (old.ships as string[] | undefined) ?? []) expect(np!.ships, `${nation} ship ${id}`).toContain(id);
        expect(np!.campaign).toEqual(expect.arrayContaining((old.campaign as string[]) ?? []));
        expect(np!.research).toEqual(expect.arrayContaining((old.research as string[]) ?? []));
        expect(np!.captainXp).toEqual(expect.objectContaining((old.captainXp as Record<string, number>) ?? {}));
        // Captains: every one the nation could assign before ownership (#44), and every learned skill.
        const ownedBefore = Array.isArray(old.captains) ? (old.captains as string[]) : nationCaptains(nation).map((c) => c.id);
        expect(np!.captains).toEqual(expect.arrayContaining(ownedBefore));
        expect(np!.captainSkills).toEqual(expect.objectContaining((old.captainSkills as Record<string, string[]>) ?? {}));
        const res = old.resources as Record<string, number> | undefined;
        if (res) for (const k of ['fuel', 'ammo', 'steel', 'bauxite'] as const) expect(np!.resources[k], `${nation} ${k}`).toBeGreaterThanOrEqual(res[k] ?? 0);
        // Slots never shrink: saves from before merit ranks (v5) keep what the old six-rank table gave.
        if (rawVersion(raw) >= 5) continue;
        const clears = new Set((old.campaign as string[]) ?? []).size;
        const oldSlots = [0, 1, 2, 4, 7, 10].filter((min) => clears >= min).length;
        expect(fleetSlots({ ...np!, nation }), `${nation} slots`).toBeGreaterThanOrEqual(oldSlots);
      }
    });
  }
});

describe('save backups', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProgressCache();
  });

  it('backs up an older save before migrating it, and an unreadable one before replacing it', () => {
    const old = readFileSync(join(DIR, fixtures.find((f) => f.includes('0.0.8'))!), 'utf8');
    localStorage.setItem(STORAGE_KEY, old);
    loadSave();
    expect(listBackups().map((b) => [b.reason, b.raw === old])).toEqual([['migration', true]]);

    localStorage.clear();
    resetProgressCache();
    localStorage.setItem(STORAGE_KEY, '{broken');
    loadSave();
    expect(listBackups()[0]).toMatchObject({ reason: 'broken', raw: '{broken', version: 0 });
  });

  it('a current save is not backed up on every load', () => {
    const newest = fixtures.map((f) => readFileSync(join(DIR, f), 'utf8')).find((raw) => rawVersion(raw) === SAVE_VERSION)!;
    localStorage.setItem(STORAGE_KEY, newest);
    loadSave();
    expect(listBackups()).toEqual([]);
  });

  it('keeps the newest few and skips duplicates; labels name date, version and reason', () => {
    let list: ISaveBackup[] = [];
    for (let i = 0; i < MAX_BACKUPS + 3; i++) list = addBackup(list, { at: i, version: 4, reason: 'migration', raw: `r${i}` });
    expect(list).toHaveLength(MAX_BACKUPS);
    expect(list[0].raw).toBe(`r${MAX_BACKUPS + 2}`);
    expect(addBackup(list, { ...list[0], at: 99 })).toBe(list);
    expect(parseBackups(JSON.stringify(list))).toEqual(list);
    expect(parseBackups('nope')).toEqual([]);
    expect(backupLabel({ at: Date.UTC(2026, 0, 2), version: 4, reason: 'reset', raw: '' })).toContain('v4 · リセット前');
  });
});
