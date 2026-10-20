import { IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { IResources } from '@/types/Progression';
import { IShipData } from '@/types/Ship';
import { IAirWing } from '@/types/Aircraft';
import { ShipClass } from '@/types/ShipClass';
import { combineModifiers } from './CustomizationSystem';
import { canAfford, pay, scaleCost } from './ResourceSystem';
import refitsData from '@/data/refits.json';

/**
 * Remodels (改造, pure): each ship can be rebuilt in stages (改 → 改二 → 改三) once its crew is proficient
 * enough and the resources are paid. A stage's effects replace the previous stage's (they are not stacked).
 * Flagship-grade ships have special refits (per ship id) that override a class stage's name, effects and cost,
 * and may swap weapons or embark an air wing.
 */

/** Replace weapon `from` with `to` (or remove it when `to` is null). Swaps of every reached stage apply. */
export interface IWeaponSwap {
  from: string;
  to: string | null;
}

export interface IRefitStage {
  suffix: string;
  cost: Partial<IResources>;
  minProficiency: number;
  effects: Partial<IShipModifiers>;
  /** Special refits: what was done (shown in the remodel panel) */
  label?: string;
  swap?: IWeaponSwap[];
  /** Special refits: embarked aircraft from this stage on (e.g. an aviation battleship) */
  airWing?: IAirWing;
  /** True when a per-ship refit replaced the class stage */
  special?: boolean;
}

/** A per-ship override of class stage `stage` (1 = 改, 2 = 改二, 3 = 改三). */
export interface IShipRefit extends Partial<IRefitStage> {
  stage: number;
}

/**
 * A direction for a class's last stage (#86): 改三甲 / 乙 / 丙 trade the standard 改三 for a speciality (anti-air, torpedoes,
 * armour …). Chosen when the stage is reached and changeable later for the stage's cost. Ships whose last stage is a
 * special refit have no branches.
 */
export interface IRefitBranch {
  id: string;
  suffix: string;
  label: string;
  effects: Partial<IShipModifiers>;
}

export interface RefitTable {
  classes: Partial<Record<ShipClass, IRefitStage[]>>;
  /** Alternatives to each class's last stage (#86) */
  branches?: Partial<Record<ShipClass, IRefitBranch[]>>;
  /** Special refits by ship id; ids not in the ship data are simply never used */
  ships?: Record<string, IShipRefit[]>;
}

/** What the refit functions need to know about a ship. */
export type RefitShip = Pick<IShipData, 'id' | 'shipClass'>;

/** The game's remodel table (src/data/refits.json). */
export const REFIT_TABLE = refitsData as RefitTable;

/** The branches open to the ship's last stage (none when a special refit takes it, #86). */
export function branchesFor(table: RefitTable, ship: RefitShip): IRefitBranch[] {
  const last = (table.classes[ship.shipClass] ?? []).length;
  if (last === 0 || (table.ships?.[ship.id] ?? []).some((o) => o.stage === last)) return [];
  return table.branches?.[ship.shipClass] ?? [];
}

/**
 * The ship's stages: its class stages with any special refits for this ship merged in, and the chosen branch (#86)
 * in place of the standard last stage. An unknown branch reads as the standard stage.
 */
export function stagesFor(table: RefitTable, ship: RefitShip, branch?: string): IRefitStage[] {
  const base = table.classes[ship.shipClass] ?? [];
  const overrides = table.ships?.[ship.id] ?? [];
  const chosen = branch ? branchesFor(table, ship).find((b) => b.id === branch) : undefined;
  return base.map((s, i) => {
    const o = overrides.find((x) => x.stage === i + 1);
    if (!o) return chosen && i === base.length - 1 ? { ...s, suffix: chosen.suffix, label: chosen.label, effects: chosen.effects } : s;
    return {
      ...s,
      suffix: o.suffix ?? s.suffix,
      cost: o.cost ?? s.cost,
      minProficiency: o.minProficiency ?? s.minProficiency,
      effects: o.effects ?? s.effects,
      label: o.label,
      swap: o.swap,
      airWing: o.airWing,
      special: true,
    };
  });
}

export function maxStage(table: RefitTable, ship: RefitShip): number {
  return stagesFor(table, ship).length;
}

/** The stage reached (null before the first remodel). */
export function currentStage(table: RefitTable, ship: RefitShip, stage: number, branch?: string): IRefitStage | null {
  if (stage <= 0) return null;
  const stages = stagesFor(table, ship, branch);
  return stages[Math.min(stage, stages.length) - 1] ?? null;
}

/** The next stage, or null when fully remodelled. */
export function nextStage(table: RefitTable, ship: RefitShip, stage: number, branch?: string): IRefitStage | null {
  return stagesFor(table, ship, branch)[stage] ?? null;
}

/**
 * Switching a fully remodelled ship to another branch (#86) costs the last stage again; null when it can't (not at
 * the last stage, no such branch, already on it, or short of resources).
 */
/** What changing a finished ship's direction costs (#265): half the last stage's resources. */
export const SWITCH_COST_MUL = 0.5;
export function switchCost(table: RefitTable, ship: RefitShip): Partial<IResources> {
  return scaleCost(stagesFor(table, ship)[maxStage(table, ship) - 1]?.cost ?? {}, SWITCH_COST_MUL);
}

export function switchBranch(table: RefitTable, ship: RefitShip, stage: number, from: string | undefined, to: string, have: IResources): IResources | null {
  const last = maxStage(table, ship);
  if (stage < last || (from ?? 'standard') === to) return null;
  if (to !== 'standard' && !branchesFor(table, ship).some((b) => b.id === to)) return null;
  return pay(have, switchCost(table, ship));
}

export function canRefit(table: RefitTable, ship: RefitShip, stage: number, proficiency: number, have: IResources): boolean {
  const next = nextStage(table, ship, stage);
  return !!next && proficiency >= next.minProficiency && canAfford(have, next.cost);
}

/** Pays and advances one stage. Returns null if not possible. */
export function refit(table: RefitTable, ship: RefitShip, stage: number, proficiency: number, have: IResources): { stage: number; resources: IResources } | null {
  if (!canRefit(table, ship, stage, proficiency, have)) return null;
  const left = pay(have, nextStage(table, ship, stage)!.cost);
  return left ? { stage: stage + 1, resources: left } : null;
}

export function refitModifiers(table: RefitTable, ship: RefitShip, stage: number, branch?: string): IShipModifiers {
  const s = currentStage(table, ship, stage, branch);
  return s ? combineModifiers(s.effects) : NO_MODIFIERS;
}

/** "大和 (Yamato)" at stage 2 → "大和改二 (Yamato)". */
export function refitName(table: RefitTable, name: string, ship: RefitShip, stage: number, branch?: string): string {
  const s = currentStage(table, ship, stage, branch);
  if (!s) return name;
  const m = name.match(/^(.*?)(\s*\(.*\))$/);
  return m ? `${m[1]}${s.suffix}${m[2]}` : `${name}${s.suffix}`;
}

/** Weapon ids after the swaps of every stage up to `stage` (unknown `from` ids are ignored). */
export function refitWeapons(table: RefitTable, ship: RefitShip, weapons: string[], stage: number): string[] {
  let out = [...weapons];
  for (const s of stagesFor(table, ship).slice(0, Math.max(0, stage))) {
    for (const sw of s.swap ?? []) {
      const i = out.indexOf(sw.from);
      if (i < 0) continue;
      out = sw.to === null ? out.filter((_, j) => j !== i) : out.map((w, j) => (j === i ? sw.to! : w));
    }
  }
  return out;
}

/** The ship as rebuilt at `stage`: swapped weapons and the air wing of the latest stage that sets one. */
export function refitShipData(table: RefitTable, ship: IShipData, stage: number): IShipData {
  if (stage <= 0) return ship;
  const reached = stagesFor(table, ship).slice(0, stage);
  const wing = [...reached].reverse().find((s) => s.airWing)?.airWing;
  return {
    ...ship,
    weapons: refitWeapons(table, ship, ship.weapons, stage),
    ...(wing ? { airWing: { ...wing } } : {}),
  };
}
