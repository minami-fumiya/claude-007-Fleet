import commentaryData from '@/data/commentary.json';
import type { CommentaryRate } from './SettingsSystem';

/**
 * 戦闘実況とナレーション (#106, pure). Lines wait in a queue by priority: an important line (the flagship badly hurt,
 * a sinking) goes ahead of small talk, which is dropped when it waits too long; the same kind of line is not
 * repeated within its own gap, and the rate setting stretches every gap so ten ships a side never talk nonstop.
 * The words come from data, per navy (commentary.json); the scene speaks them (Web Speech) and shows them as
 * subtitles.
 */

export type CommentaryKind =
  | 'start' | 'contact' | 'enemySunk' | 'enemyHeavy' | 'ownHit' | 'ownHeavy' | 'flagshipDanger' | 'ownSunk'
  | 'torpedoWarning' | 'airRaid' | 'reconContact' | 'winning' | 'losing' | 'victory' | 'defeat';

export interface ICommentaryRule {
  /** Higher plays first */
  priority: number;
  /** Seconds before the same kind may be said again */
  gapSec: number;
}

export const COMMENTARY_RULES: Record<CommentaryKind, ICommentaryRule> = {
  start: { priority: 5, gapSec: 999 },
  contact: { priority: 3, gapSec: 30 },
  enemySunk: { priority: 6, gapSec: 3 },
  enemyHeavy: { priority: 2, gapSec: 10 },
  ownHit: { priority: 1, gapSec: 12 },
  ownHeavy: { priority: 6, gapSec: 8 },
  flagshipDanger: { priority: 9, gapSec: 20 },
  ownSunk: { priority: 8, gapSec: 3 },
  torpedoWarning: { priority: 7, gapSec: 15 },
  airRaid: { priority: 5, gapSec: 25 },
  reconContact: { priority: 3, gapSec: 40 },
  winning: { priority: 2, gapSec: 45 },
  losing: { priority: 4, gapSec: 45 },
  victory: { priority: 10, gapSec: 999 },
  defeat: { priority: 10, gapSec: 999 },
};

/** Gaps stretch with the rate setting: 少ない doubles them, 多い halves them. */
export const RATE_GAP_MUL: Record<CommentaryRate, number> = { few: 2, normal: 1, many: 0.5 };
/** Below this priority a line is dropped on 少ない. */
export const FEW_MIN_PRIORITY = 4;
/** A queued line older than this is dropped (it no longer fits what is happening), unless it is important. */
export const STALE_SEC = 4;
export const IMPORTANT = 6;
/** Seconds one line is given before the next starts (speech is about this long; subtitles stay as long). */
export const LINE_SEC = 2.6;

export interface ICommentaryLine {
  kind: CommentaryKind;
  text: string;
  /** Seconds (battle time) it was raised */
  at: number;
}

export interface ICommentaryState {
  queue: ICommentaryLine[];
  /** Kind → seconds it was last said */
  lastSaid: Partial<Record<CommentaryKind, number>>;
  /** Seconds the current line ends */
  busyUntil: number;
  /** Everything said, for the battle log */
  log: ICommentaryLine[];
}

export function emptyCommentary(): ICommentaryState {
  return { queue: [], lastSaid: {}, busyUntil: 0, log: [] };
}

/** Adds a line unless the rate setting or its kind's gap rules it out. */
export function raise(state: ICommentaryState, line: ICommentaryLine, rate: CommentaryRate): ICommentaryState {
  const rule = COMMENTARY_RULES[line.kind];
  if (rate === 'few' && rule.priority < FEW_MIN_PRIORITY) return state;
  const last = state.lastSaid[line.kind];
  if (last !== undefined && line.at - last < rule.gapSec * RATE_GAP_MUL[rate]) return state;
  if (state.queue.some((q) => q.kind === line.kind)) return state;
  return { ...state, queue: [...state.queue, line] };
}

/** The line to say now, if the last one has finished: the most important waiting one; stale small talk is dropped. */
export function next(state: ICommentaryState, now: number): { state: ICommentaryState; line: ICommentaryLine | null } {
  const queue = state.queue.filter((q) => COMMENTARY_RULES[q.kind].priority >= IMPORTANT || now - q.at <= STALE_SEC);
  if (now < state.busyUntil || queue.length === 0) return { state: { ...state, queue }, line: null };
  const best = [...queue].sort((a, b) => COMMENTARY_RULES[b.kind].priority - COMMENTARY_RULES[a.kind].priority || a.at - b.at)[0];
  return {
    line: best,
    state: {
      queue: queue.filter((q) => q !== best),
      lastSaid: { ...state.lastSaid, [best.kind]: now },
      busyUntil: now + LINE_SEC,
      log: [...state.log, { ...best, at: now }],
    },
  };
}

/** Fills a line's placeholders: "{name} 撃沈確認" with { name: '大和' }. */
export function fillLine(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

/** "02:15  敵駆逐艦 撃沈確認" lines for the results' battle log. */
export function logLines(log: readonly ICommentaryLine[]): string[] {
  return log.map((l) => {
    const s = Math.max(0, Math.round(l.at));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}  ${l.text}`;
  });
}

// ---------------------------------------------------------------------------
// The words (commentary.json)
// ---------------------------------------------------------------------------


type Lines = Partial<Record<CommentaryKind, string>>;
const BATTLE = commentaryData.battle as unknown as Record<string, Lines> & { common: Record<CommentaryKind, string> };
const NARRATION = commentaryData.narration as Record<NarrationKind, string>;

export type NarrationKind = 'areaStart' | 'victory' | 'defeat' | 'promotion' | 'firstClear' | 'rewardShip' | 'researchDone' | 'buildDone';

/** A battle line in the navy's words (its own when it has one, else the common one). */
export function battleLine(kind: CommentaryKind, nation: string, vars: Record<string, string> = {}): string {
  return fillLine(BATTLE[nation]?.[kind] ?? BATTLE.common[kind], vars);
}

const OUTCOME = (commentaryData as unknown as { outcome: Record<string, { victory: string; defeat: string }> }).outcome;

/**
 * The last line of a battle (#394): the objective's own words (撤収部隊は無事に離脱 …), the navy's 撃滅 line for an
 * annihilation; a sunk flagship is the plain defeat whatever the objective.
 */
export function outcomeLine(victory: boolean, objective: string, nation: string, flagshipSunk = false): string {
  const own = OUTCOME[objective];
  if (!own || (!victory && flagshipSunk)) return battleLine(victory ? 'victory' : 'defeat', nation);
  return victory ? own.victory : own.defeat;
}

export function narrationLine(kind: NarrationKind, vars: Record<string, string> = {}): string {
  return fillLine(NARRATION[kind], vars);
}

/** The bearing of a point from another, as the eight compass words (北・北東 …), for 敵艦隊発見. */
export function bearingWord(fromX: number, fromY: number, toX: number, toY: number): string {
  const deg = (Math.atan2(toX - fromX, -(toY - fromY)) * 180) / Math.PI;
  const words = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return words[((Math.round(deg / 45) % 8) + 8) % 8];
}
