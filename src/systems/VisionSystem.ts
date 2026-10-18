import { ShipClass } from '@/types/ShipClass';

/**
 * Fog of war (pure): what each side can see. Ships see a circle around them, recon floatplanes a
 * cone ahead of them, and any aircraft a small circle below it. A ship outside every source of the
 * other side is hidden (and can't be targeted); submerged boats additionally need sonar.
 */

export interface IVisionCircle {
  kind: 'circle';
  x: number;
  y: number;
  radius: number;
}

export interface IVisionCone {
  kind: 'cone';
  x: number;
  y: number;
  /** Direction the cone faces (radians, 0 = +x) */
  heading: number;
  range: number;
  /** Half the cone's opening angle (radians) */
  halfAngle: number;
}

export type VisionSource = IVisionCircle | IVisionCone;

const SHIP_VISION: Record<ShipClass, number> = {
  [ShipClass.Battleship]: 650,
  [ShipClass.Cruiser]: 650,
  [ShipClass.Carrier]: 600,
  [ShipClass.Destroyer]: 600,
  [ShipClass.Submarine]: 450,
};
/** A submerged boat only sees through its periscope. */
export const PERISCOPE_VISION = 300;
export const AIRCRAFT_VISION = 260;
export const RECON_RANGE = 650;
export const RECON_HALF_ANGLE = (40 * Math.PI) / 180;

export function shipVision(shipClass: ShipClass, submerged = false): number {
  return submerged ? PERISCOPE_VISION : SHIP_VISION[shipClass] ?? 600;
}

/** Recon floatplanes are carried by battleships and cruisers. */
export function carriesRecon(shipClass: ShipClass): boolean {
  return shipClass === ShipClass.Battleship || shipClass === ShipClass.Cruiser;
}

function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function inSource(x: number, y: number, s: VisionSource): boolean {
  const dx = x - s.x;
  const dy = y - s.y;
  const d = Math.hypot(dx, dy);
  if (s.kind === 'circle') return d <= s.radius;
  if (d > s.range) return false;
  if (d === 0) return true;
  return Math.abs(wrapAngle(Math.atan2(dy, dx) - s.heading)) <= s.halfAngle;
}

export function isVisible(x: number, y: number, sources: VisionSource[]): boolean {
  return sources.some((s) => inSource(x, y, s));
}

/** Corner points of a cone (apex + arc), for drawing it. */
export function conePolygon(s: IVisionCone, segments = 12): Array<{ x: number; y: number }> {
  const pts = [{ x: s.x, y: s.y }];
  for (let i = 0; i <= segments; i++) {
    const a = s.heading - s.halfAngle + (2 * s.halfAngle * i) / segments;
    pts.push({ x: s.x + Math.cos(a) * s.range, y: s.y + Math.sin(a) * s.range });
  }
  return pts;
}

/**
 * Recon plane patrol: an orbit centred ahead of its ship. Returns the plane's position and heading
 * after `orbit` radians around it.
 */
export function reconPatrol(
  shipX: number,
  shipY: number,
  shipHeadingRad: number,
  orbit: number,
  ahead = 420,
  radius = 260,
): { x: number; y: number; heading: number } {
  const cx = shipX + Math.cos(shipHeadingRad) * ahead;
  const cy = shipY + Math.sin(shipHeadingRad) * ahead;
  return {
    x: cx + Math.cos(orbit) * radius,
    y: cy + Math.sin(orbit) * radius,
    // Tangent to the circle (flying counter-clockwise in screen space as orbit grows)
    heading: orbit + Math.PI / 2,
  };
}

/** A recon plane stays on a contact this long before it must go home (fuel), ms (#98). */
export const SHADOW_MS = 90_000;
/** Radius of the circle a shadowing plane flies around its contact. */
export const SHADOW_RADIUS = 200;

/** Worth of a contact to a scout: carriers and battleships first (#98). */
export function shadowValue(shipClass: ShipClass): number {
  switch (shipClass) {
    case ShipClass.Carrier: return 5;
    case ShipClass.Battleship: return 4;
    case ShipClass.Cruiser: return 3;
    case ShipClass.Destroyer: return 2;
    default: return 1;
  }
}

export interface IShadowCandidate<T> {
  ref: T;
  x: number;
  y: number;
  shipClass: ShipClass;
  /** Submerged boats can't be shadowed from the air */
  submerged: boolean;
}

/**
 * The contact a patrolling scout starts shadowing: the most valuable surface ship inside its cone that no other scout
 * of the side is already on (ties: the nearest). Null when the cone holds nothing new (#98).
 */
export function pickShadowTarget<T>(cone: IVisionCone, candidates: IShadowCandidate<T>[], taken: Set<T>): T | null {
  let best: IShadowCandidate<T> | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (c.submerged || taken.has(c.ref) || !inSource(c.x, c.y, cone)) continue;
    const score = shadowValue(c.shipClass) * 10000 - Math.hypot(c.x - cone.x, c.y - cone.y);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ? best.ref : null;
}

/** Where a shadowing plane flies: around its contact, `orbit` radians along the circle. */
export function shadowOrbit(targetX: number, targetY: number, orbit: number, radius = SHADOW_RADIUS): { x: number; y: number } {
  return { x: targetX + Math.cos(orbit) * radius, y: targetY + Math.sin(orbit) * radius };
}
