/**
 * 画面の外の艦隊 (#445, 0.0.72 段階 B1, pure): fleets the player is not steering sail by their orders in the world's
 * time. A 回航 order is a sea route and a destination; the fleet's place on it follows from the clock (OFFSCREEN_SPEED
 * sectors a world hour), so a fleet sent off while the game was closed has gone on meanwhile (up to a world day is
 * looked at in one go). On the way an enemy resident within sight fights it by a light reckoning of the two fleets'
 * strength: ships are hurt but never sunk, the enemy is beaten when the fleet is the stronger, and a fleet hurt down
 * to its 帰投の基準 turns for the nearest dock.
 */
import {
  FUEL_MAX, IAnchorPlace, IAnchoredFleet, ISectorRef, SECTOR_PX, WORLD_PX, colGap, routeFuel, sectorAt,
} from '@/systems/OpenSeaSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { IFleetOrder, ReturnRule } from '@/systems/FleetOrderTypes';

export { parseOrder, parseReturnRule } from '@/systems/FleetOrderTypes';
export type { IFleetOrder, ReturnRule } from '@/systems/FleetOrderTypes';
import { IResident, MEET_PX, residentPos, worldGap } from '@/systems/WorldSim';

export const RETURN_RULES: readonly ReturnRule[] = ['heavy', 'medium', 'none'];
export const RETURN_AT: Record<ReturnRule, number> = { none: 0, heavy: 0.25, medium: 0.5 };
export const RETURN_JA: Record<ReturnRule, string> = { none: 'なし', heavy: '大破で帰投', medium: '中破で帰投' };
/** For a small button: 帰投 大破 / 中破 / なし */
export const RETURN_SHORT: Record<ReturnRule, string> = { none: 'なし', heavy: '大破', medium: '中破' };

/** Sectors a world hour a fleet makes off-screen (a little under a steered fleet's cruise). */
export const OFFSCREEN_SPEED = 10;
/** The world hours looked at in one go (a fleet left a long time is only followed for a world day). */
export const CATCH_UP_HOURS = 24;
/** The time step of the off-screen watch, in world hours. */
const STEP_HOURS = 0.25;
/** No ship sinks off-screen: it stays at least this whole. */
export const OFFSCREEN_FLOOR = 0.05;


/** An anchorage, which since 0.0.72 may carry a running order and its own 帰投の基準 (missing: 大破). */
export type IMovingFleet = IAnchoredFleet;

function segLength(a: ISectorRef, b: ISectorRef): number {
  return Math.hypot(colGap(a.c, b.c), b.r - a.r);
}

export function routeSectors(route: readonly ISectorRef[]): number {
  let len = 0;
  for (let i = 1; i < route.length; i++) len += segLength(route[i - 1], route[i]);
  return len;
}

/** Real ms the run takes. */
export function runMs(route: readonly ISectorRef[]): number {
  return Math.round((routeSectors(route) / OFFSCREEN_SPEED) * WORLD_HOUR_MS);
}

export function arrivesAt(order: IFleetOrder): number {
  return order.startedAt + runMs(order.route);
}

/** Where a fleet under orders is at `t` (world px; at the destination once arrived). */
export function orderPos(order: IFleetOrder, t: number): { x: number; y: number } {
  const done = ((Math.max(0, t - order.startedAt) / WORLD_HOUR_MS) * OFFSCREEN_SPEED);
  let d = done;
  for (let i = 1; i < order.route.length; i++) {
    const a = order.route[i - 1];
    const b = order.route[i];
    const len = segLength(a, b);
    if (d <= len) {
      const k = len > 0 ? d / len : 0;
      let dc = b.c - a.c;
      if (Math.abs(dc) > WORLD_PX.w / SECTOR_PX / 2) dc -= Math.sign(dc) * (WORLD_PX.w / SECTOR_PX);
      const x = ((((a.c + 0.5 + dc * k) * SECTOR_PX) % WORLD_PX.w) + WORLD_PX.w) % WORLD_PX.w;
      return { x, y: (a.r + 0.5 + (b.r - a.r) * k) * SECTOR_PX };
    }
    d -= len;
  }
  return { x: order.dest.x, y: order.dest.y };
}

/** A new 回航 order from where the fleet is now, or why it can't go. */
export function orderVoyage(fleet: IMovingFleet, route: ISectorRef[] | null, dest: IAnchorPlace, now: number): IMovingFleet | string {
  if (!route || route.length < 2) return '海の上の航路がありません';
  if (routeFuel(route) > (fleet.fuel ?? FUEL_MAX)) return `燃料が足りません (必要 ${routeFuel(route)})`;
  return { ...fleet, order: { route, dest, startedAt: now, checkedAt: now, met: [] } };
}

export function isMoving(f: IMovingFleet): boolean {
  return f.order !== undefined;
}

/** The ships on a run (they are at no anchorage until it ends). */
export function movingShips(anchors: readonly IMovingFleet[]): Set<string> {
  return new Set(anchors.filter(isMoving).flatMap((a) => a.shipIds));
}

/** What the off-screen watch needs from the game (kept outside so the reckoning stays pure). */
export interface IOffscreenWorld {
  /** Enemy residents of the seas (patrols and convoys) */
  residents: readonly IResident[];
  /** Residents already sunk or met (they don't fight again) */
  won: (id: string) => boolean;
  /** A fleet's strength from its ships and their HP (0..1 each) */
  power: (shipIds: readonly string[], hp: Readonly<Record<string, number>>) => number;
  /** A resident's strength */
  enemyPower: (r: IResident) => number;
  /** The nearest base with a dock, from a sector (where a hurt fleet turns) */
  homeFrom: (s: ISectorRef) => { route: ISectorRef[]; dest: IAnchorPlace } | null;
}

export interface IOffscreenFight {
  shipIds: string[];
  residentId: string;
  won: boolean;
  /** HP lost, per ship (as a share of full) */
  hurt: Record<string, number>;
  turnedHome: boolean;
  at: number;
}

/** A fixed pseudo-random 0..1 from a text (the same fight always hurts the same). */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** The share of HP a fight takes off each ship: more against a stronger enemy, at least 5%, at most half. */
export function offscreenHurt(ours: number, theirs: number, seed: string): number {
  const base = 0.06 + 0.24 * (theirs / Math.max(1, ours));
  return Math.max(0.05, Math.min(0.5, base * (0.8 + 0.4 * hash01(seed))));
}

/**
 * Brings every fleet under orders up to `now`: fights met on the way, the turn for home, and the arrival (the fleet
 * lies at its destination; a base fills the tank, at sea the route's fuel is spent).
 */
export function advanceOrders(anchors: readonly IMovingFleet[], hp: Readonly<Record<string, number>>, now: number, w: IOffscreenWorld): { anchors: IMovingFleet[]; hp: Record<string, number>; fights: IOffscreenFight[] } {
  const health: Record<string, number> = { ...hp };
  const fights: IOffscreenFight[] = [];
  const out: IMovingFleet[] = [];
  for (const fleet of anchors) {
    let f = fleet;
    let order = f.order;
    if (!order) {
      out.push(f);
      continue;
    }
    const from = Math.max(order.checkedAt, now - CATCH_UP_HOURS * WORLD_HOUR_MS);
    const end = Math.min(now, arrivesAt(order));
    for (let t = from; t <= end && order; t += STEP_HOURS * WORLD_HOUR_MS) {
      const at = orderPos(order, t);
      const foe = w.residents.find((r) => r.kind !== 'friend' && r.kind !== 'superweapon' && !order!.met.includes(r.id) && !w.won(r.id) && worldGap(residentPos(r, t), at) <= MEET_PX);
      if (!foe) continue;
      const ours = w.power(f.shipIds, health);
      const theirs = w.enemyPower(foe);
      const hurt: Record<string, number> = {};
      for (const id of f.shipIds) {
        const lost = offscreenHurt(ours, theirs, `${foe.id}:${id}`);
        const before = health[id] ?? 1;
        const after = Math.max(OFFSCREEN_FLOOR, before - lost);
        hurt[id] = before - after;
        health[id] = after;
      }
      const won = ours >= theirs;
      order = { ...order, met: [...order.met, foe.id] };
      // 帰投の基準: hurt down to it, the fleet turns for the nearest dock from here.
      const rule = RETURN_AT[f.returnAt ?? 'heavy'];
      const low = f.shipIds.some((id) => (health[id] ?? 1) <= rule);
      let turnedHome = false;
      if (low && !order.home) {
        const back = w.homeFrom(sectorAt(at.x, at.y));
        if (back) {
          order = { route: back.route, dest: back.dest, startedAt: t, checkedAt: t, met: order.met, home: true };
          turnedHome = true;
        }
      }
      fights.push({ shipIds: [...f.shipIds], residentId: foe.id, won, hurt, turnedHome, at: t });
      if (turnedHome) break;
    }
    if (!order) continue;
    if (now >= arrivesAt(order)) {
      const fuel = order.dest.base ? FUEL_MAX : Math.max(0, (f.fuel ?? FUEL_MAX) - routeFuel(order.route));
      f = { shipIds: f.shipIds, at: order.dest, fuel, ...(f.returnAt ? { returnAt: f.returnAt } : {}) };
    } else f = { ...f, order: { ...order, checkedAt: now } };
    out.push(f);
  }
  return { anchors: out, hp: health, fights };
}

