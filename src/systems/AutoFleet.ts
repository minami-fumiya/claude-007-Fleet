import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';

/**
 * 自動編成 (#357, pure): a fleet picked for the admiral from the ships that can sail — the strongest first, within the
 * rank's cost cap and slots, a large ship at the head, and a destroyer among the escorts when there are three slots or
 * more. With an enemy to measure against, no more ships join once the fleet is comfortably ahead (1.2×).
 */

export interface IAutoCandidate {
  ship: IShipData;
  /** Sortie cost at the ship's remodel stage */
  cost: number;
  /** The ship's strength (its share of 総戦力) */
  power: number;
}

/** Ahead of the enemy by this much, the fleet stops growing. */
export const AUTO_AHEAD = 1.2;

export function autoFleet(candidates: readonly IAutoCandidate[], slots: number, costCap: number, enemyPower: number | null = null): IShipData[] {
  const byPower = [...candidates].sort((a, b) => b.power - a.power);
  const isDestroyer = (c: IAutoCandidate): boolean => c.ship.shipClass === ShipClass.Destroyer;
  const destroyers = byPower.filter(isDestroyer);
  const cheapestDestroyer = destroyers.length > 0 ? Math.min(...destroyers.map((c) => c.cost)) : Infinity;
  const needDestroyer = slots >= 3 && destroyers.length > 0;
  const chosen: IAutoCandidate[] = [];
  let cost = 0;
  let power = 0;
  for (const c of byPower) {
    if (chosen.length >= slots) break;
    if (enemyPower !== null && enemyPower > 0 && power >= enemyPower * AUTO_AHEAD) break;
    if (cost + c.cost > costCap) continue;
    // A slot and the cost of one destroyer stay free until a destroyer has joined.
    const haveDestroyer = chosen.some(isDestroyer);
    if (needDestroyer && !haveDestroyer && !isDestroyer(c)) {
      const slotsLeft = slots - chosen.length - 1;
      if (slotsLeft < 1 || cost + c.cost + cheapestDestroyer > costCap) continue;
    }
    chosen.push(c);
    cost += c.cost;
    power += c.power;
  }
  // The flagship is the strongest ship that is not a submarine (a submarine leads only a fleet of submarines).
  const lead = chosen.find((c) => c.ship.shipClass !== ShipClass.Submarine) ?? chosen[0];
  return lead ? [lead.ship, ...chosen.filter((c) => c !== lead).map((c) => c.ship)] : [];
}
