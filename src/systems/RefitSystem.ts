import { IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { IResources } from '@/types/Progression';
import { ShipClass } from '@/types/ShipClass';
import { combineModifiers } from './CustomizationSystem';
import { canAfford, pay } from './ResourceSystem';

/**
 * Remodels (改造, pure): each ship can be rebuilt twice (改 → 改二) once its crew is proficient enough and
 * the resources are paid. A stage's effects replace the previous stage's (they are not stacked).
 */

export interface IRefitStage {
  suffix: string;
  cost: Partial<IResources>;
  minProficiency: number;
  effects: Partial<IShipModifiers>;
}

export type RefitTable = Partial<Record<ShipClass, IRefitStage[]>>;

export function stagesFor(table: RefitTable, shipClass: ShipClass): IRefitStage[] {
  return table[shipClass] ?? [];
}

/** The next stage, or null when fully remodelled. */
export function nextStage(table: RefitTable, shipClass: ShipClass, stage: number): IRefitStage | null {
  return stagesFor(table, shipClass)[stage] ?? null;
}

export function canRefit(table: RefitTable, shipClass: ShipClass, stage: number, proficiency: number, have: IResources): boolean {
  const next = nextStage(table, shipClass, stage);
  return !!next && proficiency >= next.minProficiency && canAfford(have, next.cost);
}

/** Pays and advances one stage. Returns null if not possible. */
export function refit(table: RefitTable, shipClass: ShipClass, stage: number, proficiency: number, have: IResources): { stage: number; resources: IResources } | null {
  if (!canRefit(table, shipClass, stage, proficiency, have)) return null;
  const left = pay(have, nextStage(table, shipClass, stage)!.cost);
  return left ? { stage: stage + 1, resources: left } : null;
}

export function refitModifiers(table: RefitTable, shipClass: ShipClass, stage: number): IShipModifiers {
  if (stage <= 0) return NO_MODIFIERS;
  const s = stagesFor(table, shipClass)[Math.min(stage, stagesFor(table, shipClass).length) - 1];
  return s ? combineModifiers(s.effects) : NO_MODIFIERS;
}

/** "大和 (Yamato)" at stage 2 → "大和改二 (Yamato)". */
export function refitName(table: RefitTable, name: string, shipClass: ShipClass, stage: number): string {
  if (stage <= 0) return name;
  const s = stagesFor(table, shipClass)[Math.min(stage, stagesFor(table, shipClass).length) - 1];
  if (!s) return name;
  const m = name.match(/^(.*?)(\s*\(.*\))$/);
  return m ? `${m[1]}${s.suffix}${m[2]}` : `${name}${s.suffix}`;
}
