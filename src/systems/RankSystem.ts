import campaignData from '@/data/campaign.json';
import { MEDALS } from './RecordSystem';
import { theaterFinalArea } from './CampaignSystem';

/**
 * Admiral rank (#30 / #36, pure). Each nation climbs 14 ranks, from 士官候補生 to 元帥, with merit (戦功) earned in
 * battle — mostly first clears of campaign areas, a little from repeat sorties and exercises. Two ranks also need a
 * promotion exam: 准将 a theater's final area, 元帥 every final area of the nation's theaters. The rank sets the
 * number of fleet slots (#25, up to 8), the grade of ship the shipyard may build (#29), formations (#59) and docks
 * (#38). Saves from before the merit system keep their old slots through `rankFloor` (see SaveMigration v4 → v5).
 */

export type RankExam = 'theaterFinal' | 'allAreas';

export interface IRank {
  /** 0 = lowest */
  index: number;
  name: string;
  en: string;
  /** Merit (戦功) needed to hold this rank */
  minMerit: number;
  /** Ships (and captains) per sortie */
  slots: number;
  /** Campaign areas that must also be cleared */
  exam?: RankExam;
}

export const RANKS: IRank[] = [
  { index: 0, name: '士官候補生', en: 'MIDSHIPMAN', minMerit: 0, slots: 1 },
  { index: 1, name: '准尉', en: 'WARRANT OFFICER', minMerit: 30, slots: 1 },
  { index: 2, name: '少尉', en: 'ENSIGN', minMerit: 80, slots: 2 },
  { index: 3, name: '中尉', en: 'LIEUTENANT (JG)', minMerit: 150, slots: 2 },
  { index: 4, name: '大尉', en: 'LIEUTENANT', minMerit: 250, slots: 3 },
  { index: 5, name: '准佐', en: 'SENIOR LIEUTENANT', minMerit: 350, slots: 3 },
  { index: 6, name: '少佐', en: 'LT. COMMANDER', minMerit: 500, slots: 4 },
  { index: 7, name: '中佐', en: 'COMMANDER', minMerit: 650, slots: 4 },
  { index: 8, name: '大佐', en: 'CAPTAIN', minMerit: 850, slots: 5 },
  { index: 9, name: '准将', en: 'COMMODORE', minMerit: 1000, slots: 5, exam: 'theaterFinal' },
  { index: 10, name: '少将', en: 'REAR ADMIRAL', minMerit: 1700, slots: 6 },
  { index: 11, name: '中将', en: 'VICE ADMIRAL', minMerit: 2150, slots: 6 },
  { index: 12, name: '大将', en: 'ADMIRAL', minMerit: 2650, slots: 7 },
  { index: 13, name: '元帥', en: 'FLEET ADMIRAL', minMerit: 3300, slots: 8, exam: 'allAreas' },
];

export const MAX_FLEET_SLOTS = RANKS[RANKS.length - 1].slots;

/** Rank a finished tutorial promotes to (#90). */
export const TUTORIAL_RANK = 2;
/**
 * Rank every nation starts at: 准尉 until the tutorial ships (#128 / #90), then 士官候補生 again. 士官候補生 stays
 * in the table and the rank list either way.
 */
export const START_RANK = 1;

/** Anything carrying a nation's rank inputs (IProgress / INationProgress). */
export interface IRankProgress {
  /** Cleared campaign area ids */
  campaign: string[];
  /** Merit (戦功) earned so far */
  merit?: number;
  /** Lowest rank index held whatever the merit (saves from before #36 keep their slots) */
  rankFloor?: number;
  /** The nation, for the promotion exams (its theaters' final areas) */
  nation?: string;
  /** What the promotion missions count (#142) */
  rankStats?: Partial<Record<RankStat, number>>;
  /** The shared service record, for the medal mission of each rank (#261); without it a medal counts as missing */
  record?: { medals: readonly string[] };
}

// ---------------------------------------------------------------------------
// Promotion missions (昇進任務, #142)
// ---------------------------------------------------------------------------

/** What promotion missions count, per nation, in campaign battles (and sweeps). */
export type RankStat =
  | 'campaignWin' | 'sink' | 'nightWin' | 'sinkCarrier' | 'objectiveWin' | 'bigS' | 'sinkSubmarine' | 'sinkBattleship' | 'sweep'
  // First clears of campaign areas (#261)
  | 'areaClear';

export interface IRankMission {
  /** The counter it reads, or `medal` for a medal mission (#261) */
  stat: RankStat | 'medal';
  goal: number;
  /** The medal a medal mission asks for */
  medal?: string;
  /** "作戦で 1 回勝利" */
  text: string;
}

const win = (goal: number): IRankMission => ({ stat: 'campaignWin', goal, text: `作戦で ${goal} 回勝利` });
const sink = (goal: number): IRankMission => ({ stat: 'sink', goal, text: `作戦で敵艦を ${goal} 隻撃沈` });
const night = (goal: number): IRankMission => ({ stat: 'nightWin', goal, text: goal > 1 ? `作戦の夜戦で ${goal} 回勝利` : '作戦の夜戦で勝利' });
const carrier = (goal: number): IRankMission => ({ stat: 'sinkCarrier', goal, text: goal > 1 ? `作戦で空母を ${goal} 隻撃沈` : '作戦で空母を撃沈' });
const objective = (goal: number): IRankMission => ({ stat: 'objectiveWin', goal, text: `目的のある海域 (遅滞・突入・護衛など) で ${goal} 回勝利` });
const bigS = (goal: number): IRankMission => ({ stat: 'bigS', goal, text: `6 隻以上の敵艦隊に S 評価で ${goal} 回勝利` });
const sub = (goal: number): IRankMission => ({ stat: 'sinkSubmarine', goal, text: `作戦で潜水艦を ${goal} 隻撃沈` });
const battleship = (goal: number): IRankMission => ({ stat: 'sinkBattleship', goal, text: `作戦で戦艦を ${goal} 隻撃沈` });
const areas = (goal: number): IRankMission => ({ stat: 'areaClear', goal, text: `作戦の海域を ${goal} か所攻略` });
const sweep = (goal: number): IRankMission => ({ stat: 'sweep', goal, text: `掃討を ${goal} 回` });
const medal = (id: string): IRankMission => ({ stat: 'medal', goal: 1, medal: id, text: `勲章「${MEDALS.find((m) => m.id === id)?.name ?? id}」を得る` });

/**
 * Missions a rank needs on top of its merit (and exam); every one must be done. From 少尉 on, four per rank (#261):
 * three battle counters (per nation, counted from the start, so the goals rise) and one medal (shared by the navies).
 */
export const RANK_MISSIONS: Partial<Record<number, IRankMission[]>> = {
  2: [win(1), sink(1), areas(1), medal('first_victory')],
  3: [win(5), sink(20), night(1), medal('victor')],
  4: [areas(5), sink(40), objective(1), medal('veteran')],
  5: [win(15), carrier(1), sweep(5), medal('perfect')],
  6: [carrier(3), objective(3), night(3), medal('fleet_2')],
  7: [bigS(1), sink(100), sub(3), medal('operations')],
  8: [bigS(3), battleship(2), win(40), medal('flawless')],
  9: [sub(10), battleship(5), sweep(15), medal('science_3')],
  10: [sink(250), areas(25), night(10), medal('victor_2')],
  11: [battleship(10), bigS(8), carrier(10), medal('s_rank_2')],
  12: [sweep(30), sub(25), win(120), medal('explorer_3')],
  13: [sink(600), bigS(15), battleship(20), medal('research_peak')],
};

/** Every mission's counter at its goal (a granted promotion, tests). */
export const ALL_MISSIONS_DONE: Record<RankStat, number> = Object.values(RANK_MISSIONS).flat().reduce(
  (out, m) => (m && m.stat !== 'medal' ? { ...out, [m.stat]: Math.max(out[m.stat] ?? 0, m.goal) } : out),
  {} as Record<RankStat, number>,
);

/** Every medal the promotion missions ask for (a granted promotion, tests). */
export const ALL_MISSION_MEDALS: string[] = Object.values(RANK_MISSIONS).flat().flatMap((m) => (m?.medal ? [m.medal] : []));

export function missionCount(progress: IRankProgress, stat: RankStat): number {
  return progress.rankStats?.[stat] ?? 0;
}

/** How far a mission is: its counter, or 1 / 0 for a medal held or not. */
export function missionValue(progress: IRankProgress, m: IRankMission): number {
  if (m.stat === 'medal') return m.medal && progress.record?.medals.includes(m.medal) ? 1 : 0;
  return missionCount(progress, m.stat);
}

export function missionDone(progress: IRankProgress, m: IRankMission): boolean {
  return missionValue(progress, m) >= m.goal;
}

/** The rank's missions not done yet. */
export function openMissions(rank: IRank, progress: IRankProgress): IRankMission[] {
  return (RANK_MISSIONS[rank.index] ?? []).filter((m) => !missionDone(progress, m));
}

/** "作戦で敵艦を 20 隻撃沈 (12 / 20)" */
export function missionText(m: IRankMission, progress: IRankProgress): string {
  return m.goal > 1 ? `${m.text} (${Math.min(m.goal, missionValue(progress, m))} / ${m.goal})` : m.text;
}

/** Adds to the mission counters (zeros are skipped). */
export function addRankStats<T extends IRankProgress>(progress: T, add: Partial<Record<RankStat, number>>): T {
  const stats = { ...(progress.rankStats ?? {}) };
  let changed = false;
  for (const [k, v] of Object.entries(add) as Array<[RankStat, number]>) {
    if (!v) continue;
    stats[k] = (stats[k] ?? 0) + v;
    changed = true;
  }
  return changed ? { ...progress, rankStats: stats } : progress;
}

/** Kept for callers that only count areas. */
export type IClears = IRankProgress;

export function clearCount(progress: Pick<IRankProgress, 'campaign'>): number {
  return new Set(progress.campaign).size;
}

interface ITheaterAreas {
  id: string;
  opponents: Record<string, string | undefined>;
  /** False for a theater added later (#202): its final is no exam, so no admiral loses a rank they held */
  exam?: boolean;
}

/**
 * Each theater's final area (its last listed, training areas aside), for the theaters `nation` fights in (all of them
 * if unknown). Theaters marked `exam: false` don't count.
 */
export function finalAreas(nation?: string): string[] {
  const data = campaignData as unknown as { theaters: ITheaterAreas[]; areas: Array<{ id: string; theater: string; training?: boolean }> };
  return data.theaters
    .filter((t) => t.exam !== false && (!nation || t.opponents[nation] !== undefined))
    .map((t) => theaterFinalArea(data, t.id))
    .filter((id): id is string => id !== undefined);
}

/** Every campaign area of the nation's examined theaters, training areas aside (元帥's exam since #304). */
export function examAreas(nation?: string): string[] {
  const data = campaignData as unknown as { theaters: ITheaterAreas[]; areas: Array<{ id: string; theater: string; training?: boolean }> };
  const theaters = new Set(data.theaters.filter((t) => t.exam !== false && (!nation || t.opponents[nation] !== undefined)).map((t) => t.id));
  return data.areas.filter((a) => theaters.has(a.theater) && !a.training).map((a) => a.id);
}

/** How far the exam is: [areas cleared, areas needed] (one final for 准将, every area for 元帥). */
export function examProgress(exam: RankExam, progress: Pick<IRankProgress, 'campaign' | 'nation'>): [number, number] {
  const cleared = new Set(progress.campaign);
  if (exam === 'theaterFinal') return [Math.min(1, finalAreas(progress.nation).filter((id) => cleared.has(id)).length), 1];
  const all = examAreas(progress.nation);
  return [all.filter((id) => cleared.has(id)).length, all.length];
}

/** Whether `progress` has passed the rank's promotion exam (ranks without one always pass). */
export function examPassed(rank: IRank, progress: IRankProgress): boolean {
  if (!rank.exam) return true;
  const [done, need] = examProgress(rank.exam, progress);
  return need > 0 && done >= need;
}

/** "准将: 戦域の最終海域を 1 つ攻略" — what an exam asks for. */
export function examText(exam: RankExam): string {
  return exam === 'theaterFinal' ? '戦域の最終海域を 1 つ攻略' : '全戦域の全海域を攻略';
}

export function rankOf(progress: IRankProgress, missions = true): IRank {
  const merit = progress.merit ?? 0;
  let rank = RANKS[0];
  for (const r of RANKS) {
    // Ranks are climbed in order: a failed exam or an open promotion mission (#142) stops the climb there.
    if (merit < r.minMerit || !examPassed(r, progress) || (missions && openMissions(r, progress).length > 0)) break;
    rank = r;
  }
  const floor = RANKS[Math.min(RANKS.length - 1, Math.max(START_RANK, progress.rankFloor ?? 0))];
  return floor.index > rank.index ? floor : rank;
}

/** Ships the nation may send on one sortie. */
export function fleetSlots(progress: IRankProgress): number {
  return rankOf(progress).slots;
}

export interface INextRank {
  rank: IRank;
  /** Merit still needed (0 when only the exam is missing) */
  meritNeeded: number;
  /** The exam still to pass, if any */
  exam?: RankExam;
  /** Promotion missions still open (#142) */
  missions: IRankMission[];
}

function nextOf(progress: IRankProgress, target: IRank): INextRank {
  return {
    rank: target,
    meritNeeded: Math.max(0, target.minMerit - (progress.merit ?? 0)),
    exam: target.exam && !examPassed(target, progress) ? target.exam : undefined,
    missions: openMissions(target, progress),
  };
}

/** The next rank and what it still needs, or null at the top. */
export function nextRank(progress: IRankProgress): INextRank | null {
  const next = RANKS[rankOf(progress).index + 1];
  return next ? nextOf(progress, next) : null;
}

/** The next rank that adds a fleet slot (ranks come in pairs with the same slots), or null at the top. */
export function nextSlotRank(progress: IRankProgress): INextRank | null {
  const current = rankOf(progress);
  const next = RANKS.find((r) => r.index > current.index && r.slots > current.slots);
  return next ? nextOf(progress, next) : null;
}

/** "戦功 あと 70" / "戦功 あと 70 + 戦域の最終海域を 1 つ攻略" / "作戦の夜戦で勝利" (a mission, #142). */
export function needText(next: INextRank, progress?: IRankProgress): string {
  const parts: string[] = [];
  if (next.meritNeeded > 0) parts.push(`戦功 あと ${next.meritNeeded}`);
  if (next.exam) {
    // 元帥's exam shows how far it is (#304): "全戦域の全海域を攻略 (52 / 60)".
    const [done, need] = progress ? examProgress(next.exam, progress) : [0, 0];
    parts.push(progress && need > 1 ? `${examText(next.exam)} (${done} / ${need})` : examText(next.exam));
  }
  // Four missions a rank since #261: one open is named, more are counted (the 昇進 tab of the quests lists them).
  if (next.missions.length === 1) parts.push(progress ? missionText(next.missions[0], progress) : next.missions[0].text);
  else if (next.missions.length > 1) parts.push(`昇進任務 あと ${next.missions.length}`);
  return parts.join(' + ');
}

/** "次の昇進: 中尉 (戦功 あと 70)" / "最高位に到達". */
export function promotionText(progress: IRankProgress): string {
  const next = nextRank(progress);
  return next ? `次の昇進: ${next.rank.name} (${needText(next, progress)})` : '最高位に到達';
}

// ---------------------------------------------------------------------------
// Merit (戦功)
// ---------------------------------------------------------------------------

/** Merit for an area's first clear: the main way up. */
export const MERIT_FIRST_CLEAR = 100;
/** A repeat campaign victory and an exercise victory, plus a little per enemy sunk (capped). */
export const MERIT_CAMPAIGN_WIN = 15;
export const MERIT_EXERCISE_WIN = 5;
export const MERIT_PER_SINK = 1;
export const MERIT_SINK_CAP = 10;

export interface IMeritInput {
  victory: boolean;
  /** Campaign sortie (false = exercise) */
  campaign: boolean;
  firstClear: boolean;
  enemiesSunk: number;
}

/** Merit a battle earns; defeats earn none. */
export function meritFor(input: IMeritInput): number {
  if (!input.victory) return 0;
  const sinks = Math.min(MERIT_SINK_CAP, Math.max(0, input.enemiesSunk)) * MERIT_PER_SINK;
  if (!input.campaign) return MERIT_EXERCISE_WIN + sinks;
  return (input.firstClear ? MERIT_FIRST_CLEAR : MERIT_CAMPAIGN_WIN) + sinks;
}

/** Adds merit; returns the new progress and the rank reached when it is a promotion. */
export function addMerit<T extends IRankProgress>(progress: T, merit: number): { progress: T; promotedTo: IRank | null } {
  const before = rankOf(progress);
  const next = { ...progress, merit: (progress.merit ?? 0) + Math.max(0, merit) };
  const after = rankOf(next);
  return { progress: next, promotedTo: after.index > before.index ? after : null };
}

/** Raises merit to at least the given rank's threshold and completes the missions up to it (the tutorial's promotion to 少尉, #90 / #142). */
export function grantRankMerit<T extends IRankProgress>(progress: T, rankIndex: number): T {
  const index = Math.min(RANKS.length - 1, Math.max(0, rankIndex));
  const need = RANKS[index].minMerit;
  const stats = { ...(progress.rankStats ?? {}) };
  for (let i = 0; i <= index; i++) for (const m of RANK_MISSIONS[i] ?? []) if (m.stat !== 'medal') stats[m.stat] = Math.max(stats[m.stat] ?? 0, m.goal);
  // A medal can't be granted: the rank itself is held as the floor.
  return { ...progress, merit: Math.max(progress.merit ?? 0, need), rankStats: stats, rankFloor: Math.max(progress.rankFloor ?? 0, index) };
}

// ---------------------------------------------------------------------------
// What ranks unlock
// ---------------------------------------------------------------------------

/** Rank index needed to build a ship of each grade (0..5, ShipyardSystem.shipGrade). */
export const GRADE_RANK = [0, 2, 4, 7, 9, 11];

/** Highest ship grade a rank may build. */
export function maxBuildGrade(rankIndex: number): number {
  return GRADE_RANK.filter((r) => rankIndex >= r).length - 1;
}

export function rankForGrade(grade: number): IRank {
  return RANKS[GRADE_RANK[Math.min(GRADE_RANK.length - 1, Math.max(0, grade))]];
}

/**
 * Old six-rank table (before #36): 少佐 0 / 中佐 1 / 大佐 2 / 少将 4 / 中将 7 / 大将 10 clears, 1..6 slots, grade
 * = rank index. Used only by the v4 → v5 save migration.
 */
export const LEGACY_RANK_CLEARS = [0, 1, 2, 4, 7, 10];
/** New rank index that keeps each old rank's slots and buildable grade (old 少佐 counts as tutorial done: 少尉). */
export const LEGACY_RANK_TO_NEW = [2, 2, 4, 7, 9, 11];

export function legacyRankFloor(clears: number): number {
  let old = 0;
  LEGACY_RANK_CLEARS.forEach((min, i) => {
    if (clears >= min) old = i;
  });
  return LEGACY_RANK_TO_NEW[old];
}
