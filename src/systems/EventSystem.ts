import campaignData from '@/data/campaign.json';
import { IResources } from '@/types/Progression';
import { RESOURCE_KEYS } from './ResourceSystem';

/**
 * Limited-time events (#89, pure). There is no server, so the event running at any moment comes from a fixed table
 * of the date (the game day starts at 05:00 JST) and a three-hour window: every player sees the same event at the
 * same time, offline too.
 */

export type EventKind = 'double' | 'steel' | 'training' | 'repair';

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
  /** Proficiency and captain XP multiplier (熟練度ブースト) */
  xpMul: number;
  /** Repair cost and time multiplier (入渠半額) */
  repairMul: number;
}

export const NO_EVENT: IEventEffects = { theaterRewardMul: 1, steelMul: 1, xpMul: 1, repairMul: 1 };

const HOUR = 3_600_000;
/** 05:00 JST = 20:00 UTC: the game day's start, as an offset from UTC midnight. */
const DAY_START_UTC = 20 * HOUR;
export const EVENT_WINDOW_MS = 3 * HOUR;
const WINDOWS_PER_DAY = 8;
/** Out of 10 windows: 6 have no event. */
const KINDS: Array<EventKind | null> = ['double', 'double', 'steel', 'training', 'repair', null, null, null, null, null];
export const THEATERS = (campaignData as { theaters: Array<{ id: string; name: string }> }).theaters;

export const EVENT_NAME: Record<EventKind, string> = {
  double: '報酬 2 倍',
  steel: '鋼材祭り',
  training: '熟練度ブースト',
  repair: '入渠半額',
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

/** The event running at `now`, if any. */
export function eventAt(now: number): IGameEvent | null {
  const w = windowIndex(now);
  const h = hash(w);
  const kind = KINDS[h % KINDS.length];
  if (!kind) return null;
  const startsAt = DAY_START_UTC + w * EVENT_WINDOW_MS;
  const event: IGameEvent = { kind, startsAt, endsAt: startsAt + EVENT_WINDOW_MS };
  if (kind === 'double') event.theater = THEATERS[(h >>> 8) % THEATERS.length]?.id;
  return event;
}

/** The next event after the current window (for "次のイベント"), looking at most a day ahead. */
export function nextEvent(now: number): IGameEvent | null {
  const w = windowIndex(now);
  for (let i = 1; i <= WINDOWS_PER_DAY; i++) {
    const e = eventAt(DAY_START_UTC + (w + i) * EVENT_WINDOW_MS);
    if (e) return e;
  }
  return null;
}

export function eventEffects(event: IGameEvent | null): IEventEffects {
  if (!event) return NO_EVENT;
  switch (event.kind) {
    case 'double': return { ...NO_EVENT, theaterRewardMul: 2, theater: event.theater };
    case 'steel': return { ...NO_EVENT, steelMul: 1.5 };
    case 'training': return { ...NO_EVENT, xpMul: 1.5 };
    case 'repair': return { ...NO_EVENT, repairMul: 0.5 };
  }
}

/** A battle reward with the event applied; `theater` is the campaign area's theater (none for exercises). */
export function applyEventReward(reward: IResources, effects: IEventEffects, theater?: string): IResources {
  const mul = theater && theater === effects.theater ? effects.theaterRewardMul : 1;
  if (mul === 1 && effects.steelMul === 1) return reward;
  const out = { ...reward };
  for (const k of RESOURCE_KEYS) out[k] = Math.round(reward[k] * mul * (k === 'steel' ? effects.steelMul : 1));
  return out;
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
