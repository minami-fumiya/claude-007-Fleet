import { CARRIER_AIRCRAFT, CarrierAircraft, IAirWing, AircraftType } from '@/types/Aircraft';

/**
 * A carrier's air wing (pure): how many planes of each type are on deck and ready, how many are
 * aloft, and which are being re-armed after landing. Planes shot down are gone for the battle.
 */

/** Planes sent per launch. */
export const SQUADRON_SIZE = 3;
/** Time to refuel and re-arm a squadron after it lands. */
export const REARM_MS = 18000;

type Counts = Record<CarrierAircraft, number>;

export interface IRearming {
  type: CarrierAircraft;
  count: number;
  readyAt: number;
}

export interface IAirWingState {
  ready: Counts;
  aloft: Counts;
  rearming: IRearming[];
  lost: number;
}

function counts(f = 0, d = 0, t = 0): Counts {
  return { [AircraftType.Fighter]: f, [AircraftType.DiveBomber]: d, [AircraftType.TorpedoBomber]: t };
}

export function createAirWing(wing: IAirWing): IAirWingState {
  return {
    ready: counts(wing.fighters, wing.diveBombers, wing.torpedoBombers),
    aloft: counts(),
    rearming: [],
    lost: 0,
  };
}

/** Planes the wing still has (ready + aloft + re-arming). */
export function totalPlanes(state: IAirWingState): number {
  const sum = (c: Counts): number => CARRIER_AIRCRAFT.reduce((n, t) => n + c[t], 0);
  return sum(state.ready) + sum(state.aloft) + state.rearming.reduce((n, r) => n + r.count, 0);
}

/** Launches up to `max` ready planes of `type`. Returns the new state and how many took off. */
export function launch(state: IAirWingState, type: CarrierAircraft, max = SQUADRON_SIZE): { state: IAirWingState; count: number } {
  const count = Math.max(0, Math.min(max, state.ready[type]));
  if (count === 0) return { state, count };
  return {
    count,
    state: {
      ...state,
      ready: { ...state.ready, [type]: state.ready[type] - count },
      aloft: { ...state.aloft, [type]: state.aloft[type] + count },
    },
  };
}

/** A squadron came back: `survivors` land and start re-arming; the rest of those launched were lost. */
export function land(state: IAirWingState, type: CarrierAircraft, launched: number, survivors: number, now: number): IAirWingState {
  const back = Math.max(0, Math.min(launched, survivors));
  const rearming = back > 0 ? [...state.rearming, { type, count: back, readyAt: now + REARM_MS }] : state.rearming;
  return {
    ...state,
    aloft: { ...state.aloft, [type]: Math.max(0, state.aloft[type] - launched) },
    rearming,
    lost: state.lost + (launched - back),
  };
}

/** A squadron was wiped out (or its carrier sank under it). */
export function lose(state: IAirWingState, type: CarrierAircraft, launched: number): IAirWingState {
  return land(state, type, launched, 0, 0);
}

/** Moves re-armed planes back to the ready pool. */
export function tickAirWing(state: IAirWingState, now: number): IAirWingState {
  if (!state.rearming.some((r) => r.readyAt <= now)) return state;
  const ready = { ...state.ready };
  const rearming: IRearming[] = [];
  for (const r of state.rearming) {
    if (r.readyAt <= now) ready[r.type] += r.count;
    else rearming.push(r);
  }
  return { ...state, ready, rearming };
}
