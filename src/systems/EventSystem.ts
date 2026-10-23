import campaignData from '@/data/campaign.json';
import { IResources } from '@/types/Progression';
import { RESOURCE_KEYS } from './ResourceSystem';
import { DAY_START_UTC } from './QuestSystem';

/**
 * Limited-time events (#89, pure). There is no server, so the event running at any moment comes from a fixed table
 * of the date (the game day starts at 00:00 JST, #219) and a three-hour window: every player sees the same event at
 * the same time, offline too. Since #218 every window has an event, and 報酬 2 倍 comes at most twice a day.
 */

export type EventKind = 'double' | 'steel' | 'training' | 'repair' | 'fuel' | 'ammo' | 'bauxite' | 'superweapon';

export interface IGameEvent {
  kind: EventKind;
  /** Theater id for 'double' and 'superweapon' */
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
  /** 超兵器出現 (#148): the theater whose main fleets bring their superweapon */
  superweaponTheater?: string;
}

export const NO_EVENT: IEventEffects = { theaterRewardMul: 1, steelMul: 1, fuelMul: 1, ammoMul: 1, bauxiteMul: 1, xpMul: 1, repairMul: 1 };

const HOUR = 3_600_000;
/** One event an hour (#344; three hours before 0.0.45). */
export const EVENT_WINDOW_MS = HOUR;
export const WINDOWS_PER_DAY = 24;
/** What a window can hold (#218: never nothing); 報酬 2 倍 is weighted but capped at MAX_DOUBLE a day. */
const KINDS: EventKind[] = ['double', 'double', 'steel', 'steel', 'training', 'repair', 'fuel', 'ammo', 'bauxite', 'superweapon'];
export const MAX_DOUBLE = 6;
/**
 * 超兵器出現 (#148 #344): every SUPERWEAPON_EVERY-th hour, from an hour that moves day by day, so four or five a day
 * and at night too (the user's call, 2026-10-23).
 */
export const SUPERWEAPON_EVERY = 5;
export const MAX_SUPERWEAPON = Math.ceil(WINDOWS_PER_DAY / SUPERWEAPON_EVERY);
export const MIN_SUPERWEAPON = Math.floor(WINDOWS_PER_DAY / SUPERWEAPON_EVERY);
export const THEATERS = (campaignData as { theaters: Array<{ id: string; name: string }> }).theaters;

export const EVENT_NAME: Record<EventKind, string> = {
  double: '報酬 2 倍',
  steel: '鋼材祭り',
  training: '熟練度ブースト',
  repair: '入渠半額',
  fuel: '燃料祭り',
  ammo: '弾薬祭り',
  bauxite: 'ボーキ祭り',
  superweapon: '超兵器出現',
};

/** Small integer hash (mulberry-style), the same on every device. */
function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Index of the hour-long window `now` is in, counted from the epoch's first game day. */
export function windowIndex(now: number): number {
  return Math.floor((now - DAY_START_UTC) / EVENT_WINDOW_MS);
}

/**
 * A game day's events, 00:00〜24:00 JST, one an hour (#218 #344): 超兵器 every fifth hour, 報酬 2 倍 at most
 * MAX_DOUBLE times, and never the same kind two hours running.
 */
export function daySchedule(day: number): IGameEvent[] {
  let doubles = 0;
  const offset = hash(day * 7919) % SUPERWEAPON_EVERY;
  const out: IGameEvent[] = [];
  for (let i = 0; i < WINDOWS_PER_DAY; i++) {
    const w = day * WINDOWS_PER_DAY + i;
    const h = hash(w);
    const prev = out[i - 1]?.kind;
    // The weighted kinds, less the hour before's (no kind two hours running) and 報酬 2 倍 once it has had its hours.
    const pool = KINDS.filter((k) => k !== 'superweapon' && k !== prev && (k !== 'double' || doubles < MAX_DOUBLE));
    const kind: EventKind = (i + offset) % SUPERWEAPON_EVERY === 0 ? 'superweapon' : pool[h % pool.length];
    if (kind === 'double') doubles++;
    const startsAt = DAY_START_UTC + w * EVENT_WINDOW_MS;
    const event: IGameEvent = { kind, startsAt, endsAt: startsAt + EVENT_WINDOW_MS };
    if (kind === 'double' || kind === 'superweapon') event.theater = THEATERS[(h >>> 8) % THEATERS.length]?.id;
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
    case 'superweapon': return { ...NO_EVENT, superweaponTheater: event.theater };
  }
}

/** What an event does, from its effects (#316: the help's event tab never drifts from the numbers). */
export function eventHelp(kind: EventKind): string {
  const e = eventEffects({ kind, theater: 'pacific' } as IGameEvent);
  const pct = (m: number): string => `${Math.round(Math.abs(m - 1) * 100)}%`;
  switch (kind) {
    case 'double': return `1 つの戦域で、作戦の報酬が ${e.theaterRewardMul} 倍 (1 日 ${MAX_DOUBLE} 回まで)。`;
    case 'steel': return `戦闘で得る鋼材が ${pct(e.steelMul)} 増える。`;
    case 'fuel': return `戦闘で得る燃料が ${pct(e.fuelMul)} 増える。`;
    case 'ammo': return `戦闘で得る弾薬が ${pct(e.ammoMul)} 増える。`;
    case 'bauxite': return `戦闘で得るボーキが ${pct(e.bauxiteMul)} 増える。`;
    case 'training': return `艦の熟練度と艦長の経験値が ${pct(e.xpMul)} 増える。`;
    case 'repair': return `入渠の時間と資源が ${pct(e.repairMul)} 減る。`;
    case 'superweapon': return `1 つの戦域の主力艦隊に、その国の超兵器が加わる。撃沈するとゴールドが入る (${SUPERWEAPON_EVERY} 時間ごと、1 日 ${MIN_SUPERWEAPON}〜${MAX_SUPERWEAPON} 回)。`;
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
  if (event.kind === 'double' || event.kind === 'superweapon') return theater !== undefined && theater === event.theater;
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
