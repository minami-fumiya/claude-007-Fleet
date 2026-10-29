import { IShipModifiers } from '@/types/Modifiers';
import { ShipClass } from '@/types/ShipClass';
import { combineModifiers } from './CustomizationSystem';
import { MAX_PROFICIENCY } from './ProficiencySystem';

/**
 * 艦隊技術 (#56, pure): collecting and raising a navy's ships makes every ship of that class in the navy a little
 * stronger. Points are worked out from the save as it stands (nothing new is stored), per navy and class:
 * a ship owned 1, each remodel (改 / 改二 / 改三) 1 / 2 / 2 more, and a crew at full proficiency 2 more.
 */

/** Points at which a class's technology reaches Lv1 … Lv5. */
export const TECH_THRESHOLDS = [5, 15, 30, 50, 80] as const;
export const TECH_MAX_LEVEL = TECH_THRESHOLDS.length;

/** Points a remodel stage adds on top of owning the ship (stage 1, 2, 3). */
const REFIT_POINTS = [0, 1, 3, 5];
const FULL_CREW_POINTS = 2;

/** What one level gives every ship of the class (the levels add up). */
export const TECH_PER_LEVEL: Record<ShipClass, Partial<IShipModifiers>> = {
  [ShipClass.Battleship]: { gunPowerMul: 1.015, hpMul: 1.01 },
  [ShipClass.Cruiser]: { gunReloadMul: 0.985, aaMul: 1.02 },
  [ShipClass.Destroyer]: { torpedoPowerMul: 1.02, evadeAdd: 0.005 },
  [ShipClass.Carrier]: { airPowerMul: 1.02, rearmMul: 0.985 },
  [ShipClass.Submarine]: { torpedoPowerMul: 1.02, speedMul: 1.01 },
};

export const TECH_EFFECT_TEXT: Record<ShipClass, string> = {
  [ShipClass.Battleship]: '砲撃 +1.5%・耐久 +1%',
  [ShipClass.Cruiser]: '主砲の装填 1.5% 短縮・対空 +2%',
  [ShipClass.Destroyer]: '雷撃 +2%・回避 +0.5%',
  [ShipClass.Carrier]: '航空攻撃 +2%・艦載機の再出撃 1.5% 短縮',
  [ShipClass.Submarine]: '雷撃 +2%・速力 +1%',
};

export interface ITechInput {
  ships: readonly string[];
  refits: Readonly<Record<string, number>>;
  proficiency: Readonly<Record<string, number>>;
}

/** The points one owned ship brings. */
export function shipTechPoints(id: string, p: ITechInput): number {
  const stage = Math.max(0, Math.min(REFIT_POINTS.length - 1, p.refits[id] ?? 0));
  return 1 + REFIT_POINTS[stage] + ((p.proficiency[id] ?? 0) >= MAX_PROFICIENCY ? FULL_CREW_POINTS : 0);
}

/** Points per class for a navy's save: `classOf` tells each owned ship's class (ships not in the roster count for nothing). */
export function techPoints(p: ITechInput, classOf: (id: string) => ShipClass | undefined): Record<ShipClass, number> {
  const out = Object.fromEntries(Object.values(ShipClass).map((c) => [c, 0])) as Record<ShipClass, number>;
  for (const id of new Set(p.ships)) {
    const c = classOf(id);
    if (c) out[c] += shipTechPoints(id, p);
  }
  return out;
}

export function techLevel(points: number): number {
  return TECH_THRESHOLDS.filter((t) => points >= t).length;
}

/** Points still needed for the next level, or undefined at the top. */
export function toNextLevel(points: number): number | undefined {
  const next = TECH_THRESHOLDS.find((t) => points < t);
  return next === undefined ? undefined : next - points;
}

/** The bonus a class gets at a level: the per-level bonus, `level` times over. */
export function techModifiers(shipClass: ShipClass, level: number): IShipModifiers {
  return combineModifiers(...Array.from({ length: Math.max(0, Math.min(TECH_MAX_LEVEL, level)) }, () => TECH_PER_LEVEL[shipClass]));
}
