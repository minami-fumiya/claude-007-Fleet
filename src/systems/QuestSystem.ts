import questData from '@/data/quests.json';
import { IResources } from '@/types/Progression';

/**
 * 任務 (#52, pure): daily, weekly and one-time goals with resource rewards. Dailies reset when the game day starts
 * (05:00 JST), weeklies on Monday's; one-time ones never. Progress moves on events the game emits (sortie, win,
 * sinkings by class, repairs, building …), and a finished quest's reward is claimed on the 任務 screen.
 */

export type QuestKind = 'daily' | 'weekly' | 'once';
export type QuestEvent =
  | 'sortie' | 'win' | 'nightWin' | 'sink' | 'sinkCarrier' | 'sinkSubmarine' | 'sinkBattleship'
  | 'repair' | 'build' | 'research' | 'refit' | 'sweep';

export interface IQuest {
  id: string;
  kind: QuestKind;
  name: string;
  text: string;
  event: QuestEvent;
  goal: number;
  reward: Partial<IResources>;
}

export interface IQuestState {
  /** Game day the daily progress belongs to */
  day: number;
  /** Game week the weekly progress belongs to */
  week: number;
  /** Quest id → progress */
  progress: Record<string, number>;
  /** Quest ids whose reward was taken (this day / week for repeating ones) */
  claimed: string[];
}

export const QUESTS = (questData as { quests: IQuest[] }).quests;
export const QUEST_KIND_LABEL: Record<QuestKind, string> = { daily: 'デイリー', weekly: 'ウィークリー', once: '戦果' };

const DAY = 86_400_000;
/** 05:00 JST = 20:00 UTC */
const DAY_START_UTC = 20 * 3_600_000;
/** Game day 0 began on Friday 1970-01-02 05:00 JST; a game week starts on Monday (day 3). */
const MONDAY_OFFSET = 4;

export function emptyQuestState(): IQuestState {
  return { day: 0, week: 0, progress: {}, claimed: [] };
}

export function gameDay(now: number): number {
  return Math.floor((now - DAY_START_UTC) / DAY);
}

export function gameWeek(now: number): number {
  return Math.floor((gameDay(now) + MONDAY_OFFSET) / 7);
}

/** Next reset of `kind` after `now` (epoch ms). */
export function nextReset(kind: 'daily' | 'weekly', now: number): number {
  if (kind === 'daily') return DAY_START_UTC + (gameDay(now) + 1) * DAY;
  return DAY_START_UTC + ((gameWeek(now) + 1) * 7 - MONDAY_OFFSET) * DAY;
}

/** Clears the dailies of a past day and the weeklies of a past week. */
export function refreshQuests(state: IQuestState, now: number): IQuestState {
  const day = gameDay(now);
  const week = gameWeek(now);
  if (day === state.day && week === state.week) return state;
  const stale = (q: IQuest): boolean => (q.kind === 'daily' && day !== state.day) || (q.kind === 'weekly' && week !== state.week);
  const progress = { ...state.progress };
  for (const q of QUESTS) if (stale(q)) delete progress[q.id];
  return { day, week, progress, claimed: state.claimed.filter((id) => !QUESTS.some((q) => q.id === id && stale(q))) };
}

/** Adds `count` to every unclaimed quest waiting for `event` (capped at its goal). */
export function recordQuestEvent(state: IQuestState, event: QuestEvent, now: number, count = 1): IQuestState {
  if (count <= 0) return refreshQuests(state, now);
  const s = refreshQuests(state, now);
  const progress = { ...s.progress };
  let changed = false;
  for (const q of QUESTS) {
    if (q.event !== event || s.claimed.includes(q.id)) continue;
    const before = progress[q.id] ?? 0;
    const after = Math.min(q.goal, before + count);
    if (after !== before) {
      progress[q.id] = after;
      changed = true;
    }
  }
  return changed ? { ...s, progress } : s;
}

export function questProgress(state: IQuestState, q: IQuest): number {
  return Math.min(q.goal, state.progress[q.id] ?? 0);
}

export function isClaimable(state: IQuestState, q: IQuest): boolean {
  return !state.claimed.includes(q.id) && questProgress(state, q) >= q.goal;
}

/** Number of rewards waiting (the badge on the menu). */
export function claimableCount(state: IQuestState, now: number): number {
  const s = refreshQuests(state, now);
  return QUESTS.filter((q) => isClaimable(s, q)).length;
}

/** Takes a finished quest's reward; null when it isn't finished or was already taken. */
export function claimQuest(state: IQuestState, id: string, now: number): { state: IQuestState; reward: Partial<IResources> } | null {
  const s = refreshQuests(state, now);
  const q = QUESTS.find((x) => x.id === id);
  if (!q || !isClaimable(s, q)) return null;
  return { state: { ...s, claimed: [...s.claimed, id] }, reward: q.reward };
}

/** Tolerant parse of a stored quest state. */
export function parseQuestState(v: unknown): IQuestState {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return emptyQuestState();
  const o = v as Record<string, unknown>;
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const progress: Record<string, number> = {};
  if (typeof o.progress === 'object' && o.progress !== null) {
    for (const [k, x] of Object.entries(o.progress as Record<string, unknown>)) if (typeof x === 'number' && Number.isFinite(x)) progress[k] = Math.max(0, x);
  }
  return {
    day: num(o.day),
    week: num(o.week),
    progress,
    claimed: Array.isArray(o.claimed) ? o.claimed.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** Records several events on a nation's progress at once. */
export function withQuestEvents<T extends { quests: IQuestState }>(progress: T, events: Array<[QuestEvent, number]>, now: number): T {
  let quests = progress.quests;
  for (const [event, count] of events) quests = recordQuestEvent(quests, event, now, count);
  return quests === progress.quests ? progress : { ...progress, quests };
}
