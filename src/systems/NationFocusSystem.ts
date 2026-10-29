import focusData from '@/data/focus.json';
import { IShipModifiers } from '@/types/Modifiers';
import { IResources } from '@/types/Progression';
import { ShipClass } from '@/types/ShipClass';
import { combineModifiers } from './CustomizationSystem';
import { canAfford, pay } from './ResourceSystem';

/**
 * 国家方針 (#49 #309, pure): each navy's tree of national focuses, taken one at a time over a few minutes. Some come
 * in pairs of which only one may be taken (大艦巨砲 or 航空主兵); each gives a lasting bonus, and the later ones open
 * the planned and unfinished ships (架空艦) to the shipyard. A pair's choice can be undone for resources (見直し).
 */
export interface IFocusNode {
  id: string;
  name: string;
  /** What it gives, one line */
  text: string;
  /** Rank index needed to start it */
  rank: number;
  minutes: number;
  cost: IResources;
  /** Every one of these first */
  requires?: string[];
  /** Any one of these first */
  requiresAny?: string[];
  /** Taking this closes these (and they close this) */
  exclusive?: string[];
  /** Bonus by ship class, folded into the ship's modifiers */
  mods?: Partial<Record<ShipClass, Partial<IShipModifiers>>>;
  /** Multiplies every build cost */
  buildMul?: number;
  /** Planned and unfinished ships it opens to the shipyard */
  unlocks?: string[];
}

export interface IFocusState {
  done: string[];
  current: { id: string; endsAt: number } | null;
}

export const EMPTY_FOCUS: IFocusState = { done: [], current: null };

/** Resources to undo a choice (見直し): the pair's taken side and everything after it come off. */
export const FOCUS_RESET_COST: IResources = { fuel: 2000, ammo: 2000, steel: 2000, bauxite: 500 };

const DATA = focusData as unknown as { nations: Record<string, IFocusNode[]> };

export function focusTree(nation: string): IFocusNode[] {
  return DATA.nations[nation] ?? [];
}

export function focusNode(nation: string, id: string): IFocusNode | undefined {
  return focusTree(nation).find((n) => n.id === id);
}

export type FocusStatus = 'done' | 'active' | 'ready' | 'busy' | 'rank' | 'locked' | 'closed' | 'resources';

/** Whether the node is closed off by a choice already made on the other side of its pair. */
export function closedBy(nation: string, state: IFocusState, id: string): string | undefined {
  const node = focusNode(nation, id);
  const taken = [...state.done, ...(state.current ? [state.current.id] : [])];
  // A node is closed when its pair's other side, or anything that side leads to, has been taken.
  const blocks = (n: IFocusNode | undefined): string | undefined => n?.exclusive?.find((x) => taken.includes(x));
  const direct = blocks(node);
  if (direct) return direct;
  for (const r of node?.requires ?? []) {
    const up = closedBy(nation, state, r);
    if (up) return up;
  }
  return undefined;
}

export function focusStatus(nation: string, state: IFocusState, id: string, rankIndex: number, have: IResources): FocusStatus {
  const node = focusNode(nation, id);
  if (!node) return 'locked';
  if (state.done.includes(id)) return 'done';
  if (state.current?.id === id) return 'active';
  if (closedBy(nation, state, id)) return 'closed';
  const reqOk = (node.requires ?? []).every((r) => state.done.includes(r)) && (!node.requiresAny || node.requiresAny.some((r) => state.done.includes(r)));
  if (!reqOk) return 'locked';
  if (rankIndex < node.rank) return 'rank';
  if (state.current) return 'busy';
  if (!canAfford(have, node.cost)) return 'resources';
  return 'ready';
}

/** Starts a focus: pays for it and sets its clock; null when it can't start now. */
export function startFocus(nation: string, state: IFocusState, id: string, rankIndex: number, have: IResources, now: number): { state: IFocusState; resources: IResources } | null {
  if (focusStatus(nation, state, id, rankIndex, have) !== 'ready') return null;
  const node = focusNode(nation, id)!;
  return { state: { ...state, current: { id, endsAt: now + node.minutes * 60_000 } }, resources: pay(have, node.cost)! };
}

/** Moves a finished focus into `done`; the same state when nothing has finished. */
export function settleFocus(state: IFocusState, now: number): { state: IFocusState; finished?: string } {
  if (!state.current || state.current.endsAt > now) return { state };
  return { state: { done: [...state.done, state.current.id], current: null }, finished: state.current.id };
}

/** Everything that comes after `id` in the tree (it included): what a 見直し takes off. */
function dependents(nation: string, id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of focusTree(nation)) {
      if (out.has(n.id) || ![...(n.requires ?? []), ...(n.requiresAny ?? [])].some((r) => out.has(r))) continue;
      out.add(n.id);
      grew = true;
    }
  }
  return out;
}

/**
 * 見直し: takes back a pair's choice (`id`, a node with an `exclusive` partner) and everything after it, so the other
 * side can be taken; costs FOCUS_RESET_COST. Nothing is refunded.
 */
export function resetFocus(nation: string, state: IFocusState, id: string, have: IResources): { state: IFocusState; resources: IResources } | null {
  const node = focusNode(nation, id);
  if (!node?.exclusive || !state.done.includes(id) || !canAfford(have, FOCUS_RESET_COST)) return null;
  const off = dependents(nation, id);
  const current = state.current && off.has(state.current.id) ? null : state.current;
  return { state: { done: state.done.filter((d) => !off.has(d)), current }, resources: pay(have, FOCUS_RESET_COST)! };
}

/** The lasting bonus of the focuses done for one class of ship. */
export function focusModifiers(nation: string, state: Pick<IFocusState, 'done'>, shipClass: ShipClass): IShipModifiers {
  return combineModifiers(...focusTree(nation).filter((n) => state.done.includes(n.id)).map((n) => n.mods?.[shipClass] ?? {}));
}

/** Every build cost is multiplied by this. */
export function focusBuildMul(nation: string, state: Pick<IFocusState, 'done'>): number {
  return focusTree(nation).filter((n) => state.done.includes(n.id)).reduce((m, n) => m * (n.buildMul ?? 1), 1);
}

/** The node that opens a planned ship, if any. */
export function unlockingFocus(nation: string, shipId: string): IFocusNode | undefined {
  return focusTree(nation).find((n) => n.unlocks?.includes(shipId));
}

/** Whether the focuses done open this planned ship. */
export function focusUnlocks(nation: string, state: Pick<IFocusState, 'done'>, shipId: string): boolean {
  const n = unlockingFocus(nation, shipId);
  return n !== undefined && state.done.includes(n.id);
}

/** Tolerant parse of a stored focus state. */
export function parseFocus(v: unknown): IFocusState {
  const o = (v !== null && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const done = Array.isArray(o.done) ? [...new Set(o.done.filter((x): x is string => typeof x === 'string'))] : [];
  const c = o.current as Record<string, unknown> | null | undefined;
  const current = c && typeof c === 'object' && typeof c.id === 'string' && typeof c.endsAt === 'number' ? { id: c.id, endsAt: c.endsAt } : null;
  return { done, current };
}

