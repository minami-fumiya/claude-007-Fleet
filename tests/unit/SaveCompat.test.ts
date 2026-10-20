import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { emptySave, listBackups, loadSave, parseSaveChecked, resetProgressCache, SAVE_VERSION, STORAGE_KEY } from '@/utils/ProgressStore';
import { addBackup, backupLabel, ISaveBackup, MAX_BACKUPS, parseBackups, rawVersion } from '@/utils/SaveBackup';
import { fleetSlots } from '@/systems/RankSystem';
import { nationCaptains } from '@/systems/CaptainRoster';
import { validLearned, withProgress } from '@/systems/CaptainSystem';
import { Nation } from '@/types/Nation';
import { CaptainSkill } from '@/types/Captain';
import { EXISTING_PLAYER_HELP } from '@/utils/SaveMigration';
import { baseRankMet, currentBase, isBaseOpen, nationBases } from '@/systems/BaseSystem';

/**
 * Save compatibility (CLAUDE.md "セーブデータを消さない"): every released version's save in tests/fixtures/saves
 * must load in this build without losing ships, resources, cleared areas, research, captains or slots.
 * A release that changes the save format adds its own fixture here.
 */
const DIR = join(__dirname, '..', 'fixtures', 'saves');
const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

describe('every released save loads without losing progress', () => {
  // During the alpha a release need not add its own fixture (2026-10-20): the ones kept still load, up to v19.
  it('has a fixture for each save version up to v19 (0.0.33)', () => {
    const versions = new Set(fixtures.map((f) => rawVersion(readFileSync(join(DIR, f), 'utf8'))));
    for (let v = 1; v <= Math.min(SAVE_VERSION, 19); v++) expect(versions, `save v${v}`).toContain(v);
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
      // First-visit help (#61): a save from before it knows every screen; a newer one keeps its list.
      expect(save.seenHelp).toEqual(expect.arrayContaining(Array.isArray(stored.seenHelp) ? (stored.seenHelp as string[]) : [...EXISTING_PLAYER_HELP]));
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
        if (typeof old.base === 'string') expect(np!.base, `${nation} base`).toBe(old.base);
        // 対空 (#185): every captain whose 航空 covered air defence keeps it as a carried-over skill.
        if (rawVersion(raw) < 16) {
          const aviators = np!.captains.filter((id) => nationCaptains(nation).find((c) => c.id === id)?.skill === CaptainSkill.Aviation);
          const learnedAv = Object.entries(np!.captainSkills).filter(([, v]) => v.includes(CaptainSkill.Aviation)).map(([id]) => id);
          for (const id of [...aviators, ...learnedAv]) expect(np!.captainBonus[id], `${nation} ${id} 対空`).toContain(CaptainSkill.AntiAir);
        }
        // Bases (#217): every base the rank had opened before 0.0.28 counts as built, the current one included.
        if (rawVersion(raw) < 15) {
          for (const b of nationBases(nation)) if (baseRankMet(b, { ...np!, nation })) expect(isBaseOpen(b, np!), `${nation} ${b.id}`).toBe(true);
          if (typeof old.base === 'string' && old.base) expect(currentBase(nation, np!)?.id, `${nation} current base`).toBe(old.base);
        }
        // Sweepable areas (#57) and quest progress / claimed rewards (#52) stay.
        expect(np!.perfect).toEqual(expect.arrayContaining((old.perfect as string[]) ?? []));
        const quests = old.quests as { progress?: Record<string, number>; claimed?: string[] } | undefined;
        if (quests) expect(np!.quests.claimed).toEqual(expect.arrayContaining(quests.claimed ?? []));
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptySave()));
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

describe('captain skills learned before #187 moved the slot levels', () => {
  it('a Lv4 captain keeps the skill learned in the old Lv3 slot', () => {
    const { save } = parseSaveChecked(readFileSync(join(DIR, 'save-0.0.25.json'), 'utf8'));
    const np = save.nations.IJN!;
    const murase = withProgress(nationCaptains('IJN').find((c) => c.id === 'ijn_murase')!, np.captainXp.ijn_murase);
    expect(murase.level).toBeLessThan(5);
    expect(validLearned(murase, np.captainSkills.ijn_murase)).toEqual(['ASW']);
  });
});

describe('v13 (#199): 艦長教本 and captains own sinkings', () => {
  it('a 0.0.25 save gets no books and keeps every trait count it had', () => {
    const raw = readFileSync(join(DIR, 'save-0.0.25.json'), 'utf8');
    const before = JSON.parse(raw).nations.IJN.captainStats.ijn_sakai;
    const { save } = parseSaveChecked(raw);
    const np = save.nations.IJN!;
    expect(np.items.captainBook).toBe(0);
    expect(np.captainStats.ijn_sakai).toEqual({ ...before, sinks: 0 });
  });
});

describe('v14 (#211): builds share the docks', () => {
  it('a 0.0.26 base keeps room for as many jobs as it ran before (docks + slips)', () => {
    const { save } = parseSaveChecked(readFileSync(join(DIR, 'save-0.0.26.json'), 'utf8'));
    const np = save.nations.IJN!;
    // Two docks before; one slip at its rank: three jobs at once, now all in docks.
    expect(np.baseDocks.ijn_light).toBeGreaterThanOrEqual(3);
    expect(np.builds.map((b) => b.shipId)).toEqual(['i19']);
  });
});
