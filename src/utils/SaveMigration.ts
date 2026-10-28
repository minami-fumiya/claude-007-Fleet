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
import { examPassed, finalAreas, RANKS, rankOf } from '@/systems/RankSystem';
import { currentBase, nationBases, nationPorts } from '@/systems/BaseSystem';

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
  // v16 → v17 (0.0.30, #86): the last remodel stage can take a branch (改三甲 / 乙 / 丙). Every ship already remodelled
  // keeps the standard stage it had: an empty branch list.
  (data) => mapNations(data, (nation) => ({ refitBranches: {}, ...nation })),
  // v17 → v18 (0.0.31, #181): sweeps bank up to three, one more an hour, instead of three a game day. Every area
  // already open for sweeping starts full, so no sweep usable before the update is lost. The service record splits
  // battles by kind (#177): the totals stay as they are, the split starts empty (shown as 区分なし).
  (data) => mapNations(withSplitRecord(data), (nation) => {
    const open = Array.isArray(nation.perfect) ? nation.perfect.filter((id): id is string => typeof id === 'string') : [];
    const sweepCharges = Object.fromEntries(open.map((id) => [id, { charges: 3, at: 0 }]));
    return { ...nation, sweepCharges: { ...sweepCharges, ...(typeof nation.sweepCharges === 'object' && nation.sweepCharges !== null ? nation.sweepCharges as RawSave : {}) } };
  }),
  // v18 → v19 (0.0.32, #183): ゴールド, shared by every nation. An existing admiral starts with 10 for each victory
  // in the record, so the shop is open from the first visit.
  (data) => {
    const record = typeof data.record === 'object' && data.record !== null ? data.record as RawSave : {};
    const wins = typeof record.victories === 'number' && Number.isFinite(record.victories) ? Math.max(0, Math.floor(record.victories)) : 0;
    return typeof data.wallet === 'object' && data.wallet !== null ? data : { ...data, wallet: { gold: wins * 10, earned: wins * 10, shop: { day: 0, bought: {} } } };
  },
  // v19 → v20 (0.0.34, #244): a new base starts with one dock instead of two. Every base already open keeps the two
  // (or more) it had: its count is written down, since a base without an entry now means one.
  (data) => mapNations(data, (nation, key) => {
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const campaign = Array.isArray(nation.campaign) ? (nation.campaign as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const before = typeof nation.baseDocks === 'object' && nation.baseDocks !== null ? nation.baseDocks as Record<string, unknown> : {};
    const open = Array.isArray(nation.basesOpen) ? (nation.basesOpen as unknown[]).filter((b): b is string => typeof b === 'string') : [];
    const home = currentBase(key, { campaign, merit: num(nation.merit), rankFloor: num(nation.rankFloor), nation: key, base: typeof nation.base === 'string' ? nation.base : '' })?.id;
    const bases = new Set([...Object.keys(before), ...open, ...(home ? [home] : [])]);
    const baseDocks = Object.fromEntries([...bases].map((b) => [b, Math.min(8, Math.max(2, num(before[b])))]));
    return { ...nation, baseDocks };
  }),
  // v20 → v21 (0.0.40, #304): 元帥 needs every area of the nation's theaters, no longer only their finals. An admiral
  // who made 元帥 the old way (the merit and every final) keeps the rank: it becomes their floor.
  (data) => mapNations(data, (nation, key) => {
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const campaign = Array.isArray(nation.campaign) ? (nation.campaign as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const finals = finalAreas(key);
    const marshal = RANKS[RANKS.length - 1];
    const wasMarshal = num(nation.merit) >= OLD_MIN_MERIT[marshal.index] && finals.length > 0 && finals.every((id) => campaign.includes(id));
    return wasMarshal ? { ...nation, rankFloor: Math.max(num(nation.rankFloor), marshal.index) } : nation;
  }),
  // v21 → v22 (0.0.42, #261 #322): four promotion missions per rank (one a medal) and more merit from 少将 on. The rank
  // held under the old rules (its merit, exams and the one mission per rank) becomes the floor, so nobody is demoted.
  (data) => mapNations(data, (nation, key) => {
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const campaign = Array.isArray(nation.campaign) ? (nation.campaign as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const stats = (typeof nation.rankStats === 'object' && nation.rankStats !== null ? nation.rankStats : {}) as Record<string, unknown>;
    const merit = num(nation.merit);
    const progress = { campaign, nation: key };
    let held = 0;
    for (const r of RANKS) {
      const [stat, goal] = OLD_RANK_MISSIONS[r.index] ?? ['', 0];
      if (merit < OLD_MIN_MERIT[r.index] || !examPassed(r, progress) || (stat && num(stats[stat]) < goal)) break;
      held = r.index;
    }
    // The new 海域攻略 mission counts first clears: those made so far count.
    const rankStats = { ...stats, areaClear: Math.max(num(stats.areaClear), new Set(campaign).size) };
    return { ...nation, rankStats, ...(held > num(nation.rankFloor) ? { rankFloor: held } : {}) };
  }),
  // v22 → v23 (0.0.50, #373): ports and forward bases apart. A port no longer opens a far sea; the forward base in that
  // sea does. Every sea a navy had open stays open: its forward base counts as built. The four ports that were forward
  // already (アイスランド・ラ・パリス・ペナン・トリンコマリー) become forward bases: their common facilities move to the
  // navy's ports (up to each one's top level), and the dock they gave goes to the home port.
  (data) => mapNations(data, (nation, key) => {
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const prefix = key.toLowerCase();
    const rename = (id: string): string => RENAMED_BASES[id] ?? id;
    const opened = Array.isArray(nation.basesOpen) ? (nation.basesOpen as unknown[]).filter((b): b is string => typeof b === 'string') : [];
    const seas = opened.map((id) => LEGACY_PORT_SEA[id]).filter((t): t is string => t !== undefined).map((t) => `${prefix}_fb_${t}`);
    const basesOpen = [...new Set([...opened.map(rename), ...seas])];
    const work = nation.baseWork as { base?: unknown; endsAt?: unknown } | null | undefined;
    const baseWork = work && typeof work.base === 'string' ? { ...work, base: rename(work.base) } : work ?? null;
    const ports = nationPorts(key).map((b) => b.id);
    const home = ports[0];
    const before = (typeof nation.facilities === 'object' && nation.facilities !== null ? nation.facilities : {}) as Record<string, Record<string, unknown>>;
    const facilities: Record<string, Record<string, number>> = {};
    for (const [b, levels] of Object.entries(before)) if (!RENAMED_BASES[b]) facilities[b] = { ...(levels as Record<string, number>) };
    for (const [old] of Object.entries(RENAMED_BASES).filter(([id]) => before[id])) {
      for (const [id, lv] of Object.entries(before[old])) {
        if (id === 'unique') continue;
        let left = num(lv);
        // Fill the ports in order, never past a facility's top level (Lv5).
        for (const port of ports) {
          if (left <= 0) break;
          const have = num(facilities[port]?.[id]);
          const add = Math.min(left, 5 - have);
          if (add > 0) facilities[port] = { ...(facilities[port] ?? {}), [id]: have + add };
          left -= Math.max(0, add);
        }
      }
    }
    const jobs = Array.isArray(nation.facilityJobs) ? (nation.facilityJobs as Array<Record<string, unknown>>) : [];
    const facilityJobs = jobs.filter((j) => !(typeof j.base === 'string' && RENAMED_BASES[j.base] && j.id === 'unique'))
      .map((j) => (typeof j.base === 'string' && RENAMED_BASES[j.base] && home ? { ...j, base: home } : j));
    const docks = (typeof nation.baseDocks === 'object' && nation.baseDocks !== null ? nation.baseDocks : {}) as Record<string, unknown>;
    const moved = Object.keys(RENAMED_BASES).filter((id) => opened.includes(id)).reduce((sum, id) => sum + Math.max(1, num(docks[id])), 0);
    // Docks belong to ports only (#373): forward ids that older steps listed carry none.
    const baseDocks = Object.fromEntries(Object.entries(docks).filter(([id]) => !RENAMED_BASES[id] && !id.includes('_fb_')));
    if (home && moved > 0) baseDocks[home] = Math.max(1, num(docks[home])) + moved;
    return { ...nation, basesOpen, baseWork, facilities, facilityJobs, baseDocks };
  }),
];

/** The ports that were forward bases before 0.0.50 (#373): their ids as forward bases. */
const RENAMED_BASES: Record<string, string> = { usn_iceland: 'usn_fb_arctic', km_lapallice: 'km_fb_south_atlantic', km_penang: 'km_fb_indian', rn_trinco: 'rn_fb_indian' };
/** The far sea each port opened before 0.0.50 (#373). */
const LEGACY_PORT_SEA: Record<string, string> = {
  ijn_light: 'north_pacific', ijn_cruiser: 'indian', ijn_heavy: 'mediterranean',
  usn_light: 'north_pacific', usn_cruiser: 'pacific', usn_heavy: 'south_atlantic',
  km_light: 'atlantic', km_cruiser: 'arctic', km_heavy: 'mediterranean',
  rn_light: 'arctic', rn_cruiser: 'mediterranean', rn_heavy: 'south_atlantic',
  fr_light: 'atlantic', fr_cruiser: 'south_atlantic', fr_heavy: 'indian',
  rm_light: 'atlantic', rm_cruiser: 'south_atlantic', rm_heavy: 'indian',
  su_light: 'north_pacific', su_cruiser: 'blacksea', su_heavy: 'arctic',
};

/** The merit of each rank before 0.0.42 (#322) */
const OLD_MIN_MERIT = [0, 30, 80, 150, 250, 350, 500, 650, 850, 1000, 1300, 1650, 2050, 2500];
/** The one promotion mission of a rank before 0.0.42 (#142): its counter and goal */
const OLD_RANK_MISSIONS: Partial<Record<number, [string, number]>> = {
  2: ['campaignWin', 1], 3: ['sink', 20], 4: ['nightWin', 1], 6: ['sinkCarrier', 1], 7: ['objectiveWin', 1], 8: ['bigS', 1],
  10: ['sinkSubmarine', 10], 11: ['sinkBattleship', 5], 12: ['sweep', 20],
};

/** The v18 record (#177): totals kept, an empty split by kind of battle and by scenario. */
function withSplitRecord(data: RawSave): RawSave {
  const record = data.record;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return data;
  return { ...data, record: { byMode: {}, scenarios: {}, ...(record as RawSave) } };
}

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
