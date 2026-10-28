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
  /** A sea's expedition (#373): opened by the 前進遠征拠点 of the navy's forward base there, not by the rank */
  theater?: string;
}

/** What a sea's expedition pays at its base's 前進遠征拠点 Lv2 (#373). */
export const OUTPOST_REWARD_MUL = 1.2;

/** An expedition under way: its ships and when they are back. */
export interface IExpeditionRun {
  id: string;
  shipIds: string[];
  endsAt: number;
}

export const EXPEDITIONS = expeditionData.expeditions as IExpedition[];

/**
 * The expeditions the list shows (#359): those the rank has opened, newest first, after the one the next rank opens
 * (shown locked, as a goal). Expeditions out keep their card whatever the rank.
 */
export function shownExpeditions(rankIndex: number, runs: readonly IExpeditionRun[] = [], all: readonly IExpedition[] = EXPEDITIONS, seas: ReadonlySet<string> = new Set()): IExpedition[] {
  // The seas' expeditions (#373) come first when their base's 前進遠征拠点 opens them.
  const out = (e: IExpedition): boolean => runs.some((r) => r.id === e.id);
  const sea = all.filter((e) => e.theater && (seas.has(e.theater) || out(e)));
  const open = all.filter((e) => !e.theater && (e.rank <= rankIndex || out(e))).sort((a, b) => b.rank - a.rank);
  const next = all.filter((e) => !e.theater && e.rank > rankIndex && !open.includes(e)).sort((a, b) => a.rank - b.rank)[0];
  return [...(next ? [next] : []), ...sea, ...open];
}

/** The expeditions `rankIndex` opens (#359): shown on the promotion and in the rank list. */
export function expeditionsAt(rankIndex: number, all: readonly IExpedition[] = EXPEDITIONS): IExpedition[] {
  return all.filter((e) => !e.theater && e.rank === rankIndex);
}

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

/**
 * What keeps a chosen group (遠征用の編成, #337) from going: "あと 1 隻" / "駆逐艦があと 1 隻" / "多すぎる (3 隻まで)";
 * null when it fits.
 */
export function groupProblem(exp: IExpedition, group: readonly Pick<IShipData, 'shipClass'>[], classLabel: (c: ShipClass) => string = (c) => c): string | null {
  for (const [cls, n] of Object.entries(exp.needs) as Array<[ShipClass, number]>) {
    const have = group.filter((s) => s.shipClass === cls).length;
    if (have < n) return `${classLabel(cls)}があと ${n - have} 隻`;
  }
  if (group.length < exp.ships) return `あと ${exp.ships - group.length} 隻`;
  if (group.length > exp.ships) return `多すぎる (${exp.ships} 隻まで)`;
  return null;
}

/**
 * Sends `exp` out: with `group` when the player chose one (#337) and it fits from the idle ships, else with the
 * picked ships. Null when it can't go.
 */
export function startExpedition(runs: readonly IExpeditionRun[], exp: IExpedition, rankIndex: number, idle: readonly IShipData[], now: number, group?: readonly IShipData[]): IExpeditionRun[] | null {
  if (expeditionState(exp, runs, rankIndex, idle) !== 'ready') return null;
  const chosen = group && group.every((s) => idle.some((i) => i.id === s.id)) && groupProblem(exp, group) === null ? group : null;
  const ships = chosen ?? pickShips(exp, idle)!;
  return [...runs, { id: exp.id, shipIds: ships.map((s) => s.id), endsAt: now + exp.minutes * 60_000 }];
}

/** 呼び戻す (#337): the expedition comes home at once, its ships free again, without its reward. */
export function recallExpedition(runs: readonly IExpeditionRun[], id: string): IExpeditionRun[] {
  return runs.filter((r) => r.id !== id);
}

/** The group last sent on `exp`, if every ship of it is idle again: the next send takes it as it was. */
export function rememberedGroup(groups: Readonly<Record<string, string[]>> | undefined, exp: IExpedition, idle: readonly IShipData[]): IShipData[] | null {
  const ids = groups?.[exp.id];
  if (!ids || ids.length === 0) return null;
  const ships = ids.map((id) => idle.find((s) => s.id === id));
  if (ships.some((s) => !s)) return null;
  const group = ships as IShipData[];
  return groupProblem(exp, group) === null ? group : null;
}

/**
 * Takes home every expedition that is back by `now`: the reward (under the cap) and the runs left out. `done` counts
 * the expeditions that came back.
 */
export function collectExpeditions(
  have: IResources, runs: readonly IExpeditionRun[], cap: IResources, now: number, rewardMul: (exp: IExpedition) => number = () => 1,
): { resources: IResources; lost: IResources; runs: IExpeditionRun[]; done: number; gained: IResources } {
  let res = resources(have);
  const lost = resources();
  const gained = resources();
  let done = 0;
  for (const r of runs.filter((x) => x.endsAt <= now)) {
    const exp = EXPEDITIONS.find((e) => e.id === r.id);
    if (!exp) continue;
    // 前進遠征拠点 Lv2 (#373): a sea's expedition pays more.
    const mul = rewardMul(exp);
    const reward: Partial<IResources> = Object.fromEntries(Object.entries(exp.reward).map(([k, v]) => [k, Math.round((v ?? 0) * mul)]));
    const g = gainResources(res, reward, cap);
    res = g.resources;
    for (const k of Object.keys(lost) as Array<keyof IResources>) {
      lost[k] += g.lost[k];
      gained[k] += reward[k] ?? 0;
    }
    done++;
  }
  return { resources: res, lost, runs: runs.filter((x) => x.endsAt > now), done, gained };
}

/** "鋼材 640 · 2 時間" */
export function expeditionLength(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} 時間` : `${minutes} 分`;
}
