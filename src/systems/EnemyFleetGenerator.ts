import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { BattleMode } from '@/types/Battle';
import { ShipRegistry } from './ShipRegistry';

export const ENEMY_FLEET_SIZE = 3;

/** Class wanted in each enemy slot, best first; the first class the nation has wins. */
const SURFACE_SLOTS: ShipClass[][] = [
  [ShipClass.Battleship, ShipClass.Cruiser],
  [ShipClass.Cruiser, ShipClass.Destroyer],
  [ShipClass.Destroyer, ShipClass.Cruiser],
];
const CARRIER_SLOTS: ShipClass[][] = [
  [ShipClass.Carrier, ShipClass.Battleship],
  [ShipClass.Cruiser, ShipClass.Destroyer],
  [ShipClass.Destroyer, ShipClass.Cruiser],
];

/** Picks a random element; `rng` returns [0, 1) like Math.random. */
function pick<T>(items: T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * Builds the enemy fleet (flagship first) from a nation's roster. Falls back to any ship of that
 * nation when a wanted class is missing, and returns [] if the nation has no ships at all.
 */
export function generateEnemyFleet(
  registry: ShipRegistry,
  nation: Nation,
  mode: BattleMode,
  rng: () => number = Math.random,
): IShipData[] {
  // Fictional ships are the player's research reward; the enemy only fields historical ones.
  const roster = registry.byNation(nation).filter((s) => !s.fictional);
  if (roster.length === 0) return [];

  if (mode === BattleMode.ASW) {
    const subs = roster.filter((s) => s.shipClass === ShipClass.Submarine);
    const pool = subs.length > 0 ? subs : roster;
    return Array.from({ length: ENEMY_FLEET_SIZE }, () => pick(pool, rng));
  }

  return (mode === BattleMode.CarrierStrike ? CARRIER_SLOTS : SURFACE_SLOTS).map((wanted) => {
    for (const shipClass of wanted) {
      const candidates = roster.filter((s) => s.shipClass === shipClass);
      if (candidates.length > 0) return pick(candidates, rng);
    }
    const surface = roster.filter((s) => s.shipClass !== ShipClass.Submarine);
    return pick(surface.length > 0 ? surface : roster, rng);
  });
}

/** Opponent size choices for a free battle (#25): same number as the player, one more, two more. */
export const EXERCISE_EXTRA_CHOICES = [0, 1, 2] as const;

/**
 * Free-battle (演習) opponent sized to the player's fleet (#25): one enemy per player ship plus `extra`. Each mirrors
 * the class of the player's ship in that position (extras mirror the player's smallest ship) and is the enemy ship of
 * that class closest in HP, so a lone destroyer meets a destroyer. ASW battles field submarines and a carrier
 * battle puts a carrier in front, as before.
 */
export function exerciseEnemyFleet(
  registry: ShipRegistry,
  nation: Nation,
  mode: BattleMode,
  playerShips: IShipData[],
  extra: number,
  rng: () => number = Math.random,
): IShipData[] {
  const roster = registry.byNation(nation).filter((s) => !s.fictional);
  if (roster.length === 0 || playerShips.length === 0) return [];
  const smallest = playerShips.reduce((a, b) => (b.hp < a.hp ? b : a));
  const size = playerShips.length + Math.max(0, Math.floor(extra));
  return Array.from({ length: size }, (_, i) => {
    const model = playerShips[i] ?? smallest;
    const wanted =
      mode === BattleMode.ASW ? ShipClass.Submarine : mode === BattleMode.CarrierStrike && i === 0 ? ShipClass.Carrier : model.shipClass;
    let pool = roster.filter((s) => s.shipClass === wanted);
    if (pool.length === 0) pool = roster.filter((s) => s.shipClass !== ShipClass.Submarine);
    if (pool.length === 0) pool = roster;
    // The closest in HP, with a random pick among those within 10% of it.
    const gap = (s: IShipData): number => Math.abs(s.hp - model.hp);
    const best = Math.min(...pool.map(gap));
    return pick(pool.filter((s) => gap(s) <= best + model.hp * 0.1), rng);
  });
}
