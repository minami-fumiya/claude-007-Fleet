/**
 * Dive state of one submarine. Pure: the scene feeds it elapsed time and the captain's wish to be
 * submerged, and reads back whether the boat is under water, how fast it may go and how much air
 * is left. While submerged it can only launch torpedoes and only depth charges can reach it.
 */

/** Seconds a full air supply lasts under water. */
export const SUBMERGED_ENDURANCE_SEC = 30;
/** Air refills this many times faster on the surface than it drains under water. */
export const RECHARGE_RATE = 2;
/** After running out of air the boat must refill to this level before it can dive again. */
export const DIVE_MIN_AIR = 0.35;
/** Speed multiplier while submerged. */
export const SUBMERGED_SPEED_FACTOR = 0.6;

export interface ISubmarineState {
  submerged: boolean;
  /** 0..1 remaining air / battery */
  air: number;
  /** True after an emergency surfacing until air reaches DIVE_MIN_AIR */
  forcedSurface: boolean;
}

export function createSubmarineState(submerged = false): ISubmarineState {
  return { submerged, air: 1, forcedSurface: false };
}

/** Advances the dive state by `dtSec`. Returns the new state (the input is not modified). */
export function updateSubmarine(state: ISubmarineState, dtSec: number, wantSubmerged: boolean): ISubmarineState {
  let { air, forcedSurface } = state;
  let submerged = wantSubmerged && !forcedSurface;

  if (submerged) {
    air = Math.max(0, air - dtSec / SUBMERGED_ENDURANCE_SEC);
    if (air <= 0) {
      submerged = false;
      forcedSurface = true;
    }
  } else {
    air = Math.min(1, air + (dtSec * RECHARGE_RATE) / SUBMERGED_ENDURANCE_SEC);
    if (forcedSurface && air >= DIVE_MIN_AIR) forcedSurface = false;
  }
  return { submerged, air, forcedSurface };
}

/** Can the boat start a dive right now? */
export function canDive(state: ISubmarineState): boolean {
  return !state.forcedSurface && state.air > 0;
}

export function speedFactor(state: ISubmarineState): number {
  return state.submerged ? SUBMERGED_SPEED_FACTOR : 1;
}
