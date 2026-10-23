import type { EventKind } from './EventSystem';
import questData from '@/data/quests.json';
import itemData from '@/data/items.json';
import { IItems, IResources } from '@/types/Progression';

/**
 * 任務 (#52 #158, pure): hourly, daily, weekly and one-time goals with resource rewards. Hourly ones turn over every
 * hour, dailies when the game day starts (00:00 JST, #219), weeklies on Monday's; one-time ones never. Each period shows a
 * few of its kind, picked from the whole pool by the period number, so the set changes day to day. Progress moves on
 * events the game emits (sortie, win, sinkings by class, repairs, building …), and a finished quest's reward — and,
 * for some one-time ones, a medal (#92) — is claimed on the 任務 screen.
 */

/** 'event' (#89): quests that only move while their limited-time event runs; they turn over with its 3-hour window. */
export type QuestKind = 'hourly' | 'daily' | 'weekly' | 'event' | 'once';
/**
 * Every quest event (#318): a list the data checks can read at run time, so a misspelt `event` in quests.json (a
 * quest that never moves) or an event nothing uses is caught by the tests. The type is made from it.
 */
export const QUEST_EVENTS = [
  'sortie', 'win', 'nightWin', 'dayWin', 'winS', 'winA', 'perfectWin', 'campaignWin', 'objectiveWin', 'exerciseWin', 'ddFlagWin',
  'winPacific', 'winAtlantic', 'winMediterranean', 'winBaltic',
  'sink', 'sinkDestroyer', 'sinkCruiser', 'sinkCarrier', 'sinkSubmarine', 'sinkBattleship',
  'repair', 'build', 'research', 'refit', 'sweep', 'facility', 'captainLevel',
  // 0.0.25: convoy escorts won (#186), skills taught to captains (#187)
  'convoyWin', 'learnSkill',
  // 0.0.26: new versions met on the title screen (#205)
  'versionUpdate',
  // 0.0.27: captains joining from S ranks and promotions (#215)
  'captainJoin',
  // wins under each kind of event (#218)
  'event_double', 'event_steel', 'event_training', 'event_repair', 'event_fuel', 'event_ammo', 'event_bauxite', 'event_superweapon',
  // 0.0.29: enemy planes shot down (#185)
  'planesDown',
  // 0.0.30: remodels finished in a chosen direction (#86)
  'refitBranch',
  // 0.0.36: finished ships moved to another direction (#265), builds finished, list searches (#263)
  'refitRebranch', 'buildDone', 'listSearch',
  // 0.0.37: a direction on a special refit (#277), land targets destroyed (#278)
  'specialBranch', 'landKill',
  // 0.0.38: campaign wins against a stronger enemy (#280)
  'underdogWin',
  // 0.0.43: campaign wins with the fleet's cost at its cap, or at half of it (#306)
  'fullCostWin', 'lightCostWin',
  // 0.0.39: wins with 95% of the fleet's HP left (#295), resources sold in the shop (#296)
  'flawlessWin', 'shopSell',
  // the Black Sea theater and training areas (#202)
  'winBlackSea', 'trainingWin',
  // The seas added in 0.0.35 (#250)
  'winNorthPacific', 'winSouthAtlantic', 'winIndian', 'winArctic',
  // 0.0.31: quests claimed (#180)
  'questClaim',
  // 0.0.32: shop purchases (#183)
  'shopBuy',
  // 0.0.33: wins on 難しい (#100), fires and floods started on enemy ships (#48)
  'hardWin', 'fireSet',
  // airfields destroyed (#83), superweapons sunk (#148)
  'airfieldDown', 'superweaponSunk',
  // 0.0.40: historical wins (#314), bases opened and docks built (#314), items used (#315)
  'scenarioWin', 'baseOpened', 'dockBuilt', 'bookUse', 'fastRepairUse', 'fastBuildUse', 'manualUse', 'supplyUse', 'sparkleWin', 'expeditionStart', 'expeditionDone', 'dormHours', 'multiFleetWin', 'allyWin', 'eventQuestClaim',
] as const;

export type QuestEvent = (typeof QUEST_EVENTS)[number];

/** Each event kind's own win event (#218); the data checks keep it in step with EventSystem's kinds. */
export function eventWin(kind: EventKind): QuestEvent {
  return `event_${kind}` as QuestEvent;
}

export interface IQuest {
  id: string;
  kind: QuestKind;
  name: string;
  text: string;
  event: QuestEvent;
  goal: number;
  reward: Partial<IResources>;
  /** 高速修理材・高速建造材 on top of the resources (#143) */
  items?: Partial<IItems>;
  /** Medal awarded with the reward (#158) */
  medal?: string;
  /** Captains who join on claiming it (#209) */
  captains?: number;
  /** ゴールド paid with the reward (#183) */
  gold?: number;
}

export interface IQuestState {
  /** Game day the daily progress belongs to */
  day: number;
  /** Game week the weekly progress belongs to */
  week: number;
  /** Hour (epoch hours) the hourly progress belongs to (#158) */
  hour: number;
  /** Event window (3 hours, #89) the event quests' progress belongs to */
  window?: number;
  /** Quest id → progress */
  progress: Record<string, number>;
  /** Quest ids whose reward was taken (this hour / day / week for repeating ones) */
  claimed: string[];
  /** Lifetime count of every event (#158): one-time quests and medals read it */
  totals: Partial<Record<QuestEvent, number>>;
}

export const QUESTS = (questData as { quests: IQuest[] }).quests;
export const QUEST_KINDS: QuestKind[] = ['hourly', 'daily', 'weekly', 'event', 'once'];
export const QUEST_KIND_LABEL: Record<QuestKind, string> = { hourly: '毎時', daily: 'デイリー', weekly: 'ウィークリー', event: 'イベント', once: '戦果' };
/** How many of each kind are on the board at a time (#158; ten of each since #180); one-time ones show the first 10 by state. */
export const QUESTS_SHOWN: Record<QuestKind, number> = { hourly: 10, daily: 10, weekly: 10, event: 10, once: 10 };
/** Dailies always on the board: the four from 0.0.15, so their progress carries over. */
const CORE_DAILIES = ['d_sortie', 'd_win', 'd_sink', 'd_repair'];

const HOUR = 3_600_000;
const DAY = 86_400_000;
/**
 * The game day starts at 00:00 JST = 15:00 UTC (#219; 05:00 JST before 0.0.27). Quests, sweeps and the event table
 * all use it. A day keeps its number across the change, so nothing reset early or late.
 */
export const DAY_START_UTC = 15 * 3_600_000;
/** Game day 0 began on Friday 1970-01-02 00:00 JST; a game week starts on Monday (day 3). */
const MONDAY_OFFSET = 4;

export function emptyQuestState(): IQuestState {
  return { day: 0, week: 0, hour: 0, progress: {}, claimed: [], totals: {} };
}

export function gameDay(now: number): number {
  return Math.floor((now - DAY_START_UTC) / DAY);
}

export function gameWeek(now: number): number {
  return Math.floor((gameDay(now) + MONDAY_OFFSET) / 7);
}

export function gameHour(now: number): number {
  return Math.floor(now / HOUR);
}

/** Limited-time events run in 3-hour windows from the start of the game day (#89 #218). */
export const EVENT_WINDOW = 3 * HOUR;

export function gameWindow(now: number): number {
  return Math.floor((now - DAY_START_UTC) / EVENT_WINDOW);
}

/** Next reset of `kind` after `now` (epoch ms). */
export function nextReset(kind: 'hourly' | 'daily' | 'weekly' | 'event', now: number): number {
  if (kind === 'hourly') return (gameHour(now) + 1) * HOUR;
  if (kind === 'event') return DAY_START_UTC + (gameWindow(now) + 1) * EVENT_WINDOW;
  if (kind === 'daily') return DAY_START_UTC + (gameDay(now) + 1) * DAY;
  return DAY_START_UTC + ((gameWeek(now) + 1) * 7 - MONDAY_OFFSET) * DAY;
}

/** A small seeded generator, so a period always shows the same quests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The repeating quests on the board for the period containing `now` (one-time ones: all of them). */
export function activeQuests(kind: QuestKind, now: number): IQuest[] {
  const pool = QUESTS.filter((q) => q.kind === kind);
  // Event quests are all on the board; only the running event's own counter moves them.
  if (kind === 'once' || kind === 'event') return pool;
  const period = kind === 'hourly' ? gameHour(now) : kind === 'daily' ? gameDay(now) : gameWeek(now);
  const fixed = kind === 'daily' ? pool.filter((q) => CORE_DAILIES.includes(q.id)) : [];
  const rest = pool.filter((q) => !fixed.includes(q));
  const rand = seeded(period * 7919 + QUEST_KINDS.indexOf(kind) * 104_729);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const picked = new Set([...fixed, ...rest.slice(0, QUESTS_SHOWN[kind] - fixed.length)]);
  return pool.filter((q) => picked.has(q));
}

function isActive(q: IQuest, now: number): boolean {
  return activeQuests(q.kind, now).includes(q);
}

/** Clears the hourlies of a past hour, the dailies of a past day and the weeklies of a past week. */
export function refreshQuests(state: IQuestState, now: number): IQuestState {
  const hour = gameHour(now);
  const day = gameDay(now);
  const week = gameWeek(now);
  const window = gameWindow(now);
  if (hour === state.hour && day === state.day && week === state.week && window === state.window) return state;
  const stale = (q: IQuest): boolean =>
    (q.kind === 'hourly' && hour !== state.hour) || (q.kind === 'daily' && day !== state.day) || (q.kind === 'weekly' && week !== state.week)
    || (q.kind === 'event' && window !== state.window);
  const progress = { ...state.progress };
  for (const q of QUESTS) if (stale(q)) delete progress[q.id];
  return { ...state, hour, day, week, window, progress, claimed: state.claimed.filter((id) => !QUESTS.some((q) => q.id === id && stale(q))) };
}

/** Adds `count` to the lifetime total and to every unclaimed quest on the board waiting for `event` (capped at its goal). */
export function recordQuestEvent(state: IQuestState, event: QuestEvent, now: number, count = 1): IQuestState {
  const s = refreshQuests(state, now);
  if (count <= 0) return s;
  const progress = { ...s.progress };
  for (const q of QUESTS) {
    if (q.event !== event || s.claimed.includes(q.id) || !isActive(q, now)) continue;
    progress[q.id] = Math.min(q.goal, (progress[q.id] ?? 0) + count);
  }
  return { ...s, progress, totals: { ...s.totals, [event]: (s.totals[event] ?? 0) + count } };
}

/** Progress towards the goal; one-time quests count everything done since tracking began (#158). */
export function questProgress(state: IQuestState, q: IQuest): number {
  const own = state.progress[q.id] ?? 0;
  return Math.min(q.goal, q.kind === 'once' ? Math.max(own, state.totals[q.event] ?? 0) : own);
}

export function isClaimable(state: IQuestState, q: IQuest): boolean {
  return !state.claimed.includes(q.id) && questProgress(state, q) >= q.goal;
}

export type QuestStatus = 'claimable' | 'progress' | 'idle' | 'claimed';

/** The colour-coded state of a quest (#158): 受け取れる / 進行中 / 未着手 / 受取済. */
export function questStatus(state: IQuestState, q: IQuest): QuestStatus {
  if (state.claimed.includes(q.id)) return 'claimed';
  if (isClaimable(state, q)) return 'claimable';
  return questProgress(state, q) > 0 ? 'progress' : 'idle';
}

const STATUS_ORDER: QuestStatus[] = ['claimable', 'progress', 'idle', 'claimed'];

/** The board for a kind (#158): its active quests, claimable first, then in progress, not started, claimed; at most 10. */
export function questBoard(state: IQuestState, kind: QuestKind, now: number): IQuest[] {
  const s = refreshQuests(state, now);
  const list = activeQuests(kind, now);
  return [...list]
    .sort((a, b) => STATUS_ORDER.indexOf(questStatus(s, a)) - STATUS_ORDER.indexOf(questStatus(s, b)) || list.indexOf(a) - list.indexOf(b))
    .slice(0, QUESTS_SHOWN.once);
}

/** Number of rewards waiting (the badge on the menu). */
export function claimableCount(state: IQuestState, now: number): number {
  const s = refreshQuests(state, now);
  return QUEST_KINDS.reduce((n, k) => n + activeQuests(k, now).filter((q) => isClaimable(s, q)).length, 0);
}

/** Takes a finished quest's reward; null when it isn't finished, isn't on the board or was already taken. */
export function claimQuest(state: IQuestState, id: string, now: number): { state: IQuestState; reward: Partial<IResources>; items: Partial<IItems>; medal?: string; captains: number; gold: number } | null {
  const s = refreshQuests(state, now);
  const q = QUESTS.find((x) => x.id === id);
  if (!q || !isActive(q, now) || !isClaimable(s, q)) return null;
  return { state: { ...s, claimed: [...s.claimed, id] }, reward: q.reward, items: q.items ?? {}, medal: q.medal, captains: q.captains ?? 0, gold: q.gold ?? 0 };
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
  const totals: Partial<Record<QuestEvent, number>> = {};
  if (typeof o.totals === 'object' && o.totals !== null) {
    for (const [k, x] of Object.entries(o.totals as Record<string, unknown>)) if (typeof x === 'number' && Number.isFinite(x) && x > 0) totals[k as QuestEvent] = x;
  }
  return {
    day: num(o.day),
    week: num(o.week),
    hour: num(o.hour),
    ...(typeof o.window === 'number' && Number.isFinite(o.window) ? { window: o.window } : {}),
    progress,
    claimed: Array.isArray(o.claimed) ? o.claimed.filter((x): x is string => typeof x === 'string') : [],
    totals,
  };
}

/** Records several events on a nation's progress at once. */
export function withQuestEvents<T extends { quests: IQuestState }>(progress: T, events: Array<[QuestEvent, number]>, now: number): T {
  let quests = progress.quests;
  for (const [event, count] of events) quests = recordQuestEvent(quests, event, now, count);
  return quests === progress.quests ? progress : { ...progress, quests };
}

/** Item names (#184): from items.json, the one table of items. */
export const ITEM_LABEL = Object.fromEntries((itemData as { items: Array<{ id: string; name: string }> }).items.filter((i) => i.id !== 'gold').map((i) => [i.id, i.name])) as Record<keyof IItems, string>;

/** "高速修理材 2・高速建造材 1" ('' when none). */
export function formatItems(items: Partial<IItems>): string {
  return (Object.keys(ITEM_LABEL) as Array<keyof IItems>).filter((k) => (items[k] ?? 0) > 0).map((k) => `${ITEM_LABEL[k]} ${items[k]}`).join('・');
}

/** Short item names for a narrow reward line (#336): "修理材 6・教範 3". */
const RESOURCE_SHORT: Record<keyof IResources, string> = { fuel: '燃', ammo: '弾', steel: '鋼', bauxite: 'ボ' };
const ITEM_SHORT: Record<keyof IItems, string> = { fastRepair: '修理材', fastBuild: '建造材', captainBook: '教本', trainingManual: '教範', supplyShip: '給糧艦' };

/**
 * A quest's reward in short for a phone (#336): "燃 4800 弾 4800・修理材 6・G 150・艦長 +1", so a weekly's fits two
 * lines (the long form shrank out of reading and the gold was lost).
 */
export function shortReward(q: { reward: Partial<IResources>; items?: Partial<IItems>; gold?: number; captains?: number }, medal?: string): string {
  const res = (Object.keys(q.reward) as Array<keyof IResources>).filter((k) => (q.reward[k] ?? 0) > 0).map((k) => `${RESOURCE_SHORT[k]} ${q.reward[k]}`).join(' ');
  const items = (Object.keys(ITEM_SHORT) as Array<keyof IItems>).filter((k) => (q.items?.[k] ?? 0) > 0).map((k) => `${ITEM_SHORT[k]} ${q.items?.[k]}`);
  return [res, ...items, q.gold ? `G ${q.gold}` : '', q.captains ? `艦長 +${q.captains}` : '', medal ? `勲章「${medal}」` : ''].filter((t) => t).join('・');
}

export function addItems(have: IItems, add: Partial<IItems>): IItems {
  return { fastRepair: have.fastRepair + (add.fastRepair ?? 0), fastBuild: have.fastBuild + (add.fastBuild ?? 0), captainBook: (have.captainBook ?? 0) + (add.captainBook ?? 0), trainingManual: (have.trainingManual ?? 0) + (add.trainingManual ?? 0), supplyShip: (have.supplyShip ?? 0) + (add.supplyShip ?? 0) };
}
