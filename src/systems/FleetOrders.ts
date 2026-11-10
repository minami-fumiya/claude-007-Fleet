/**
 * 画面の外の艦隊 (#445, 0.0.72 段階 B1, pure): fleets the player is not steering sail by their orders in the world's
 * time. A 回航 order is a sea route and a destination; the fleet's place on it follows from the clock (OFFSCREEN_SPEED
 * sectors a world hour), so a fleet sent off while the game was closed has gone on meanwhile (up to a world day is
 * looked at in one go). On the way an enemy resident within sight fights it by a light reckoning of the two fleets'
 * strength: ships are hurt but never sunk, the enemy is beaten when the fleet is the stronger, and a fleet hurt down
 * to its 帰投の基準 turns for the nearest dock.
 */
import {
  FUEL_MAX, IAnchorPlace, IAnchoredFleet, ISectorRef, SECTOR_PX, WORLD_PX, colGap, routeFuel, sectorAt, withoutIntercept,
} from '@/systems/OpenSeaSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { IFleetOrder, MissionKind, PatrolStance, ReturnRule } from '@/systems/FleetOrderTypes';

export { parseOrder, parseReturnRule } from '@/systems/FleetOrderTypes';
export type { IFleetOrder, MissionKind, PatrolStance, ReturnRule } from '@/systems/FleetOrderTypes';
export { MISSION_KINDS } from '@/systems/FleetOrderTypes';

/** 任務の名前 (0.0.74) */
export const MISSION_JA: Record<MissionKind | 'intercept', string> = {
  patrol: '哨戒', escort: '船団護衛', raid: '通商破壊', mine: '機雷敷設', sweep: '掃海', train: '訓練', intercept: '迎撃',
};
import { IResident, MEET_PX, ResidentKind, residentPos, worldGap } from '@/systems/WorldSim';

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
  // A patrol never arrives: it keeps its loop until called off.
  if (order.patrol) return Infinity;
  return order.startedAt + runMs(order.route);
}

/** Where along a path of sectors a fleet is after `d` sectors (world px; the end once past it). */
function pathPoint(path: readonly ISectorRef[], d: number): { x: number; y: number } | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
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
  return null;
}

/** Where a fleet under orders is at `t` (world px; at the destination once arrived). */
export function orderPos(order: IFleetOrder, t: number): { x: number; y: number } {
  const done = ((Math.max(0, t - order.startedAt) / WORLD_HOUR_MS) * OFFSCREEN_SPEED);
  // 哨戒: past its way out, round and round its loop.
  if (order.patrol) {
    const out = routeSectors(order.route);
    if (done > out) {
      const loop = [...order.patrol.loop, order.patrol.loop[0]];
      const len = routeSectors(loop);
      const at = len > 0 ? pathPoint(loop, (done - out) % len) : null;
      const s = order.patrol.loop[0];
      return at ?? { x: (s.c + 0.5) * SECTOR_PX, y: (s.r + 0.5) * SECTOR_PX };
    }
  }
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
  /** 0.0.73: an expedition's fight on its route (its id) */
  expedition?: string;
  /** 0.0.74: what was fought and where (the region's control follows the fight) */
  kind?: ResidentKind;
  x?: number;
  y?: number;
  /** The duty the fleet was on */
  mission?: MissionKind | 'intercept';
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

/** What a fleet on a duty does with what it meets: report it, fight it, or keep clear. */
function dutyRules(mission: MissionKind, stance: PatrolStance): { reports: boolean; fights: (kind: ResidentKind) => boolean } {
  switch (mission) {
    // 船団護衛: drives off the enemy's warships that come for the convoys, and lets the enemy's own convoys be.
    case 'escort': return { reports: false, fights: (k) => k === 'patrol' || k === 'counter' };
    // 通商破壊: goes for the enemy's convoys (and fights what guards them).
    case 'raid': return { reports: false, fights: (k) => k === 'convoy' || k === 'patrol' };
    // 機雷敷設・掃海・訓練: keep out of fights.
    case 'mine': case 'sweep': case 'train': return { reports: false, fights: () => false };
    default: return { reports: true, fights: (k) => stance !== 'report' && k !== 'superweapon' };
  }
}

/** The work of a duty done round its loop (0.0.74): mines laid, a sea swept, hours trained. */
export interface IDutyWork {
  shipIds: string[];
  mission: MissionKind;
  /** The loop's first point (its region is where the work counts) */
  at: ISectorRef;
  /** When it was done */
  t: number;
  /** Hours trained (訓練) or escorted (船団護衛) */
  hours?: number;
}

/** World hours on station before the mines are laid / the sea is swept, and then again every DUTY_REPEAT_HOURS. */
export const MINE_HOURS = 6;
export const SWEEP_HOURS = 4;
export const DUTY_REPEAT_HOURS = 24;
/** 訓練 is counted in steps of this many world hours. */
export const TRAIN_STEP_HOURS = 2;

/** The work due from a duty's time on station up to `now`, and where its count got to. */
export function dutyWork(order: IFleetOrder, shipIds: readonly string[], now: number): { works: IDutyWork[]; workAt?: number } {
  const p = order.patrol;
  const mission = p?.mission;
  if (!p || !mission || mission === 'patrol' || mission === 'raid') return { works: [] };
  const onStation = order.startedAt + runMs(order.route);
  if (now <= onStation) return { works: [] };
  const H = WORLD_HOUR_MS;
  const at = p.loop[0];
  const works: IDutyWork[] = [];
  // 訓練 and 船団護衛 count their hours on station (training in steps of TRAIN_STEP_HOURS, escorting by the hour).
  if (mission === 'train' || mission === 'escort') {
    const step = mission === 'train' ? TRAIN_STEP_HOURS : 1;
    const from = Math.max(order.workAt ?? onStation, onStation, now - CATCH_UP_HOURS * H);
    const hours = Math.floor((now - from) / (step * H)) * step;
    if (hours <= 0) return { works: [], workAt: order.workAt };
    works.push({ shipIds: [...shipIds], mission, at, t: from + hours * H, hours });
    return { works, workAt: from + hours * H };
  }
  let next = order.workAt !== undefined ? order.workAt + DUTY_REPEAT_HOURS * H : onStation + (mission === 'mine' ? MINE_HOURS : SWEEP_HOURS) * H;
  let workAt = order.workAt;
  while (next <= now && works.length < 4) {
    works.push({ shipIds: [...shipIds], mission, at, t: next });
    workAt = next;
    next += DUTY_REPEAT_HOURS * H;
  }
  return { works, workAt };
}

/**
 * Brings every fleet under orders up to `now`: fights met on the way, the turn for home, and the arrival (the fleet
 * lies at its destination; a base fills the tank, at sea the route's fuel is spent). 0.0.74: a fleet on a duty round
 * its loop reports, fights or keeps clear by its duty, and does its work (mines, sweeping, training).
 */
export function advanceOrders(anchors: readonly IMovingFleet[], hp: Readonly<Record<string, number>>, now: number, w: IOffscreenWorld): { anchors: IMovingFleet[]; hp: Record<string, number>; fights: IOffscreenFight[]; sightings: ISighting[]; works: IDutyWork[] } {
  const health: Record<string, number> = { ...hp };
  const fights: IOffscreenFight[] = [];
  const sightings: ISighting[] = [];
  const works: IDutyWork[] = [];
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
    const mission: MissionKind = order.patrol?.mission ?? 'patrol';
    const rules = order.patrol ? dutyRules(mission, order.patrol.stance) : { reports: false, fights: (k: ResidentKind) => k !== 'superweapon' };
    for (let t = from; t <= end && order; t += STEP_HOURS * WORLD_HOUR_MS) {
      const at = orderPos(order, t);
      // 哨戒 (0.0.73): enemies within its sight are reported (shown on the chart).
      if (order.patrol && rules.reports) {
        const seen: string[] = order.seen ?? [];
        const found = w.residents.filter((r) => r.kind !== 'friend' && !seen.includes(r.id) && !w.won(r.id) && worldGap(residentPos(r, t), at) <= PATROL_SIGHT_PX);
        if (found.length > 0) {
          for (const r of found) {
            const p = residentPos(r, t);
            sightings.push({ id: r.id, kind: r.kind, c: Math.floor(p.x / SECTOR_PX), r: Math.floor(p.y / SECTOR_PX), at: t });
          }
          order = { ...order, seen: [...seen, ...found.map((r) => r.id)] };
        }
      }
      const foe = w.residents.find((r) => r.kind !== 'friend' && rules.fights(r.kind) && !order!.met.includes(r.id) && !w.won(r.id) && worldGap(residentPos(r, t), at) <= MEET_PX);
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
          // A fleet on a duty hurt down to its rule gives up its loop too.
          order = { route: back.route, dest: back.dest, startedAt: t, checkedAt: t, met: order.met, home: true };
          turnedHome = true;
        }
      }
      fights.push({ shipIds: [...f.shipIds], residentId: foe.id, won, hurt, turnedHome, at: t, kind: foe.kind, x: at.x, y: at.y, ...(fleet.order?.patrol ? { mission } : {}) });
      if (turnedHome) break;
    }
    if (!order) continue;
    if (order.patrol) {
      const done = dutyWork(order, f.shipIds, now);
      works.push(...done.works);
      if (done.workAt !== undefined) order = { ...order, workAt: done.workAt };
    }
    if (now >= arrivesAt(order)) {
      const fuel = order.dest.base ? FUEL_MAX : Math.max(0, (f.fuel ?? FUEL_MAX) - routeFuel(order.route));
      f = { shipIds: f.shipIds, at: order.dest, fuel, ...(f.returnAt ? { returnAt: f.returnAt } : {}) };
    } else f = { ...f, order: { ...order, checkedAt: now } };
    out.push(f);
  }
  return { anchors: out, hp: health, fights, sightings, works };
}

/** 迎撃 (0.0.74): how far from its base an intercepting fleet sails out to an enemy found (px). */
export const INTERCEPT_PX = SECTOR_PX * 8;

/** An enemy known to be at sea (found by a patrol, or a counterattack under way) that a base's fleet may go for. */
export interface IKnownFoe {
  id: string;
  kind: ResidentKind;
  x: number;
  y: number;
  at: number;
  /** The resident to fight (the reckoning needs its strength) */
  resident: IResident;
}

/**
 * 迎撃: each fleet waiting in its base on 迎撃 sails out to the enemies found within INTERCEPT_PX since it last looked
 * and fights them (as off-screen fights go: never sunk), back in its base after. Hurt down to its 帰投の基準 it stops
 * intercepting until it is set to it again.
 */
export function advanceIntercepts(anchors: readonly IMovingFleet[], hp: Readonly<Record<string, number>>, now: number, w: IOffscreenWorld, known: readonly IKnownFoe[]): { anchors: IMovingFleet[]; hp: Record<string, number>; fights: IOffscreenFight[] } {
  const health: Record<string, number> = { ...hp };
  const fights: IOffscreenFight[] = [];
  const beaten = new Set<string>();
  const out = anchors.map((f) => {
    if (!f.intercept || f.order) return f;
    const since = f.intercept.checkedAt;
    let keep = true;
    for (const k of [...known].sort((a, b) => a.at - b.at)) {
      if (k.at <= since || k.at > now || beaten.has(k.id) || w.won(k.id) || (k.kind !== 'patrol' && k.kind !== 'counter')) continue;
      if (worldGap(k, f.at) > INTERCEPT_PX) continue;
      const ours = w.power(f.shipIds, health);
      const theirs = w.enemyPower(k.resident);
      const hurt: Record<string, number> = {};
      for (const id of f.shipIds) {
        const before = health[id] ?? 1;
        const after = Math.max(OFFSCREEN_FLOOR, before - offscreenHurt(ours, theirs, `${k.id}:${id}`));
        hurt[id] = before - after;
        health[id] = after;
      }
      const won = ours >= theirs;
      if (won) beaten.add(k.id);
      fights.push({ shipIds: [...f.shipIds], residentId: k.id, won, hurt, turnedHome: false, at: k.at, kind: k.kind, x: k.x, y: k.y, mission: 'intercept' });
      if (f.shipIds.some((id) => (health[id] ?? 1) <= RETURN_AT[f.returnAt ?? 'heavy'])) {
        keep = false;
        break;
      }
    }
    if (!keep) return withoutIntercept(f);
    return { ...f, intercept: { checkedAt: now } };
  });
  return { anchors: out, hp: health, fights };
}

/** Sight of a patrol (px): three sectors. */
export const PATROL_SIGHT_PX = SECTOR_PX * 3;

/** An enemy a patrol has found (0.0.73): where it was and when; the chart shows it for a world hour or two. */
export interface ISighting {
  id: string;
  kind: string;
  c: number;
  r: number;
  at: number;
}

/** How long a sighting stays on the chart (real ms: two world hours). */
export const SIGHTING_MS = 2 * WORLD_HOUR_MS;

/** A loop of four turning points round `centre` (three sectors out, two where the sea is narrow), each leg on the sea. */
export function patrolLoop(centre: ISectorRef, isSeaAt: (c: number, r: number) => boolean, seaLine: (a: ISectorRef, b: ISectorRef) => boolean): ISectorRef[] {
  for (const k of [3, 2, 1]) {
    const pts = [[0, -k], [k, 0], [0, k], [-k, 0]].map(([dc, dr]) => ({ c: (centre.c + dc + WORLD_PX.w / SECTOR_PX) % (WORLD_PX.w / SECTOR_PX), r: centre.r + dr }));
    if (!pts.every((p) => isSeaAt(p.c, p.r))) continue;
    if (pts.every((p, i) => seaLine(p, pts[(i + 1) % pts.length]))) return pts;
  }
  return [centre, centre];
}

/** 哨戒の命令: sail to the loop's first point, then round the loop until called off. */
export function orderPatrol(fleet: IMovingFleet, route: ISectorRef[] | null, loop: ISectorRef[], stance: PatrolStance, now: number, mission: MissionKind = 'patrol'): IMovingFleet | string {
  if (!route || route.length < 1) return '海の上の航路がありません';
  const way = route.length === 1 ? [route[0], route[0]] : route;
  const end = way[way.length - 1];
  return { ...fleet, order: { route: way, dest: { x: (end.c + 0.5) * SECTOR_PX, y: (end.r + 0.5) * SECTOR_PX }, startedAt: now, checkedAt: now, met: [], patrol: { loop, stance, ...(mission !== 'patrol' ? { mission } : {}) }, seen: [] } };
}

/** 命令を解く: the fleet stops where it is and lies there at sea. */
export function stopOrder(fleet: IMovingFleet, now: number): IMovingFleet {
  if (!fleet.order) return fleet;
  const at = orderPos(fleet.order, now);
  return { shipIds: fleet.shipIds, at: { x: at.x, y: at.y }, fuel: fleet.fuel, ...(fleet.returnAt ? { returnAt: fleet.returnAt } : {}) };
}

