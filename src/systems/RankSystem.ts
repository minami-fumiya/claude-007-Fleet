import campaignData from '@/data/campaign.json';

/**
 * Admiral rank (#30 / #36, pure). Each nation climbs 14 ranks, from 士官候補生 to 元帥, with merit (戦功) earned in
 * battle — mostly first clears of campaign areas, a little from repeat sorties and exercises. Two ranks also need a
 * promotion exam: 准将 a theater's final area, 元帥 every final area of the nation's theaters. The rank sets the
 * number of fleet slots (#25, up to 8), the grade of ship the shipyard may build (#29), formations (#59) and docks
 * (#38). Saves from before the merit system keep their old slots through `rankFloor` (see SaveMigration v4 → v5).
 */

export type RankExam = 'theaterFinal' | 'allTheaterFinals';

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
  { index: 10, name: '少将', en: 'REAR ADMIRAL', minMerit: 1300, slots: 6 },
  { index: 11, name: '中将', en: 'VICE ADMIRAL', minMerit: 1650, slots: 6 },
  { index: 12, name: '大将', en: 'ADMIRAL', minMerit: 2050, slots: 7 },
  { index: 13, name: '元帥', en: 'FLEET ADMIRAL', minMerit: 2500, slots: 8, exam: 'allTheaterFinals' },
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
}

// ---------------------------------------------------------------------------
// Promotion missions (昇進任務, #142)
// ---------------------------------------------------------------------------

/** What promotion missions count, per nation, in campaign battles (and sweeps). */
export type RankStat =
  | 'campaignWin' | 'sink' | 'nightWin' | 'sinkCarrier' | 'objectiveWin' | 'bigS' | 'sinkSubmarine' | 'sinkBattleship' | 'sweep';

export interface IRankMission {
  stat: RankStat;
  goal: number;
  /** "作戦で 1 回勝利" */
  text: string;
}

/** Missions a rank needs on top of its merit (and exam); every one must be done. */
export const RANK_MISSIONS: Partial<Record<number, IRankMission[]>> = {
  2: [{ stat: 'campaignWin', goal: 1, text: '作戦で 1 回勝利' }],
  3: [{ stat: 'sink', goal: 20, text: '作戦で敵艦を 20 隻撃沈' }],
  4: [{ stat: 'nightWin', goal: 1, text: '作戦の夜戦で勝利' }],
  6: [{ stat: 'sinkCarrier', goal: 1, text: '作戦で空母を撃沈' }],
  7: [{ stat: 'objectiveWin', goal: 1, text: '目的のある海域 (遅滞・突入・護衛など) で勝利' }],
  8: [{ stat: 'bigS', goal: 1, text: '6 隻以上の敵艦隊に S 評価で勝利' }],
  10: [{ stat: 'sinkSubmarine', goal: 10, text: '作戦で潜水艦を 10 隻撃沈' }],
  11: [{ stat: 'sinkBattleship', goal: 5, text: '作戦で戦艦を 5 隻撃沈' }],
  12: [{ stat: 'sweep', goal: 20, text: '掃討を 20 回' }],
};

/** Every mission's counter at its goal (a granted promotion, tests). */
export const ALL_MISSIONS_DONE: Record<RankStat, number> = Object.values(RANK_MISSIONS).flat().reduce(
  (out, m) => (m ? { ...out, [m.stat]: Math.max(out[m.stat] ?? 0, m.goal) } : out),
  {} as Record<RankStat, number>,
);

export function missionCount(progress: IRankProgress, stat: RankStat): number {
  return progress.rankStats?.[stat] ?? 0;
}

/** The rank's missions not done yet. */
export function openMissions(rank: IRank, progress: IRankProgress): IRankMission[] {
  return (RANK_MISSIONS[rank.index] ?? []).filter((m) => missionCount(progress, m.stat) < m.goal);
}

/** "作戦で敵艦を 20 隻撃沈 (12 / 20)" */
export function missionText(m: IRankMission, progress: IRankProgress): string {
  return m.goal > 1 ? `${m.text} (${Math.min(m.goal, missionCount(progress, m.stat))} / ${m.goal})` : m.text;
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
    .map((t) => data.areas.filter((a) => a.theater === t.id && !a.training).pop()?.id)
    .filter((id): id is string => id !== undefined);
}

/** Whether `progress` has passed the rank's promotion exam (ranks without one always pass). */
export function examPassed(rank: IRank, progress: IRankProgress): boolean {
  if (!rank.exam) return true;
  const finals = finalAreas(progress.nation);
  const cleared = new Set(progress.campaign);
  return rank.exam === 'theaterFinal' ? finals.some((id) => cleared.has(id)) : finals.length > 0 && finals.every((id) => cleared.has(id));
}

/** "准将: 戦域の最終海域を 1 つ攻略" — what an exam asks for. */
export function examText(exam: RankExam): string {
  return exam === 'theaterFinal' ? '戦域の最終海域を 1 つ攻略' : '全戦域の最終海域を攻略';
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
  if (next.exam) parts.push(examText(next.exam));
  for (const m of next.missions) parts.push(progress ? missionText(m, progress) : m.text);
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
  for (let i = 0; i <= index; i++) for (const m of RANK_MISSIONS[i] ?? []) stats[m.stat] = Math.max(stats[m.stat] ?? 0, m.goal);
  return { ...progress, merit: Math.max(progress.merit ?? 0, need), rankStats: stats };
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
