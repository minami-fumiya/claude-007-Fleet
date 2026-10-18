import { ISteer } from './AutoPilot';
import { FormationSystem } from './FormationSystem';
import { IFormationSlotOffset } from '@/types/Formation';
import { rotateTowardsDegrees } from '@/utils/MathUtils';

/**
 * Formation keeping for escorts (#80, pure). Escorts used to aim at their slot around the flagship's *current* heading,
 * so a sharp turn swung the rear slots hundreds of pixels sideways and the rear ships ran off in odd directions; on
 * arrival they stopped dead and lurched off again. Now:
 * - the formation turns at a limited rate (`FORMATION_TURN_DEG`), so slots move no faster than escorts can follow;
 * - near its slot an escort matches the flagship's course and speed instead of stopping;
 * - an escort that has overshot its slot slows down on the formation course rather than turning around.
 */

/** How fast the formation's reference heading follows the flagship (deg/s). */
export const FORMATION_TURN_DEG = 30;
/** Within this distance of its slot an escort keeps station (course and speed of the flagship). */
export const STATION_RADIUS = 40;
/** Beyond this distance an escort always steers straight for its slot. */
const CATCH_UP_RADIUS = 260;
/** A slot this far behind the bow counts as "overshot". */
const BEHIND_DEG = 100;

export interface IEscortPose {
  x: number;
  y: number;
  /** Bow heading in degrees, Phaser convention (0 = up) */
  angle: number;
  /** Top speed now (px/s) */
  speed: number;
}

export interface IFlagshipPose extends IEscortPose {
  /** Current speed over the water (px/s) */
  currentSpeed: number;
}

/** The formation heading one step later: follows the flagship's heading at FORMATION_TURN_DEG. */
export function nextFormationHeading(current: number, flagshipAngle: number, dtSec: number): number {
  return rotateTowardsDegrees(current, flagshipAngle, FORMATION_TURN_DEG * dtSec);
}

/** Smallest signed difference a − b in degrees (−180..180]. */
function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Steering for one escort keeping `offset` in the formation whose reference heading is `formationHeading`. */
export function escortSteer(escort: IEscortPose, flagship: IFlagshipPose, offset: IFormationSlotOffset, formationHeading: number): ISteer {
  const slot = FormationSystem.getWorldPositionFromValues(flagship.x, flagship.y, formationHeading, offset);
  const dx = slot.x - escort.x;
  const dy = slot.y - escort.y;
  const d = Math.hypot(dx, dy);
  // Matching the flagship's speed, as a throttle of this escort's top speed.
  const match = escort.speed > 0 ? Math.min(1, flagship.currentSpeed / escort.speed) : 0;
  if (d <= STATION_RADIUS) return { headingDeg: formationHeading, throttle: match };
  const toSlot = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  const behind = Math.abs(angleDiff(toSlot, escort.angle)) > BEHIND_DEG;
  if (behind && d < CATCH_UP_RADIUS) {
    // Overshot: hold the formation course and let the slot catch up.
    return { headingDeg: formationHeading, throttle: Math.max(0.15, match * 0.5) };
  }
  // Close the gap: full speed when far, easing to the flagship's speed near the slot.
  const t = Math.min(1, (d - STATION_RADIUS) / (CATCH_UP_RADIUS - STATION_RADIUS));
  return { headingDeg: toSlot, throttle: Math.max(match, match + (1 - match) * t) };
}
