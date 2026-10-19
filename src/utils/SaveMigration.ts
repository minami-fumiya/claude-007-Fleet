/**
 * Step-by-step save migrations (#60, pure). Each step turns a stored save of version n into version n + 1, working
 * on the raw JSON object before it is parsed, so a change to the save format is one function appended here plus a
 * test with an old save. Steps must never drop owned ships, captains, resources or progress.
 *
 * Version 2 (the per-nation save, #27) is where the steps begin; v1 saves are first converted to v2 by
 * ProgressStore.migrateV1 and then run through the same steps.
 */

import { ALL_CAPTAINS, nationCaptains } from '@/systems/CaptainRoster';
import { CaptainSkill } from '@/types/Captain';
import { rankOf } from '@/systems/RankSystem';
import { currentBase, nationBases } from '@/systems/BaseSystem';

export type RawSave = Record<string, unknown>;
/** Turns a raw save of version `n` into version `n + 1` (the version field is set by the runner). */
export type MigrationStep = (data: RawSave) => RawSave;

/** The first version the steps start from. */
export const FIRST_VERSION = 2;

/**
 * MIGRATIONS[i] migrates version FIRST_VERSION + i → FIRST_VERSION + i + 1. Append new steps at the end; never
 * reorder or edit a released one.
 */
/** Screens with first-visit help when it was added (0.0.14); a player from before then has seen them all. */
export const EXISTING_PLAYER_HELP: readonly string[] = [
  'HomeScene', 'FleetBuilderScene', 'CampaignMapScene', 'ScenarioScene', 'ArsenalScene', 'ShipyardScene',
  'CustomizationScene', 'EncyclopediaScene', 'RecordScene',
];

export const MIGRATIONS: MigrationStep[] = [
  // v2 → v3 (#37): cruiser research split into light and heavy; whoever could build cruisers keeps both.
  (data) => mapNations(data, (nation) => {
    const research = Array.isArray(nation.research) ? nation.research : [];
    return research.includes('build_cruiser') && !research.includes('build_heavy_cruiser')
      ? { ...nation, research: [...research, 'build_heavy_cruiser'] }
      : nation;
  }),
  // v3 → v4 (#72): upgrade slots now come with remodelling (none / 2 / 3 / 4 by stage), and every upgrade needs its
  // research (強装薬 used to need none). Upgrades beyond the slots or not yet researched come off.
  (data) => mapNations(data, (nation) => {
    const slotsByStage = [0, 2, 3, 4];
    const needs: Record<string, string> = {
      fire_director: 'fire_control', heavy_shells: 'gunnery_1', torpedo_mod: 'torpedo_1', extra_armor: 'armor_1',
      boiler: 'engine_1', damage_control: 'damage_control_1', radar: 'radar_1', aa_guns: 'aa_1',
    };
    const research = Array.isArray(nation.research) ? nation.research : [];
    const researched = (id: unknown): boolean => typeof id !== 'string' || !needs[id] || research.includes(needs[id]);
    const upgrades = nation.upgrades;
    if (typeof upgrades !== 'object' || upgrades === null || Array.isArray(upgrades)) return nation;
    const refits = (typeof nation.refits === 'object' && nation.refits !== null ? nation.refits : {}) as Record<string, unknown>;
    const out: RawSave = {};
    for (const [shipId, list] of Object.entries(upgrades as RawSave)) {
      const stage = typeof refits[shipId] === 'number' ? (refits[shipId] as number) : 0;
      const slots = slotsByStage[Math.max(0, Math.min(stage, slotsByStage.length - 1))];
      out[shipId] = Array.isArray(list) ? list.filter(researched).slice(0, slots) : list;
    }
    return { ...nation, upgrades: out };
  }),
  // v4 → v5 (#36 / #38 / #90): rank from merit (戦功) instead of cleared areas, docks bought one by one, a tutorial.
  // Each nation keeps its old slots and buildable grade (rankFloor), gets 100 merit per area already cleared and
  // keeps the two docks it had; the tutorial counts as done for an existing player.
  (data) => ({
    ...mapNations(data, (nation) => {
      const clears = new Set(Array.isArray(nation.campaign) ? nation.campaign : []).size;
      const oldRank = [0, 1, 2, 4, 7, 10].filter((min) => clears >= min).length - 1;
      return { ...nation, merit: clears * 100, rankFloor: [2, 2, 4, 7, 9, 11][Math.max(0, oldRank)], docksOwned: 2 };
    }),
    tutorial: { step: 0, done: true },
  }),
  // v5 → v6 (#44 / #45): captains are owned per nation; learned skills and trait stats start empty. Every nation
  // keeps all its captains (before this, all of them could be assigned).
  (data) => mapNations(data, (nation, key) => ({
    ...nation,
    captains: nationCaptains(key).map((c) => c.id),
    captainSkills: {},
    captainStats: {},
  })),
  // v6 → v7 (#61 / #88): the screens an existing player already knows skip their first-visit help; every nation
  // works from its first base ('' = the nation's first).
  (data) => mapNations({ ...data, seenHelp: [...EXISTING_PLAYER_HELP] }, (nation) => ({ ...nation, base: '' })),
  // v7 → v8 (#52 #57 #89): no quest progress yet, no area to sweep yet (a perfect win from now on opens it), and
  // the event clock guard starts at 0.
  (data) => mapNations({ ...data, lastSeenAt: 0 }, (nation) => ({ ...nation, quests: { day: 0, week: 0, progress: {}, claimed: [] }, perfect: [] })),
  // v8 → v9 (#57): sweeps are counted per area and game day; nothing used yet.
  (data) => mapNations(data, (nation) => ({ ...nation, sweeps: { day: 0, counts: {} } })),
  // v9 → v10 (0.0.19): building takes time now (#143; nothing under construction yet) and repairs got slower, so
  // every nation gets two of each time-saving item. Areas get a best battle rank (#149): a perfect win counts as S.
  // Promotion missions (#142) start uncounted, so each nation keeps the rank it holds as its floor. The resource
  // ledger (#137) starts empty, and no sortie is in progress (#138).
  (data) => mapNations(data, (nation, key) => {
    const campaign = (Array.isArray(nation.campaign) ? nation.campaign : []).filter((id): id is string => typeof id === 'string');
    const merit = typeof nation.merit === 'number' ? nation.merit : 0;
    const floor = typeof nation.rankFloor === 'number' ? nation.rankFloor : 0;
    const held = rankOf({ campaign, merit, rankFloor: floor, nation: key }, false).index;
    return {
      ...nation,
      builds: [],
      items: { fastRepair: 2, fastBuild: 2 },
      areaRanks: Object.fromEntries((Array.isArray(nation.perfect) ? nation.perfect : []).filter((id) => typeof id === 'string').map((id) => [id, 'S'])),
      rankStats: {},
      rankFloor: Math.max(floor, held),
      ledger: {},
      sortie: null,
    };
  }),
  // v10 → v11 (0.0.20, #145 / #146): ships, repair docks and builds belong to a base. Everything goes to the base in use, so
  // the fleet, the docks built and the ships under repair or construction stay where the player left them.
  (data) => mapNations(data, (nation, key) => {
    const campaign = (Array.isArray(nation.campaign) ? nation.campaign : []).filter((id): id is string => typeof id === 'string');
    const rankStats = typeof nation.rankStats === 'object' && nation.rankStats !== null ? nation.rankStats as Record<string, number> : {};
    const here = currentBase(key, {
      campaign, merit: typeof nation.merit === 'number' ? nation.merit : 0, rankFloor: typeof nation.rankFloor === 'number' ? nation.rankFloor : 0,
      rankStats, nation: key, base: typeof nation.base === 'string' ? nation.base : '',
    })?.id ?? '';
    const ships = (Array.isArray(nation.ships) ? nation.ships : []).filter((id): id is string => typeof id === 'string');
    const atHere = (jobs: unknown): unknown => (Array.isArray(jobs) ? jobs.map((j) => (typeof j === 'object' && j !== null ? { ...j, base: here } : j)) : jobs);
    return {
      ...nation,
      shipBases: Object.fromEntries(ships.map((id) => [id, here])),
      baseDocks: { [here]: typeof nation.docksOwned === 'number' ? nation.docksOwned : 1 },
      docks: atHere(nation.docks),
      builds: atHere(nation.builds),
      // Base facilities (#146) start unbuilt: regeneration stays as it was.
      facilities: {},
      facilityJobs: [],
    };
  }),
  // v11 → v12 (0.0.22, #158): quests gain an hourly period and lifetime event totals. Totals start from what the save
  // already counts (promotion-mission stats and the one-time quests' progress), so long-running goals keep their count.
  (data) => mapNations(data, (nation) => {
    const quests = typeof nation.quests === 'object' && nation.quests !== null ? nation.quests as RawSave : {};
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    const stats = typeof nation.rankStats === 'object' && nation.rankStats !== null ? nation.rankStats as RawSave : {};
    const progress = typeof quests.progress === 'object' && quests.progress !== null ? quests.progress as RawSave : {};
    const totals: Record<string, number> = {};
    const seed = (event: string, n: number): void => {
      if (n > (totals[event] ?? 0)) totals[event] = n;
    };
    seed('sink', num(stats.sink));
    seed('campaignWin', num(stats.campaignWin));
    seed('nightWin', num(stats.nightWin));
    seed('win', num(progress.a_win50));
    seed('build', num(progress.a_build));
    seed('research', num(progress.a_research));
    seed('refit', num(progress.a_refit));
    seed('sweep', Math.max(num(progress.a_sweep), num(stats.sweep)));
    seed('sinkBattleship', num(progress.a_battleship));
    return { ...nation, quests: { ...quests, hour: 0, totals } };
  }),
  // v12 → v13 (0.0.26, #199): items gain 艦長教本 (a recruit once every captain has joined), captains' stats count what
  // their own ship sank. Both start at 0; nothing a captain has already counted is taken away.
  (data) => mapNations(data, (nation) => {
    const items = typeof nation.items === 'object' && nation.items !== null ? nation.items as RawSave : {};
    const stats = typeof nation.captainStats === 'object' && nation.captainStats !== null ? nation.captainStats as Record<string, unknown> : {};
    const captainStats = Object.fromEntries(Object.entries(stats).map(([id, v]) => [id, typeof v === 'object' && v !== null ? { sinks: 0, ...(v as RawSave) } : v]));
    return { ...nation, items: { captainBook: 0, ...items }, captainStats };
  }),
  // v13 → v14 (0.0.27, #211): builds take a base's docks too, instead of separate slips the rank opened (1 / 2 at 少佐 /
  // 3 at 大佐). Each base gets its docks plus the slips it had, so it can run as many jobs at once as before (max 8).
  (data) => mapNations(data, (nation, key) => {
    const campaign = Array.isArray(nation.campaign) ? (nation.campaign as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const rank = rankOf({ campaign, merit: num(nation.merit), rankFloor: num(nation.rankFloor), nation: key, rankStats: (nation.rankStats ?? {}) as Record<string, number> }, false).index;
    const slips = [0, 6, 8].filter((r) => rank >= r).length;
    const before = typeof nation.baseDocks === 'object' && nation.baseDocks !== null ? nation.baseDocks as Record<string, unknown> : {};
    const home = currentBase(key, { campaign, merit: num(nation.merit), rankFloor: num(nation.rankFloor), nation: key, base: typeof nation.base === 'string' ? nation.base : '' })?.id;
    const bases = new Set([...Object.keys(before), ...(home ? [home] : [])]);
    const baseDocks = Object.fromEntries([...bases].map((b) => [b, Math.min(8, Math.max(2, (num(before[b]) || 1) + slips))]));
    return { ...nation, baseDocks };
  }),
  // v14 → v15 (0.0.28, #217): bases beyond the first are built once their rank is reached, no longer opened by the
  // rank alone. Every base the rank had already opened counts as built, and so does the one the admiral is at.
  (data) => mapNations(data, (nation, key) => {
    const campaign = Array.isArray(nation.campaign) ? (nation.campaign as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const rank = rankOf({ campaign, merit: num(nation.merit), rankFloor: num(nation.rankFloor), nation: key, rankStats: (nation.rankStats ?? {}) as Record<string, number> }, false).index;
    const list = nationBases(key);
    const opened = list.slice(1).filter((b) => rank >= b.unlockRank || b.id === nation.base).map((b) => b.id);
    return { ...nation, basesOpen: opened, baseWork: null };
  }),
  // v15 → v16 (0.0.29, #185): 航空 no longer covers air defence, which became the 対空 skill. Captains whose 航空
  // (their speciality or a learned skill) gave them air defence get 対空 carried over outside their learn slots, so
  // nobody's ships shoot down fewer planes than before.
  (data) => mapNations(data, (nation) => {
    const owned = Array.isArray(nation.captains) ? (nation.captains as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const learned = typeof nation.captainSkills === 'object' && nation.captainSkills !== null ? nation.captainSkills as Record<string, unknown> : {};
    const aviators = new Set([
      ...owned.filter((id) => ALL_CAPTAINS.find((c) => c.id === id)?.skill === CaptainSkill.Aviation),
      ...Object.entries(learned).filter(([, v]) => Array.isArray(v) && v.includes(CaptainSkill.Aviation)).map(([id]) => id),
    ]);
    const before = typeof nation.captainBonus === 'object' && nation.captainBonus !== null ? nation.captainBonus as Record<string, unknown> : {};
    const captainBonus: Record<string, unknown> = { ...before };
    for (const id of aviators) captainBonus[id] = [...new Set([...(Array.isArray(before[id]) ? before[id] as string[] : []), CaptainSkill.AntiAir])];
    return { ...nation, captainBonus };
  }),
];

/** Applies `fn` to every nation slot of a raw v2+ save, leaving anything malformed alone. */
function mapNations(data: RawSave, fn: (nation: RawSave, key: string) => RawSave): RawSave {
  const nations = data.nations;
  if (typeof nations !== 'object' || nations === null || Array.isArray(nations)) return data;
  const out: RawSave = {};
  for (const [key, value] of Object.entries(nations as RawSave)) {
    out[key] = typeof value === 'object' && value !== null && !Array.isArray(value) ? fn(value as RawSave, key) : value;
  }
  return { ...data, nations: out };
}

/** The version written by this build. */
export const LATEST_VERSION = FIRST_VERSION + MIGRATIONS.length;

/** The stored version of a raw save (missing or malformed counts as FIRST_VERSION). */
export function versionOf(data: RawSave): number {
  const v = data.version;
  return typeof v === 'number' && Number.isInteger(v) && v >= FIRST_VERSION ? v : FIRST_VERSION;
}

/**
 * Runs every step from the save's version up to the latest. A save from a newer build (version above the latest)
 * is passed through untouched, so the parser keeps whatever it still understands.
 */
export function runMigrations(data: RawSave, steps: MigrationStep[] = MIGRATIONS): RawSave {
  const latest = FIRST_VERSION + steps.length;
  const from = versionOf(data);
  if (from >= latest) return data;
  let out = data;
  for (let v = from; v < latest; v++) out = { ...steps[v - FIRST_VERSION](out), version: v + 1 };
  return out;
}
