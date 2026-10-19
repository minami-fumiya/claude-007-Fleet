import campaignData from '@/data/campaign.json';
import { IResources } from '@/types/Progression';
import { RESOURCE_KEYS } from './ResourceSystem';
import { DAY_START_UTC } from './QuestSystem';

/**
 * Limited-time events (#89, pure). There is no server, so the event running at any moment comes from a fixed table
 * of the date (the game day starts at 00:00 JST, #219) and a three-hour window: every player sees the same event at
 * the same time, offline too. Since #218 every window has an event, and 報酬 2 倍 comes at most twice a day.
 */

export type EventKind = 'double' | 'steel' | 'training' | 'repair' | 'fuel' | 'ammo' | 'bauxite';

export interface IGameEvent {
  kind: EventKind;
  /** Theater id for 'double' */
  theater?: string;
  startsAt: number;
  endsAt: number;
}

export interface IEventEffects {
  /** Battle resource reward multiplier for a campaign area in `theater` (報酬 2 倍) */
  theaterRewardMul: number;
  theater?: string;
  /** Extra multiplier on the steel of every battle reward (鋼材祭り) */
  steelMul: number;
  /** The same for fuel, ammo and bauxite (燃料・弾薬・ボーキ祭り, #218) */
  fuelMul: number;
  ammoMul: number;
  bauxiteMul: number;
  /** Proficiency and captain XP multiplier (熟練度ブースト) */
  xpMul: number;
  /** Repair cost and time multiplier (入渠半額) */
  repairMul: number;
}

export const NO_EVENT: IEventEffects = { theaterRewardMul: 1, steelMul: 1, fuelMul: 1, ammoMul: 1, bauxiteMul: 1, xpMul: 1, repairMul: 1 };

const HOUR = 3_600_000;
export const EVENT_WINDOW_MS = 3 * HOUR;
export const WINDOWS_PER_DAY = 8;
/** What a window can hold (#218: never nothing); 報酬 2 倍 is weighted but capped at MAX_DOUBLE a day. */
const KINDS: EventKind[] = ['double', 'double', 'steel', 'steel', 'training', 'repair', 'fuel', 'ammo', 'bauxite'];
const OTHER_KINDS: EventKind[] = KINDS.filter((k) => k !== 'double');
export const MAX_DOUBLE = 2;
export const THEATERS = (campaignData as { theaters: Array<{ id: string; name: string }> }).theaters;

export const EVENT_NAME: Record<EventKind, string> = {
  double: '報酬 2 倍',
  steel: '鋼材祭り',
  training: '熟練度ブースト',
  repair: '入渠半額',
  fuel: '燃料祭り',
  ammo: '弾薬祭り',
  bauxite: 'ボーキ祭り',
};

/** Small integer hash (mulberry-style), the same on every device. */
function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Index of the three-hour window `now` is in, counted from the epoch's first game day. */
export function windowIndex(now: number): number {
  return Math.floor((now - DAY_START_UTC) / EVENT_WINDOW_MS);
}

/** A game day's eight events, 00:00〜24:00 JST (#218): one per window, 報酬 2 倍 at most MAX_DOUBLE times. */
export function daySchedule(day: number): IGameEvent[] {
  let doubles = 0;
  const out: IGameEvent[] = [];
  for (let i = 0; i < WINDOWS_PER_DAY; i++) {
    const w = day * WINDOWS_PER_DAY + i;
    const h = hash(w);
    let kind = KINDS[h % KINDS.length];
    if (kind === 'double' && doubles >= MAX_DOUBLE) kind = OTHER_KINDS[(h >>> 4) % OTHER_KINDS.length];
    if (kind === 'double') doubles++;
    const startsAt = DAY_START_UTC + w * EVENT_WINDOW_MS;
    const event: IGameEvent = { kind, startsAt, endsAt: startsAt + EVENT_WINDOW_MS };
    if (kind === 'double') event.theater = THEATERS[(h >>> 8) % THEATERS.length]?.id;
    out.push(event);
  }
  return out;
}

/** The event running at `now` (since #218 there always is one; null is kept for the clock-rollback guard). */
export function eventAt(now: number): IGameEvent | null {
  const w = windowIndex(now);
  const day = Math.floor(w / WINDOWS_PER_DAY);
  return daySchedule(day)[w - day * WINDOWS_PER_DAY];
}

/** The event of the next window (for "次のイベント"). */
export function nextEvent(now: number): IGameEvent | null {
  return eventAt(DAY_START_UTC + (windowIndex(now) + 1) * EVENT_WINDOW_MS);
}

export function eventEffects(event: IGameEvent | null): IEventEffects {
  if (!event) return NO_EVENT;
  switch (event.kind) {
    case 'double': return { ...NO_EVENT, theaterRewardMul: 2, theater: event.theater };
    case 'steel': return { ...NO_EVENT, steelMul: 1.5 };
    case 'training': return { ...NO_EVENT, xpMul: 1.5 };
    case 'repair': return { ...NO_EVENT, repairMul: 0.5 };
    case 'fuel': return { ...NO_EVENT, fuelMul: 1.5 };
    case 'ammo': return { ...NO_EVENT, ammoMul: 1.5 };
    case 'bauxite': return { ...NO_EVENT, bauxiteMul: 1.5 };
  }
}

/** A battle reward with the event applied; `theater` is the campaign area's theater (none for exercises). */
export function applyEventReward(reward: IResources, effects: IEventEffects, theater?: string): IResources {
  const mul = theater && theater === effects.theater ? effects.theaterRewardMul : 1;
  const per = { fuel: effects.fuelMul, ammo: effects.ammoMul, steel: effects.steelMul, bauxite: effects.bauxiteMul };
  if (mul === 1 && Object.values(per).every((m) => m === 1)) return reward;
  const out = { ...reward };
  for (const k of RESOURCE_KEYS) out[k] = Math.round(reward[k] * mul * (per[k] ?? 1));
  return out;
}

/** Whether `event` changes a battle fought in `theater` (none for exercises): what the results should mention. */
export function eventAppliesToBattle(event: IGameEvent | null, theater?: string): event is IGameEvent {
  if (!event) return false;
  if (event.kind === 'double') return theater !== undefined && theater === event.theater;
  return event.kind !== 'repair';
}

/** "報酬 2 倍 (太平洋)" */
export function eventLabel(event: IGameEvent): string {
  const theater = event.theater ? THEATERS.find((t) => t.id === event.theater)?.name : undefined;
  return theater ? `${EVENT_NAME[event.kind]} (${theater})` : EVENT_NAME[event.kind];
}

/**
 * Clock rollback guard: the newest time the save has seen. A clock set back before it gets no event (so winding
 * the clock to replay an event doesn't pay), until real time passes it again.
 */
export function eventFor(now: number, lastSeenAt: number): IGameEvent | null {
  return now + 60_000 < lastSeenAt ? null : eventAt(now);
}
