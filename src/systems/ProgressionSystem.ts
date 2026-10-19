import { IShipData } from '@/types/Ship';
import { IResources } from '@/types/Progression';
import type { IProgress } from '@/utils/ProgressStore';
import { ICampaignArea } from '@/types/Campaign';
import { addResources, BAUXITE_PER_PLANE, battleReward, canAfford, pay, resources, sortieCost } from './ResourceSystem';
import { completeRepairs, hpFraction, isDocked, setDamage, SUNK_HP_FRACTION } from './DockSystem';
import { isFreeArea } from './CampaignSystem';
import { applyEventReward, IEventEffects, NO_EVENT } from './EventSystem';
import { addMerit, IRank, meritFor } from './RankSystem';
import { gameDay, withQuestEvents } from './QuestSystem';
import { ShipClass } from '@/types/ShipClass';

/**
 * Ties battles to the home base (pure): paying for a sortie and settling the outcome.
 * 演習 (exercise = free battle, #15): free, no damage kept, docked ships allowed, full HP, half the resource reward.
 * Proficiency, captain XP and the service record still count (handled by the battle scene).
 */

/** Resource reward multiplier for an exercise. */
export const EXERCISE_REWARD_SCALE = 0.5;

export interface ISortieOptions {
  /** Free battle (演習) */
  exercise?: boolean;
  /** Campaign area being sortied to (the first area of a theater is free, #28) */
  area?: ICampaignArea | null;
}

/** A battle is an exercise when it is neither a campaign area nor a historical scenario. */
export function isExercise(data: { areaId?: string; scenario?: unknown } | null | undefined): boolean {
  return !data?.areaId && !data?.scenario;
}

/** True when this sortie costs nothing. */
export function isFreeSortie(opts: ISortieOptions = {}): boolean {
  return opts.exercise === true || (opts.area ? isFreeArea(opts.area) : false);
}

/** What the sortie costs with these options. */
export function sortieCostFor(ships: IShipData[], opts: ISortieOptions = {}): IResources {
  return isFreeSortie(opts) ? resources() : sortieCost(ships);
}

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
  /** Classes of the enemies sunk (steel by class, #132) */
  sunkClasses?: ShipClass[];
}

export interface ISettlement {
  progress: IProgress;
  reward: IResources;
  /** Bauxite spent replacing lost aircraft */
  aircraftCost: IResources;
}

/** Why the fleet can't sortie right now (empty = it can). */
export function sortieBlockers(progress: IProgress, ships: IShipData[], now: number, opts: ISortieOptions = {}): string[] {
  const state = completeRepairs(progress, now);
  const reasons: string[] = [];
  // Exercises use docked ships too: they fight at full HP and keep no damage.
  if (!opts.exercise) {
    for (const s of ships) {
      if (isDocked(state, s.id)) reasons.push(`${s.name} は入渠中`);
    }
  }
  if (!canAfford(progress.resources, sortieCostFor(ships, opts))) reasons.push('資源が不足しています');
  return reasons;
}

/** Pays the sortie cost. Returns null if resources are short. */
export function paySortie(progress: IProgress, ships: IShipData[], opts: ISortieOptions = {}): IProgress | null {
  const left = pay(progress.resources, sortieCostFor(ships, opts));
  return left ? { ...progress, resources: left } : null;
}

/**
 * Applies a battle's outcome: rewards, aircraft replacement cost and each ship's damage.
 * An exercise pays half the reward and keeps neither damage nor aircraft losses.
 */
export function settleBattle(progress: IProgress, outcome: IBattleOutcome, opts: { exercise?: boolean; event?: IEventEffects; theater?: string } = {}): ISettlement {
  // A running event (#89) raises the reward: 2x in its theater, more steel.
  const full = applyEventReward(battleReward(outcome.victory, outcome.enemiesSunk, outcome.sunkClasses), opts.event ?? NO_EVENT, opts.theater);
  const reward = opts.exercise ? addResources(resources(), full, EXERCISE_REWARD_SCALE) : full;
  const aircraftCost = opts.exercise ? resources() : resources({ bauxite: Math.max(0, outcome.planesLost) * BAUXITE_PER_PLANE });
  let next: IProgress = {
    ...progress,
    resources: addResources(addResources(progress.resources, reward), aircraftCost, -1),
  };
  if (opts.exercise) return { progress: next, reward, aircraftCost };
  for (const s of outcome.ships) {
    const f = s.sunk ? SUNK_HP_FRACTION : s.hpFraction;
    next = { ...next, ...setDamage(next, s.shipId, f) };
  }
  return { progress: next, reward, aircraftCost };
}

/** HP fraction a ship starts its next battle with (exercises always start at full HP). */
export function startingHp(progress: IProgress, shipId: string, exercise = false): number {
  if (exercise) return 1;
  return Math.max(SUNK_HP_FRACTION, hpFraction(progress, shipId));
}

/** A sweep pays this share of a won battle's resource reward (#57). */
export const SWEEP_REWARD_SCALE = 0.8;

/** Sweeps per area per game day (#57): unlimited instant rewards made battles pointless. Resets at 05:00 JST. */
export const SWEEPS_PER_DAY = 3;

/** Sweeps of `area` left today. */
export function sweepsLeft(progress: Pick<IProgress, 'sweeps'>, areaId: string, now: number): number {
  const s = progress.sweeps;
  const used = s.day === gameDay(now) ? s.counts[areaId] ?? 0 : 0;
  return Math.max(0, SWEEPS_PER_DAY - used);
}

/** True when `area` may be swept: cleared, and once won without losing a ship (#57). */
export function canSweep(progress: Pick<IProgress, 'campaign' | 'perfect'>, area: ICampaignArea): boolean {
  return progress.campaign.includes(area.id) && progress.perfect.includes(area.id);
}

/** What a sweep costs: a sortie by a fleet the size of the enemy's (nothing in a theater's free first area). */
export function sweepCost(area: ICampaignArea, enemy: IShipData[]): IResources {
  return isFreeArea(area) ? resources() : sortieCost(enemy);
}

export interface ISweepResult {
  progress: IProgress;
  reward: IResources;
  cost: IResources;
  merit: number;
  promotedTo: IRank | null;
}

/**
 * 掃討 (#57): skips the battle of an area already won without losses. Costs a sortie, pays 80% of a won battle's
 * reward (events apply), counts as a win for merit and 任務. No damage, no proficiency, never a first clear.
 */
export function sweepArea(progress: IProgress, area: ICampaignArea, enemy: IShipData[], now: number, event: IEventEffects = NO_EVENT): ISweepResult | null {
  if (!canSweep(progress, area) || sweepsLeft(progress, area.id, now) <= 0) return null;
  const cost = sweepCost(area, enemy);
  const paid = pay(progress.resources, cost);
  if (!paid) return null;
  const won = applyEventReward(battleReward(true, enemy.length, enemy.map((s) => s.shipClass)), event, area.theater);
  const reward = addResources(resources(), won, SWEEP_REWARD_SCALE);
  const merit = meritFor({ victory: true, campaign: true, firstClear: false, enemiesSunk: enemy.length });
  const promoted = addMerit({ ...progress, resources: addResources(paid, reward) }, merit);
  const of = (c: ShipClass): number => enemy.filter((s) => s.shipClass === c).length;
  const day = gameDay(now);
  const counts = progress.sweeps.day === day ? progress.sweeps.counts : {};
  const counted = { ...promoted.progress, sweeps: { day, counts: { ...counts, [area.id]: (counts[area.id] ?? 0) + 1 } } };
  const next = withQuestEvents(counted, [
    ['sortie', 1], ['win', 1], ['sink', enemy.length], ['sweep', 1],
    ['sinkCarrier', of(ShipClass.Carrier)], ['sinkSubmarine', of(ShipClass.Submarine)], ['sinkBattleship', of(ShipClass.Battleship)],
  ], now);
  return { progress: next, reward, cost, merit, promotedTo: promoted.promotedTo };
}
