import { IShipModifiers } from '@/types/Modifiers';

/**
 * 士気 (#54, pure): 0..100 per ship, 50 when rested. A sortie tires the crew, a win lifts it, and time brings it back
 * towards 50. High morale (キラキラ) aims and dodges a little better; a tired crew dodges and reloads worse.
 */

export const MORALE_REST = 50;
export const MORALE_MAX = 100;
/** Each campaign battle a ship fights */
export const MORALE_SORTIE = -15;
/** A win, and more for an S */
export const MORALE_WIN = 8;
export const MORALE_S = 12;
/** Points a minute back towards MORALE_REST (a tired ship is rested in about two hours) */
export const MORALE_PER_MINUTE = 0.3;
/** At or above: キラキラ. Below: 疲労; below MORALE_WARN the fleet builder warns. */
export const MORALE_HIGH = 70;
export const MORALE_TIRED = 30;
export const MORALE_WARN = 20;
/** 給糧艦 (#54): the whole navy's morale rises by this much (up to the top). */
export const SUPPLY_SHIP_GAIN = 30;

export interface IMoraleState {
  /** Ship id → morale when last changed */
  morale: Record<string, number>;
  /** Ship id → when it was last changed (ms) */
  moraleAt: Record<string, number>;
}

/** The ship's morale now: the stored value drifted towards MORALE_REST since it was stored. */
export function moraleOf(state: Partial<IMoraleState>, shipId: string, now: number): number {
  const stored = state.morale?.[shipId];
  if (stored === undefined) return MORALE_REST;
  const minutes = Math.max(0, (now - (state.moraleAt?.[shipId] ?? now)) / 60_000);
  const drift = minutes * MORALE_PER_MINUTE;
  const v = stored > MORALE_REST ? Math.max(MORALE_REST, stored - drift) : Math.min(MORALE_REST, stored + drift);
  return Math.round(v);
}

/** Adds `delta` to each ship's current morale (0..100), stamping the time. */
export function addMorale<T extends Partial<IMoraleState>>(state: T, shipIds: readonly string[], delta: number, now: number): T {
  const morale = { ...(state.morale ?? {}) };
  const moraleAt = { ...(state.moraleAt ?? {}) };
  for (const id of shipIds) {
    morale[id] = Math.max(0, Math.min(MORALE_MAX, moraleOf(state, id, now) + delta));
    moraleAt[id] = now;
  }
  return { ...state, morale, moraleAt };
}

/** Uses a 給糧艦: every ship in `shipIds` gains SUPPLY_SHIP_GAIN; null without one. */
export function useSupplyShip<T extends Partial<IMoraleState> & { items: { supplyShip: number } }>(state: T, shipIds: readonly string[], now: number): T | null {
  if ((state.items.supplyShip ?? 0) <= 0) return null;
  return { ...addMorale(state, shipIds, SUPPLY_SHIP_GAIN, now), items: { ...state.items, supplyShip: state.items.supplyShip - 1 } };
}

/** What a battle does to the morale of the ships that fought: tired by the sortie, lifted by a win. */
export function battleMoraleDelta(victory: boolean, rank: string): number {
  return MORALE_SORTIE + (victory ? (rank === 'S' ? MORALE_S : MORALE_WIN) : 0);
}

export type MoraleMood = 'high' | 'normal' | 'tired';

export function moraleMood(value: number): MoraleMood {
  return value >= MORALE_HIGH ? 'high' : value < MORALE_TIRED ? 'tired' : 'normal';
}

/** "士気 72 ★" / "士気 25 疲労" */
export function moraleLabel(value: number): string {
  const mood = moraleMood(value);
  return `士気 ${value}${mood === 'high' ? ' ★' : mood === 'tired' ? ' 疲労' : ''}`;
}

/** The battle modifiers of a crew's morale: a little better aim and dodging when high, worse dodging and reload when tired. */
export function moraleModifiers(value: number): Partial<IShipModifiers> {
  const mood = moraleMood(value);
  if (mood === 'high') return { evadeAdd: 0.03, gunReloadMul: 0.97 };
  if (mood === 'tired') return { evadeAdd: -0.03, gunReloadMul: 1.08 };
  return {};
}
