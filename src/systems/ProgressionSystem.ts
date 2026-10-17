import { IShipData } from '@/types/Ship';
import { IResources } from '@/types/Progression';
import { IProgress } from '@/utils/ProgressStore';
import { addResources, BAUXITE_PER_PLANE, battleReward, canAfford, pay, resources, sortieCost } from './ResourceSystem';
import { completeRepairs, hpFraction, isDocked, setDamage, SUNK_HP_FRACTION } from './DockSystem';

/** Ties battles to the home base (pure): paying for a sortie and settling the outcome. */

export interface IShipOutcome {
  shipId: string;
  /** HP fraction left (ignored when sunk) */
  hpFraction: number;
  sunk: boolean;
}

export interface IBattleOutcome {
  victory: boolean;
  enemiesSunk: number;
  ships: IShipOutcome[];
  /** Carrier aircraft shot down */
  planesLost: number;
}

export interface ISettlement {
  progress: IProgress;
  reward: IResources;
  /** Bauxite spent replacing lost aircraft */
  aircraftCost: IResources;
}

/** Why the fleet can't sortie right now (empty = it can). */
export function sortieBlockers(progress: IProgress, ships: IShipData[], now: number): string[] {
  const state = completeRepairs(progress, now);
  const reasons: string[] = [];
  for (const s of ships) {
    if (isDocked(state, s.id)) reasons.push(`${s.name} は入渠中`);
  }
  if (!canAfford(progress.resources, sortieCost(ships))) reasons.push('資源が不足しています');
  return reasons;
}

/** Pays the sortie cost. Returns null if resources are short. */
export function paySortie(progress: IProgress, ships: IShipData[]): IProgress | null {
  const left = pay(progress.resources, sortieCost(ships));
  return left ? { ...progress, resources: left } : null;
}

/** Applies a battle's outcome: rewards, aircraft replacement cost and each ship's damage. */
export function settleBattle(progress: IProgress, outcome: IBattleOutcome): ISettlement {
  const reward = battleReward(outcome.victory, outcome.enemiesSunk);
  const aircraftCost = resources({ bauxite: Math.max(0, outcome.planesLost) * BAUXITE_PER_PLANE });
  let next: IProgress = {
    ...progress,
    resources: addResources(addResources(progress.resources, reward), aircraftCost, -1),
  };
  for (const s of outcome.ships) {
    const f = s.sunk ? SUNK_HP_FRACTION : s.hpFraction;
    next = { ...next, ...setDamage(next, s.shipId, f) };
  }
  return { progress: next, reward, aircraftCost };
}

/** HP fraction a ship starts its next battle with. */
export function startingHp(progress: IProgress, shipId: string): number {
  return Math.max(SUNK_HP_FRACTION, hpFraction(progress, shipId));
}
