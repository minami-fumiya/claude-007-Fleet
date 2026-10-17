import { IDockJob, IResources } from '@/types/Progression';
import { resources } from './ResourceSystem';

/**
 * Damage and repairs (pure). Damage is the HP fraction a ship came home with (missing = undamaged).
 * Two docks repair in parallel in real time; a fast repair finishes a docked ship at once for a fee.
 */

export const DOCK_COUNT = 2;
/** Real milliseconds per point of HP repaired. */
export const MS_PER_HP = 60;
/** A ship sunk in battle comes home heavily damaged (大破) rather than being lost. */
export const SUNK_HP_FRACTION = 0.1;
export const FAST_REPAIR_COST: IResources = { fuel: 40, ammo: 0, steel: 80, bauxite: 0 };

export interface IDockState {
  /** Ship id → HP fraction (0..1); absent = full health */
  damage: Record<string, number>;
  docks: IDockJob[];
}

export function hpFraction(state: IDockState, shipId: string): number {
  return Math.min(1, Math.max(0, state.damage[shipId] ?? 1));
}

export function isDocked(state: IDockState, shipId: string): boolean {
  return state.docks.some((d) => d.shipId === shipId);
}

export function missingHp(maxHp: number, fraction: number): number {
  return Math.max(0, Math.round(maxHp * (1 - fraction)));
}

export function repairCost(maxHp: number, fraction: number): IResources {
  const missing = missingHp(maxHp, fraction);
  return resources({ fuel: Math.ceil(missing * 0.3), steel: Math.ceil(missing * 0.6) });
}

export function repairTimeMs(maxHp: number, fraction: number): number {
  return missingHp(maxHp, fraction) * MS_PER_HP;
}

/** Records a ship's state after a battle (1 = undamaged clears the entry). */
export function setDamage(state: IDockState, shipId: string, fraction: number): IDockState {
  const damage = { ...state.damage };
  const f = Math.min(1, Math.max(0, fraction));
  if (f >= 1) delete damage[shipId];
  else damage[shipId] = f;
  return { ...state, damage };
}

/** Puts a damaged ship into a free dock. Returns null if it can't (no dock free, not damaged, already in). */
export function startRepair(state: IDockState, shipId: string, maxHp: number, now: number): IDockState | null {
  const f = hpFraction(state, shipId);
  if (f >= 1 || isDocked(state, shipId) || state.docks.length >= DOCK_COUNT) return null;
  return { ...state, docks: [...state.docks, { shipId, endsAt: now + repairTimeMs(maxHp, f) }] };
}

/** Releases every ship whose repair has finished. */
export function completeRepairs(state: IDockState, now: number): IDockState {
  const done = state.docks.filter((d) => d.endsAt <= now);
  if (done.length === 0) return state;
  let next: IDockState = { ...state, docks: state.docks.filter((d) => d.endsAt > now) };
  for (const d of done) next = setDamage(next, d.shipId, 1);
  return next;
}

/** Finishes a docked ship's repair now. */
export function fastRepair(state: IDockState, shipId: string): IDockState {
  if (!isDocked(state, shipId)) return state;
  return setDamage({ ...state, docks: state.docks.filter((d) => d.shipId !== shipId) }, shipId, 1);
}
