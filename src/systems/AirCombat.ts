import { AircraftType } from '@/types/Aircraft';
import { ShipClass } from '@/types/ShipClass';

/** Anti-aircraft guns reach this far from a ship. */
export const AA_RANGE = 220;
/** Planes shot down per second by one ship of AA strength 1. */
export const AA_KILLS_PER_SEC = 0.12;

const AA_STRENGTH: Record<ShipClass, number> = {
  [ShipClass.Battleship]: 1.0,
  [ShipClass.Cruiser]: 0.85,
  [ShipClass.Carrier]: 0.7,
  [ShipClass.Destroyer]: 0.6,
  // Only a surfaced boat's deck gun; none while submerged (the scene skips submerged boats).
  [ShipClass.Submarine]: 0.1,
};

export function aaStrength(shipClass: ShipClass): number {
  return AA_STRENGTH[shipClass] ?? 0;
}

export interface IAAGun {
  x: number;
  y: number;
  strength: number;
}

/** Kills per second the guns in range of (x, y) put on a squadron there. */
export function aaFire(x: number, y: number, guns: IAAGun[]): number {
  let total = 0;
  for (const g of guns) {
    if (Math.hypot(g.x - x, g.y - y) <= AA_RANGE) total += g.strength * AA_KILLS_PER_SEC;
  }
  return total;
}

/**
 * Losses accumulate as fractional damage so attrition is smooth and deterministic: each whole
 * point of damage downs one plane. Returns the planes left and the carried-over fraction.
 */
export function applyAttrition(planes: number, damage: number, killsPerSec: number, dtSec: number): { planes: number; damage: number } {
  let d = damage + Math.max(0, killsPerSec) * dtSec;
  let p = planes;
  while (d >= 1 && p > 0) {
    d -= 1;
    p -= 1;
  }
  return { planes: p, damage: p > 0 ? d : 0 };
}

/** Kills per second one plane of `attacker` scores against planes of `defender` in a dogfight. */
export function dogfightRate(attacker: AircraftType, defender: AircraftType): number {
  if (attacker === AircraftType.Fighter) return defender === AircraftType.Fighter ? 0.35 : 0.6;
  // Bombers' rear gunners can only defend themselves a little.
  return defender === AircraftType.Fighter ? 0.08 : 0;
}

/** Bombs that hit: each plane's bomb hits with this probability (rng is injectable for tests). */
export function bombHits(planes: number, hitChance: number, rng: () => number = Math.random): number {
  let hits = 0;
  for (let i = 0; i < planes; i++) if (rng() < hitChance) hits++;
  return hits;
}
