import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { BattleMode } from '@/types/Battle';
import { ShipRegistry } from './ShipRegistry';

/** Default enemy fleet size (free battles); campaign areas and exercises ask for 1–8. */
export const ENEMY_FLEET_SIZE = 3;
export const MAX_ENEMY_FLEET_SIZE = 8;

/**
 * Class wanted in each enemy slot, best first; the first class the nation has wins. A fleet of N
 * takes the first N slots, so small fleets keep the capital ship and bigger ones add screens.
 */
const SURFACE_SLOTS: ShipClass[][] = [
  [ShipClass.Battleship, ShipClass.Cruiser],
  [ShipClass.Cruiser, ShipClass.Destroyer],
  [ShipClass.Destroyer, ShipClass.Cruiser],
  [ShipClass.Destroyer, ShipClass.Cruiser],
  [ShipClass.Battleship, ShipClass.Cruiser],
  [ShipClass.Cruiser, ShipClass.Destroyer],
  [ShipClass.Destroyer, ShipClass.Cruiser],
  [ShipClass.Cruiser, ShipClass.Destroyer],
];
const CARRIER_SLOTS: ShipClass[][] = [
  [ShipClass.Carrier, ShipClass.Battleship],
  [ShipClass.Cruiser, ShipClass.Destroyer],
  [ShipClass.Destroyer, ShipClass.Cruiser],
  [ShipClass.Destroyer, ShipClass.Cruiser],
  [ShipClass.Carrier, ShipClass.Cruiser],
  [ShipClass.Battleship, ShipClass.Cruiser],
  [ShipClass.Cruiser, ShipClass.Destroyer],
  [ShipClass.Destroyer, ShipClass.Cruiser],
];

/** Clamps a requested fleet size to 1..MAX_ENEMY_FLEET_SIZE (non-numbers fall back to the default). */
export function enemyFleetSize(size: number): number {
  if (!Number.isFinite(size)) return ENEMY_FLEET_SIZE;
  return Math.min(MAX_ENEMY_FLEET_SIZE, Math.max(1, Math.round(size)));
}

/** Picks a random element; `rng` returns [0, 1) like Math.random. */
function pick<T>(items: T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * Takes the first pool that still has a ship not in `used`, picks one of those (optionally narrowed by `prefer`), and
 * marks it used. Returns null when every pool is exhausted: a fleet never contains the same ship twice (#76).
 */
function takeUnique(
  pools: IShipData[][],
  used: Set<string>,
  rng: () => number,
  prefer: (candidates: IShipData[]) => IShipData[] = (c) => c,
): IShipData | null {
  for (const pool of pools) {
    const fresh = pool.filter((s) => !used.has(s.id));
    if (fresh.length === 0) continue;
    const chosen = pick(prefer(fresh), rng);
    used.add(chosen.id);
    return chosen;
  }
  return null;
}

/**
 * Builds the enemy fleet (flagship first) from a nation's roster. Falls back to any ship of that nation when a
 * wanted class is missing; every ship appears at most once, so a small roster gives a smaller fleet (#76).
 * `size` is clamped to 1–8.
 */
export function generateEnemyFleet(
  registry: ShipRegistry,
  nation: Nation,
  mode: BattleMode,
  rng: () => number = Math.random,
  size = ENEMY_FLEET_SIZE,
): IShipData[] {
  const count = enemyFleetSize(size);
  // Fictional ships are the player's research reward; the enemy only fields historical ones.
  const roster = registry.byNation(nation).filter((s) => !s.fictional);
  const surface = roster.filter((s) => s.shipClass !== ShipClass.Submarine);
  const used = new Set<string>();
  const slots: ShipClass[][] =
    mode === BattleMode.ASW
      ? Array.from({ length: count }, () => [ShipClass.Submarine])
      : (mode === BattleMode.CarrierStrike ? CARRIER_SLOTS : SURFACE_SLOTS).slice(0, count);
  const fleet: IShipData[] = [];
  for (const wanted of slots) {
    const pools = [...wanted.map((c) => roster.filter((s) => s.shipClass === c)), surface, roster];
    const chosen = takeUnique(pools, used, rng);
    if (chosen) fleet.push(chosen);
  }
  return fleet;
}

/** Largest free-battle (演習) opponent (#78). */
export const MAX_EXERCISE_ENEMIES = 10;

/** Clamps a requested exercise opponent size to 1..MAX_EXERCISE_ENEMIES. */
export function exerciseEnemyCount(size: number): number {
  if (!Number.isFinite(size)) return 1;
  return Math.min(MAX_EXERCISE_ENEMIES, Math.max(1, Math.round(size)));
}

/**
 * Free-battle (演習) opponent of `size` ships (1–10, #78). Each mirrors the class of the player's ship in that position
 * (extras mirror the player's smallest ship) and is the enemy ship of that class closest in HP, so a lone destroyer
 * meets a destroyer. ASW battles field submarines and a carrier battle puts a carrier in front. No ship appears twice
 * (#76); when the nation runs out of ships the fleet is smaller than asked.
 */
export function exerciseEnemyFleet(
  registry: ShipRegistry,
  nation: Nation,
  mode: BattleMode,
  playerShips: IShipData[],
  size: number,
  rng: () => number = Math.random,
): IShipData[] {
  const roster = registry.byNation(nation).filter((s) => !s.fictional);
  if (roster.length === 0 || playerShips.length === 0) return [];
  const smallest = playerShips.reduce((a, b) => (b.hp < a.hp ? b : a));
  const surface = roster.filter((s) => s.shipClass !== ShipClass.Submarine);
  const used = new Set<string>();
  const fleet: IShipData[] = [];
  for (let i = 0; i < exerciseEnemyCount(size); i++) {
    const model = playerShips[i] ?? smallest;
    const wanted =
      mode === BattleMode.ASW ? ShipClass.Submarine : mode === BattleMode.CarrierStrike && i === 0 ? ShipClass.Carrier : model.shipClass;
    // The closest in HP, with a random pick among those within 10% of it.
    const gap = (s: IShipData): number => Math.abs(s.hp - model.hp);
    const near = (c: IShipData[]): IShipData[] => {
      const best = Math.min(...c.map(gap));
      return c.filter((s) => gap(s) <= best + model.hp * 0.1);
    };
    const chosen = takeUnique([roster.filter((s) => s.shipClass === wanted), surface, roster], used, rng, near);
    if (chosen) fleet.push(chosen);
  }
  return fleet;
}
