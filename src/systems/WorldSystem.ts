import { IResources } from '@/types/Progression';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { gameHour } from './QuestSystem';

/**
 * 外洋 (#65 オープンワールドの第 1 段階, pure). From the home port the fleet sails a chart of the open sea as far as
 * its supply allows. Rings round the port say how dangerous the water is (1 near home … 10 far out); the enemy groups
 * met in each ring are stronger and pay more. Damage stays with the ships. The fleet must always keep enough supply to
 * sail home: a move or a fight that would leave too little is refused. A lost battle, or every ship badly hurt,
 * brings the fleet home at once.
 */

/** The chart is WORLD_SIZE units square; the port sits at the bottom middle. */
export const WORLD_SIZE = 1000;
export const HOME = { x: 500, y: 930 } as const;
/** Width of a danger ring */
export const RING = 90;
export const MAX_DANGER = 10;
/** Supply a voyage starts with, what a chart unit of sailing takes, and what a battle takes */
export const SUPPLY_MAX = 100;
export const SUPPLY_PER_UNIT = 0.05;
export const BATTLE_SUPPLY = 8;
/** Enemy groups on the chart (one a ring), placed anew every game hour */
export const SPOTS_PER_HOUR = MAX_DANGER;
/** A battle's extra reward per danger, and its gold */
export const WORLD_REWARD_PER_DANGER: IResources = { fuel: 25, ammo: 25, steel: 30, bauxite: 10 };
export const WORLD_GOLD_PER_DANGER = 10;

export interface IPoint {
  x: number;
  y: number;
}

export interface IVoyage {
  x: number;
  y: number;
  supply: number;
  shipIds: string[];
  captainIds: (string | null)[];
  formation: Formation;
  /** Spots won on this voyage ("hour:index") */
  cleared: string[];
  startedAt: number;
}

export interface IWorld {
  voyage: IVoyage | null;
  /** The most dangerous ring a battle was won in, and battles won, on all voyages */
  best: number;
  wins: number;
  /** Spots won this game hour, on any voyage: sailing home and out again doesn't bring them back */
  cleared: string[];
}

export interface ISpot extends IPoint {
  id: string;
  danger: number;
  enemyNation: Nation;
}

export function emptyWorld(): IWorld {
  return { voyage: null, best: 0, wins: 0, cleared: [] };
}

export function distance(a: IPoint, b: IPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The danger of the water at `p`: 1 by the port, one more each RING out, MAX_DANGER at most. */
export function dangerAt(p: IPoint): number {
  return Math.max(1, Math.min(MAX_DANGER, Math.ceil(distance(HOME, p) / RING)));
}

function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * The enemy groups at sea this game hour: one in each ring, in the upper half round the port, each of a navy other
 * than the player's. The same for everyone at the same hour.
 */
export function worldSpots(now: number, player: Nation, foes: readonly Nation[]): ISpot[] {
  const hour = gameHour(now);
  const others = foes.filter((n) => n !== player);
  return Array.from({ length: SPOTS_PER_HOUR }, (_, i) => {
    const h = hash(hour * 131 + i * 7);
    // The first ring's group keeps clear of the port and its name.
    const r = RING * (i === 0 ? 0.85 : i + 0.5);
    // Upward from the port, up to 70 degrees either side, and no wider than keeps the spot on the chart (so its ring holds).
    const dev = Math.min(((i === 0 ? 35 : 70) * Math.PI) / 180, Math.asin(Math.min(1, (WORLD_SIZE / 2 - 30) / r)));
    const angle = -Math.PI / 2 + ((h % 1000) / 1000 * 2 - 1) * dev;
    const x = Math.max(30, Math.min(WORLD_SIZE - 30, HOME.x + Math.cos(angle) * r));
    const y = Math.max(30, Math.min(WORLD_SIZE - 30, HOME.y + Math.sin(angle) * r));
    const p = { x: Math.round(x), y: Math.round(y) };
    return { id: `${hour}:${i}`, ...p, danger: dangerAt(p), enemyNation: others[(h >>> 9) % Math.max(1, others.length)] ?? player };
  });
}

/** Supply a trip of `units` takes. */
export function supplyFor(units: number): number {
  return Math.ceil(units * SUPPLY_PER_UNIT);
}

/** Why the fleet can't go and fight at `spot` (null when it can): it must keep enough to sail home after. */
export function reachProblem(voyage: IVoyage, spot: IPoint): string | null {
  const need = supplyFor(distance(voyage, spot)) + BATTLE_SUPPLY + supplyFor(distance(spot, HOME));
  return need > voyage.supply ? `補給が足りません (要 ${need} / 残り ${voyage.supply}、帰りの分も要ります)` : null;
}

/** The voyage after sailing to `spot` (the battle there is still to come). */
export function sailTo(voyage: IVoyage, spot: IPoint): IVoyage {
  return { ...voyage, x: spot.x, y: spot.y, supply: Math.max(0, voyage.supply - supplyFor(distance(voyage, spot))) };
}

export function startVoyage(shipIds: string[], captainIds: (string | null)[], formation: Formation, now: number): IVoyage {
  return { ...HOME, supply: SUPPLY_MAX, shipIds: [...shipIds], captainIds: [...captainIds], formation, cleared: [], startedAt: now };
}

/** After a battle at `spotId`: its supply spent and, on a win, the spot marked. */
export function afterBattle(world: IWorld, spotId: string, danger: number, victory: boolean): IWorld {
  const v = world.voyage;
  if (!v) return world;
  const voyage = { ...v, supply: Math.max(0, v.supply - BATTLE_SUPPLY), cleared: victory ? [...new Set([...v.cleared, spotId])] : v.cleared };
  // Only this hour's spots are kept (their ids start with the hour).
  const hour = spotId.split(':')[0];
  const cleared = victory ? [...new Set([...(world.cleared ?? []).filter((id) => id.startsWith(`${hour}:`)), spotId])] : (world.cleared ?? []);
  return { voyage, best: victory ? Math.max(world.best, danger) : world.best, wins: world.wins + (victory ? 1 : 0), cleared };
}

/** Whether a spot was already won this hour (on this voyage or an earlier one). */
export function spotWon(world: IWorld | undefined, spotId: string): boolean {
  return (world?.cleared ?? []).includes(spotId) || (world?.voyage?.cleared ?? []).includes(spotId);
}

export function endVoyage(world: IWorld): IWorld {
  return { ...world, voyage: null };
}

/** The extra reward of a battle won at this danger. */
export function worldReward(danger: number): IResources {
  const d = Math.max(1, Math.min(MAX_DANGER, danger));
  const w = WORLD_REWARD_PER_DANGER;
  return { fuel: w.fuel * d, ammo: w.ammo * d, steel: w.steel * d, bauxite: w.bauxite * d };
}

export function worldGold(danger: number): number {
  return WORLD_GOLD_PER_DANGER * Math.max(1, Math.min(MAX_DANGER, danger));
}

/** How strong the enemy is against its data at this danger (the battle scales it like a campaign sea). */
export function worldEnemyScale(danger: number): number {
  return 0.55 + 0.08 * Math.max(1, Math.min(MAX_DANGER, danger));
}

/** The classes a group at this danger brings: small ships near home, battle fleets far out. */
export function worldEnemyClasses(danger: number): ShipClass[] {
  const d = Math.max(1, Math.min(MAX_DANGER, danger));
  const count = Math.min(6, 1 + Math.ceil(d / 2));
  const pool: ShipClass[] = d <= 2 ? [ShipClass.Destroyer, ShipClass.Destroyer, ShipClass.Submarine]
    : d <= 4 ? [ShipClass.Cruiser, ShipClass.Destroyer, ShipClass.Destroyer]
      : d <= 6 ? [ShipClass.Cruiser, ShipClass.Battleship, ShipClass.Destroyer, ShipClass.Cruiser]
        : d <= 8 ? [ShipClass.Battleship, ShipClass.Carrier, ShipClass.Cruiser, ShipClass.Destroyer]
          : [ShipClass.Battleship, ShipClass.Carrier, ShipClass.Battleship, ShipClass.Cruiser, ShipClass.Destroyer];
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

/**
 * The enemy group of a spot: ships of its navy by class, older near home and newer far out (a stable choice per
 * spot). Ships the navy lacks of a class are taken from its destroyers.
 */
export function worldEnemyFleet(roster: readonly IShipData[], spot: Pick<ISpot, 'id' | 'danger'>): IShipData[] {
  const usable = roster.filter((s) => !s.designed && !s.foreign && !s.blueprint && s.hp > 0);
  const seed = [...spot.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);
  return worldEnemyClasses(spot.danger).map((c, i) => {
    const kind = usable.filter((s) => s.shipClass === c);
    const list = (kind.length > 0 ? kind : usable.filter((s) => s.shipClass === ShipClass.Destroyer)).slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.hp - b.hp);
    if (list.length === 0) return usable[0];
    const at = Math.min(list.length - 1, Math.floor(((spot.danger - 1) / (MAX_DANGER - 1)) * (list.length - 1)) + ((seed + i) % 2));
    return list[Math.max(0, at)];
  }).filter((s): s is IShipData => s !== undefined);
}

/** Whether the fleet must come home after a battle: lost, or every ship badly hurt. */
export function mustReturn(victory: boolean, hpFractions: readonly number[], heavy: number): boolean {
  return !victory || hpFractions.length === 0 || hpFractions.every((f) => f <= heavy);
}

/** Read from a save: anything missing or odd falls back to the port. */
export function parseWorld(raw: unknown): IWorld {
  if (!raw || typeof raw !== 'object') return emptyWorld();
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const v = o.voyage as Record<string, unknown> | null | undefined;
  const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const voyage: IVoyage | null = v && typeof v === 'object' && ids(v.shipIds).length > 0
    ? {
      x: Math.min(WORLD_SIZE, num(v.x, HOME.x)), y: Math.min(WORLD_SIZE, num(v.y, HOME.y)), supply: Math.min(SUPPLY_MAX, num(v.supply)),
      shipIds: ids(v.shipIds), captainIds: Array.isArray(v.captainIds) ? v.captainIds.map((c) => (typeof c === 'string' ? c : null)) : [],
      formation: (Object.values(Formation) as string[]).includes(v.formation as string) ? (v.formation as Formation) : Formation.LineAhead,
      cleared: ids(v.cleared), startedAt: num(v.startedAt),
    }
    : null;
  return { voyage, best: Math.min(MAX_DANGER, num(o.best)), wins: num(o.wins), cleared: ids(o.cleared) };
}

/** The ships out on a voyage (they can't sail elsewhere until it ends). */
export function voyageShipIds(world: IWorld | undefined): string[] {
  return world?.voyage?.shipIds ?? [];
}
