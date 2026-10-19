import { IDockJob, IResources } from '@/types/Progression';
import { canAfford, pay, resources } from './ResourceSystem';
import { RANKS, rankOf, IRankProgress } from './RankSystem';
import { ShipClass } from '@/types/ShipClass';

/**
 * Damage and repairs (pure). Damage is the HP fraction a ship came home with (missing = undamaged).
 * Docks repair in parallel in real time; a fast repair finishes a docked ship at once for a fee. A new admiral has
 * one dock and builds more (up to MAX_DOCKS) as the rank allows (#38).
 */

/** Docks a new admiral starts with, and the most that can be built. */
export const START_DOCKS = 1;
export const MAX_DOCKS = 4;

/** Dock n + 2 (the 2nd, 3rd, 4th dock): the rank index it needs and what it costs. */
export const DOCK_UPGRADES: Array<{ rank: number; cost: IResources }> = [
  { rank: 2, cost: { fuel: 200, ammo: 0, steel: 300, bauxite: 0 } },
  { rank: 6, cost: { fuel: 500, ammo: 0, steel: 800, bauxite: 0 } },
  { rank: 8, cost: { fuel: 1000, ammo: 0, steel: 1500, bauxite: 0 } },
];
/** Real milliseconds per point of HP repaired (a cruiser; the default when the class is unknown). */
export const MS_PER_HP = 1200;
/**
 * Repair time per HP by class (#143): a destroyer's light damage takes tens of seconds, a battleship coming home
 * 大破 20–30 minutes.
 */
export const MS_PER_HP_BY_CLASS: Record<ShipClass, number> = {
  [ShipClass.Destroyer]: 700,
  [ShipClass.Submarine]: 700,
  [ShipClass.Cruiser]: MS_PER_HP,
  [ShipClass.Carrier]: 2000,
  [ShipClass.Battleship]: 2500,
};
/** A ship sunk in battle comes home heavily damaged (大破) rather than being lost. */
export const SUNK_HP_FRACTION = 0.1;
export const FAST_REPAIR_COST: IResources = { fuel: 40, ammo: 0, steel: 80, bauxite: 0 };

export interface IDockState {
  /** Ship id → HP fraction (0..1); absent = full health */
  damage: Record<string, number>;
  docks: IDockJob[];
  /** Docks built (START_DOCKS when absent) */
  docksOwned?: number;
}

/** Docks that can repair at once. */
export function dockCount(state: Pick<IDockState, 'docksOwned'>): number {
  return Math.min(MAX_DOCKS, Math.max(START_DOCKS, state.docksOwned ?? START_DOCKS));
}

export type DockUpgradeState = 'max' | 'rank' | 'resources' | 'ready';

/** The next dock to build: its cost, the rank it needs, and whether it can be built now. */
export function nextDock(progress: IRankProgress & { docksOwned?: number; resources: IResources }): { state: DockUpgradeState; cost: IResources; rankName: string } | null {
  const owned = dockCount(progress);
  const up = DOCK_UPGRADES[owned - START_DOCKS];
  if (owned >= MAX_DOCKS || !up) return null;
  const rankName = RANKS[up.rank].name;
  if (rankOf(progress).index < up.rank) return { state: 'rank', cost: up.cost, rankName };
  return { state: canAfford(progress.resources, up.cost) ? 'ready' : 'resources', cost: up.cost, rankName };
}

/** Pays for and adds a dock; null when it can't be built now. */
export function buildDock<T extends IRankProgress & { docksOwned?: number; resources: IResources }>(progress: T): T | null {
  const next = nextDock(progress);
  if (!next || next.state !== 'ready') return null;
  const left = pay(progress.resources, next.cost);
  return left ? { ...progress, resources: left, docksOwned: dockCount(progress) + 1 } : null;
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

/** Fuel and steel for the missing HP; steel was lowered from 0.4 per HP because it ran out first (#35). */
export function repairCost(maxHp: number, fraction: number): IResources {
  const missing = missingHp(maxHp, fraction);
  // Steel was the scarce one (#132): repairs take less of it.
  return resources({ fuel: Math.ceil(missing * 0.25), steel: Math.ceil(missing * 0.15) });
}

/** `timeMul` is the current base's repair-time multiplier (#88); `shipClass` sets the time per HP (#143). */
export function repairTimeMs(maxHp: number, fraction: number, timeMul = 1, shipClass?: ShipClass): number {
  const perHp = shipClass ? MS_PER_HP_BY_CLASS[shipClass] : MS_PER_HP;
  return Math.round(missingHp(maxHp, fraction) * perHp * timeMul);
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
export function startRepair(state: IDockState, shipId: string, maxHp: number, now: number, timeMul = 1, shipClass?: ShipClass): IDockState | null {
  const f = hpFraction(state, shipId);
  if (f >= 1 || isDocked(state, shipId) || state.docks.length >= dockCount(state)) return null;
  return { ...state, docks: [...state.docks, { shipId, endsAt: now + repairTimeMs(maxHp, f, timeMul, shipClass) }] };
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

// ---------------------------------------------------------------------------
// Docks by base (#145)
// ---------------------------------------------------------------------------

type WithBaseDocks = IDockState & { baseDocks: Record<string, number> };

/** One base's docks: its repairs and how many docks it has built (the other bases' jobs are left out). */
export function baseDockView<T extends WithBaseDocks>(progress: T, baseId: string): T {
  return { ...progress, docks: progress.docks.filter((j) => (j.base ?? baseId) === baseId), docksOwned: progress.baseDocks[baseId] ?? START_DOCKS };
}

/** Writes a base's dock view (after a repair, a fast repair or a new dock) back into the progress. */
export function mergeBaseDocks<T extends WithBaseDocks>(progress: T, baseId: string, view: T): T {
  return {
    ...view,
    docksOwned: progress.docksOwned,
    docks: [...progress.docks.filter((j) => (j.base ?? baseId) !== baseId), ...view.docks.map((j) => ({ ...j, base: baseId }))],
    baseDocks: { ...progress.baseDocks, [baseId]: dockCount(view) },
  };
}
