import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IResources } from '@/types/Progression';
import expeditionData from '@/data/expeditions.json';
import { gainResources, resources } from './ResourceSystem';

/**
 * 遠征 (#41, pure): ships that are not fighting go out for a while and bring resources home. The ships are away
 * until they return (no sortie, dock or dorm); the reward is taken when they are back, up to the holding cap.
 */

export interface IExpedition {
  id: string;
  name: string;
  minutes: number;
  /** Ships the group sails with */
  ships: number;
  /** Ship classes the group must include */
  needs: Partial<Record<ShipClass, number>>;
  /** Rank index needed */
  rank: number;
  reward: Partial<IResources>;
}

/** An expedition under way: its ships and when they are back. */
export interface IExpeditionRun {
  id: string;
  shipIds: string[];
  endsAt: number;
}

export const EXPEDITIONS = expeditionData.expeditions as IExpedition[];

/** Expeditions out at once by rank index: one, a second at 少佐, a third at 准将. */
export function expeditionSlots(rankIndex: number): number {
  return 1 + (rankIndex >= 6 ? 1 : 0) + (rankIndex >= 9 ? 1 : 0);
}

/** Ship ids out on an expedition. */
export function shipsAway(runs: readonly IExpeditionRun[] = []): Set<string> {
  return new Set(runs.flatMap((r) => r.shipIds));
}

/**
 * The group an expedition takes from `idle`: the classes it needs first, then the rest, smallest ships first (so the
 * battle fleet keeps its big ships). Null when the idle ships can't make it up.
 */
export function pickShips(exp: IExpedition, idle: readonly IShipData[]): IShipData[] | null {
  const small = [...idle].sort((a, b) => a.hp - b.hp);
  const picked: IShipData[] = [];
  for (const [cls, n] of Object.entries(exp.needs) as Array<[ShipClass, number]>) {
    const of = small.filter((s) => s.shipClass === cls && !picked.includes(s)).slice(0, n);
    if (of.length < n) return null;
    picked.push(...of);
  }
  for (const s of small) {
    if (picked.length >= exp.ships) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.length >= exp.ships ? picked : null;
}

export type ExpeditionState = 'rank' | 'busy' | 'slots' | 'ships' | 'ready';

/** Whether `exp` can go now: rank, already out, a free slot, and ships to make up the group. */
export function expeditionState(exp: IExpedition, runs: readonly IExpeditionRun[], rankIndex: number, idle: readonly IShipData[]): ExpeditionState {
  if (rankIndex < exp.rank) return 'rank';
  if (runs.some((r) => r.id === exp.id)) return 'busy';
  if (runs.length >= expeditionSlots(rankIndex)) return 'slots';
  return pickShips(exp, idle) ? 'ready' : 'ships';
}

/** Sends `exp` out with its picked ships; null when it can't go. */
export function startExpedition(runs: readonly IExpeditionRun[], exp: IExpedition, rankIndex: number, idle: readonly IShipData[], now: number): IExpeditionRun[] | null {
  if (expeditionState(exp, runs, rankIndex, idle) !== 'ready') return null;
  const ships = pickShips(exp, idle)!;
  return [...runs, { id: exp.id, shipIds: ships.map((s) => s.id), endsAt: now + exp.minutes * 60_000 }];
}

/**
 * Takes home every expedition that is back by `now`: the reward (under the cap) and the runs left out. `done` counts
 * the expeditions that came back.
 */
export function collectExpeditions(have: IResources, runs: readonly IExpeditionRun[], cap: IResources, now: number): { resources: IResources; lost: IResources; runs: IExpeditionRun[]; done: number; gained: IResources } {
  let res = resources(have);
  const lost = resources();
  const gained = resources();
  let done = 0;
  for (const r of runs.filter((x) => x.endsAt <= now)) {
    const exp = EXPEDITIONS.find((e) => e.id === r.id);
    if (!exp) continue;
    const g = gainResources(res, exp.reward, cap);
    res = g.resources;
    for (const k of Object.keys(lost) as Array<keyof IResources>) {
      lost[k] += g.lost[k];
      gained[k] += exp.reward[k] ?? 0;
    }
    done++;
  }
  return { resources: res, lost, runs: runs.filter((x) => x.endsAt > now), done, gained };
}

/** "鋼材 640 · 2 時間" */
export function expeditionLength(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} 時間` : `${minutes} 分`;
}
