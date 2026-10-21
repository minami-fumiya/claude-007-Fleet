import { IShipData } from '@/types/Ship';
import { IUpgradeData } from '@/types/Modifiers';
import { combineModifiers, upgradeModifiers, upgradeSlots } from './CustomizationSystem';
import { fleetPower } from './DifficultyCurve';
import { REFIT_TABLE, refitModifiers } from './RefitSystem';
import { researchModifiers, TECH_TREE, unlockedUpgrades } from './ResearchSystem';

/**
 * 自艦隊の戦力 (#280, pure): the admiral's fleet weighed like an area's enemy (HP × (1 + armor / 100), summed), with
 * each ship's remodel, fitted parts and finished research — so the two figures can be set side by side.
 */

export interface IFleetPowerProgress {
  research: string[];
  upgrades: Record<string, string[]>;
  refits: Record<string, number>;
  refitBranches: Record<string, string>;
}

/** The fleet's strength with what the admiral has done to its ships. */
export function ownFleetPower(ships: readonly IShipData[], progress: IFleetPowerProgress, catalog: IUpgradeData[]): number {
  const parts = unlockedUpgrades(catalog, progress.research);
  const research = researchModifiers(TECH_TREE, progress.research);
  return fleetPower(ships.map((s) => {
    const stage = progress.refits[s.id] ?? 0;
    const m = combineModifiers(upgradeModifiers(progress.upgrades[s.id] ?? [], parts, upgradeSlots(stage)), research, refitModifiers(REFIT_TABLE, s, stage, progress.refitBranches[s.id]));
    return { hp: s.hp * m.hpMul, armor: s.armor + m.armorAdd };
  }));
}

/** 寡兵の勝利章 (#280): a campaign win with a fleet at most this share of the enemy's strength. */
export const UNDERDOG_RATIO = 0.6;

export type PowerTone = 'danger' | 'even' | 'ahead';

/** Below 0.8× the enemy is a risk, 1.2× and up is comfortable. */
export function powerTone(own: number, enemy: number): PowerTone {
  const r = enemy > 0 ? own / enemy : Infinity;
  return r < 0.8 ? 'danger' : r < 1.2 ? 'even' : 'ahead';
}

/** "自艦隊 1,820 / 敵 1,560 (×1.17)". */
export function powerCompareText(own: number, enemy: number): string {
  const n = (v: number): string => v.toLocaleString('en-US');
  return `自艦隊 ${n(own)} / 敵 ${n(enemy)}${enemy > 0 ? ` (×${(own / enemy).toFixed(2)})` : ''}`;
}
