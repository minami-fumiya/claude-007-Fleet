/**
 * Pure steering / targeting helpers for the player's flagship on touch devices
 * (tap-to-move, auto-fire and the AUTO mode). No Phaser dependency so it can be unit tested.
 *
 * Headings use the ship-sprite convention: degrees, 0 = north (bow up), 90 = east.
 */

export interface IPoint {
  x: number;
  y: number;
}

export interface ITargetCandidate extends IPoint {
  alive: boolean;
}

export interface ISteer {
  headingDeg: number;
  /** 0..1 fraction of the ship's top speed */
  throttle: number;
}

export interface IBounds {
  width: number;
  height: number;
}

/** Engage band, as fractions of the preferred range: closer than MIN backs off, farther than MAX closes in. */
const ENGAGE_MIN = 0.6;
const ENGAGE_MAX = 1.1;
const CIRCLE_THROTTLE = 0.55;
const RETREAT_THROTTLE = 0.7;
/** Waypoint approach slows down inside this many arrive-radii */
const SLOWDOWN_RADII = 3;

export function distance(a: IPoint, b: IPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Ship heading (0 = north) that points from `from` towards `to`. */
export function headingTo(from: IPoint, to: IPoint): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90;
}

/** The locked target while it is alive, otherwise the nearest live candidate. */
export function pickTarget<T extends ITargetCandidate>(self: IPoint, candidates: T[], locked: T | null = null): T | null {
  if (locked && locked.alive) return locked;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (!c.alive) continue;
    const d = distance(self, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** The live candidate whose centre is within `radius` of `point` (nearest wins), for tap-to-target. */
export function hitTestTarget<T extends ITargetCandidate>(point: IPoint, candidates: T[], radius: number): T | null {
  let best: T | null = null;
  let bestDist = radius;
  for (const c of candidates) {
    if (!c.alive) continue;
    const d = distance(point, c);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function inRange(self: IPoint, target: IPoint, range: number): boolean {
  return distance(self, target) <= range;
}

/**
 * AUTO mode: close to `preferredRange`, back off if too close, and circle the target while inside
 * the band. Near the screen edge it steers back towards the centre first.
 */
export function engageSteer(self: IPoint, target: IPoint, preferredRange: number, bounds: IBounds, margin: number): ISteer {
  const centre = { x: bounds.width / 2, y: bounds.height / 2 };
  const nearEdge =
    self.x < margin || self.y < margin || self.x > bounds.width - margin || self.y > bounds.height - margin;
  if (nearEdge) return { headingDeg: headingTo(self, centre), throttle: 0.8 };

  const d = distance(self, target);
  const toTarget = headingTo(self, target);
  if (d > preferredRange * ENGAGE_MAX) return { headingDeg: toTarget, throttle: 1 };
  if (d < preferredRange * ENGAGE_MIN) return { headingDeg: toTarget + 180, throttle: RETREAT_THROTTLE };
  return { headingDeg: toTarget + 90, throttle: CIRCLE_THROTTLE };
}

/** Tap-to-move: head for the waypoint, easing off near it. Returns null once arrived. */
export function waypointSteer(self: IPoint, waypoint: IPoint, arriveRadius: number): ISteer | null {
  const d = distance(self, waypoint);
  if (d <= arriveRadius) return null;
  const throttle = Math.min(1, Math.max(0.3, d / (arriveRadius * SLOWDOWN_RADII)));
  return { headingDeg: headingTo(self, waypoint), throttle };
}
