import { ShipClass } from '@/types/ShipClass';

export interface ISonarContact {
  x: number;
  y: number;
}

export interface ISonarHunter extends ISonarContact {
  /** Sonar reach in px; 0 = no sonar */
  sonarRange: number;
}

/** Destroyers carry the best sonar, cruisers a short-range set; capital ships and carriers none. */
const SONAR_RANGE: Record<ShipClass, number> = {
  [ShipClass.Destroyer]: 300,
  [ShipClass.Cruiser]: 180,
  [ShipClass.Battleship]: 0,
  [ShipClass.Carrier]: 0,
  // A submerged boat can hear another nearby, but only faintly.
  [ShipClass.Submarine]: 120,
};

export function sonarRange(shipClass: ShipClass): number {
  return SONAR_RANGE[shipClass] ?? 0;
}

/** Is `contact` inside the sonar range of any hunter? */
export function isDetected(contact: ISonarContact, hunters: ISonarHunter[]): boolean {
  return hunters.some(
    (h) => h.sonarRange > 0 && Math.hypot(contact.x - h.x, contact.y - h.y) <= h.sonarRange,
  );
}

/**
 * Damage a depth charge deals to a ship `distance` px from the blast: full inside the inner third
 * of the radius, falling off linearly to zero at the edge.
 */
export function depthChargeFalloff(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  const inner = radius / 3;
  if (distance <= inner) return 1;
  return 1 - (distance - inner) / (radius - inner);
}
