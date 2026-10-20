/** 掃討の回数 (#181, pure): each area banks up to three sweeps, one more an hour, and starts empty on its first S. */

/** Sweeps an area can bank (#181): up to three, one more every hour. */
export const SWEEP_MAX = 3;
/** One sweep comes back this often (#181). */
export const SWEEP_RECHARGE_MS = 60 * 60_000;

/** Banked sweeps of one area (#181): `charges` at time `at`, one more every SWEEP_RECHARGE_MS after it until SWEEP_MAX. */
export interface ISweepCharge {
  charges: number;
  at: number;
}

/** A newly opened area starts empty, its hour counted from now (#181: no sweeps right after the first S). */
export function newSweepCharge(now: number): ISweepCharge {
  return { charges: 0, at: now };
}

/**
 * Sweeps banked now (#181). A clock set back before `at` adds nothing. An area without a record (an S from before the
 * charges, or a malformed save) counts as full: the change never takes sweeps away.
 */
export function sweepCharges(state: ISweepCharge | undefined, now: number): number {
  if (!state) return SWEEP_MAX;
  if (state.charges >= SWEEP_MAX || now <= state.at) return Math.min(SWEEP_MAX, state.charges);
  return Math.min(SWEEP_MAX, state.charges + Math.floor((now - state.at) / SWEEP_RECHARGE_MS));
}

/** Milliseconds to the next sweep, or 0 when full (#181). */
export function nextSweepMs(state: ISweepCharge | undefined, now: number): number {
  if (!state || sweepCharges(state, now) >= SWEEP_MAX) return 0;
  if (now <= state.at) return SWEEP_RECHARGE_MS;
  return SWEEP_RECHARGE_MS - ((now - state.at) % SWEEP_RECHARGE_MS);
}

/** The record after one sweep is used: the hour already running keeps going; a full bank starts its hour now. */
export function useSweepCharge(state: ISweepCharge | undefined, now: number): ISweepCharge {
  const have = sweepCharges(state, now);
  if (!state || have >= SWEEP_MAX || now <= state.at) return { charges: Math.max(0, have - 1), at: Math.max(now, state?.at ?? now) };
  const hours = Math.floor((now - state.at) / SWEEP_RECHARGE_MS);
  return { charges: have - 1, at: state.at + hours * SWEEP_RECHARGE_MS };
}
