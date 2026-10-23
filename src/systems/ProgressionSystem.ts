import { IShipData } from '@/types/Ship';
import { IResources } from '@/types/Progression';
import type { IProgress } from '@/utils/ProgressStore';
import { ICampaignArea } from '@/types/Campaign';
import { addResources, BAUXITE_PER_PLANE, battleReward, canAfford, gainResources, pay, RESOURCE_KEYS, RESOURCE_LABEL, resources, shortfall, sortieCost } from './ResourceSystem';
import { holdCap } from './FacilitySystem';
import { completeRepairs, hpFraction, isDocked, setDamage, SUNK_HP_FRACTION } from './DockSystem';
import { isFreeArea } from './CampaignSystem';
import { applyEventReward, IEventEffects, NO_EVENT } from './EventSystem';
import { addMerit, addRankStats, IRank, meritFor, rankOf } from './RankSystem';
import { withQuestEvents } from './QuestSystem';
import { costCap, costOverText, fleetCost } from './FleetCost';
import { shipsAway } from './ExpeditionSystem';
import { inDorm } from './DormSystem';
import { addGold, emptyWallet, GOLD_SWEEP } from './GoldSystem';
import { newSweepCharge, sweepCharges, useSweepCharge } from './SweepSystem';

export { nextSweepMs, SWEEP_MAX, SWEEP_RECHARGE_MS, sweepCharges } from './SweepSystem';
import { sailingIds } from './FleetGroups';
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
  /** The fleets the ships sail in (#84): each keeps under the cost cap on its own (default: all one fleet) */
  fleets?: IShipData[][];
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
  /** Reward that did not fit under the holding cap (#221) */
  lost: IResources;
}

/** Why the fleet can't sortie right now (empty = it can). */
export function sortieBlockers(progress: IProgress, ships: IShipData[], now: number, opts: ISortieOptions = {}): string[] {
  const state = completeRepairs(progress, now);
  const reasons: string[] = [];
  // Ships out on an unfinished campaign sortie (#138) stay with it until it is continued or withdrawn.
  const away = sailingIds(progress.sortie);
  for (const s of ships) if (away.includes(s.id)) reasons.push(`${s.name} は出撃中 (作戦地図で続けるか撤退)`);
  // Ships out on an expedition (#41) or training in the dorm (#57) stay where they are.
  const expedition = shipsAway(progress.expeditions);
  for (const s of ships) if (expedition.has(s.id)) reasons.push(`${s.name} は遠征中`);
  for (const s of ships) if (inDorm(progress.dorm, 'ship', s.id)) reasons.push(`${s.name} は寮舎で訓練中`);
  // Exercises use docked ships too: they fight at full HP and keep no damage.
  if (!opts.exercise) {
    for (const s of ships) {
      if (isDocked(state, s.id)) reasons.push(`${s.name} は入渠中`);
    }
  }
  // The rank caps the fleet's sortie cost (#306).
  const cap = costCap(rankOf(progress).index);
  (opts.fleets ?? [ships]).forEach((fleet, i, all) => {
    const over = costOverText(fleetCost(fleet, progress.refits ?? {}), cap);
    if (over) reasons.push(all.length > 1 ? `第${i + 1}艦隊の${over}` : over);
  });
  // What is short and by how much (#303): "資源が不足: 燃料 120 / 180 (60 不足)".
  const cost = sortieCostFor(ships, opts);
  if (!canAfford(progress.resources, cost)) {
    const lack = shortfall(progress.resources, cost);
    const have = resources(progress.resources);
    const parts = RESOURCE_KEYS.filter((k) => lack[k] > 0).map((k) => `${RESOURCE_LABEL[k]} ${have[k]} / ${cost[k]} (${lack[k]} 不足)`);
    reasons.push(`資源が不足: ${parts.join('・')}`);
  }
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
export function settleBattle(progress: IProgress, outcome: IBattleOutcome, opts: { exercise?: boolean; event?: IEventEffects; theater?: string; rankMul?: number } = {}): ISettlement {
  // A running event (#89) raises the reward: 2x in its theater, more steel. The battle rank (#149) scales it too.
  const earned = battleReward(outcome.victory, outcome.enemiesSunk, outcome.sunkClasses);
  const ranked = opts.rankMul !== undefined && opts.rankMul !== 1 ? addResources(resources(), earned, opts.rankMul) : earned;
  const full = applyEventReward(ranked, opts.event ?? NO_EVENT, opts.theater);
  const reward = opts.exercise ? addResources(resources(), full, EXERCISE_REWARD_SCALE) : full;
  const aircraftCost = opts.exercise ? resources() : resources({ bauxite: Math.max(0, outcome.planesLost) * BAUXITE_PER_PLANE });
  // The reward net of replacement aircraft fills up to the holding cap (#221).
  const gain = gainResources(progress.resources, addResources(reward, aircraftCost, -1, true), holdCap(progress.facilities));
  let next: IProgress = { ...progress, resources: gain.resources };
  if (opts.exercise) return { progress: next, reward, aircraftCost, lost: gain.lost };
  for (const s of outcome.ships) {
    const f = s.sunk ? SUNK_HP_FRACTION : s.hpFraction;
    next = { ...next, ...setDamage(next, s.shipId, f) };
  }
  return { progress: next, reward, aircraftCost, lost: gain.lost };
}

/** HP fraction a ship starts its next battle with (exercises always start at full HP). */
export function startingHp(progress: IProgress, shipId: string, exercise = false): number {
  if (exercise) return 1;
  return Math.max(SUNK_HP_FRACTION, hpFraction(progress, shipId));
}

/** A sweep pays this share of a won battle's resource reward (#57). */
export const SWEEP_REWARD_SCALE = 0.8;

/** Sweeps of `area` left now (#181). */
export function sweepsLeft(progress: Pick<IProgress, 'sweepCharges'>, areaId: string, now: number): number {
  return sweepCharges(progress.sweepCharges[areaId], now);
}

/** Opens `areaId` for sweeping on its first S (#181): starts at 0. An area already open keeps its charges. */
export function openSweeps(progress: IProgress, areaId: string, now: number): IProgress {
  if (progress.sweepCharges[areaId]) return progress;
  return { ...progress, sweepCharges: { ...progress.sweepCharges, [areaId]: newSweepCharge(now) } };
}

/** True when `area` may be swept: cleared, and once won with an S rank (#57 / #149; perfect wins from before count). */
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
  /** Reward that did not fit under the holding cap (#221) */
  lost: IResources;
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
  // A sweep counts toward the 大将 promotion mission (#142), and may complete it.
  const before = rankOf(progress);
  const gain = gainResources(paid, reward, holdCap(progress.facilities));
  const merited = addMerit(addRankStats({ ...progress, resources: gain.resources }, { sweep: 1 }), merit).progress;
  const after = rankOf(merited);
  const promoted = { progress: merited, promotedTo: after.index > before.index ? after : null };
  const of = (c: ShipClass): number => enemy.filter((s) => s.shipClass === c).length;
  const counted = { ...promoted.progress, wallet: addGold(promoted.progress.wallet ?? emptyWallet(), GOLD_SWEEP), sweepCharges: { ...progress.sweepCharges, [area.id]: useSweepCharge(progress.sweepCharges[area.id], now) } };
  const next = withQuestEvents(counted, [
    ['sortie', 1], ['win', 1], ['sink', enemy.length], ['sweep', 1],
    ['sinkDestroyer', of(ShipClass.Destroyer)], ['sinkCruiser', of(ShipClass.Cruiser)],
    ['sinkCarrier', of(ShipClass.Carrier)], ['sinkSubmarine', of(ShipClass.Submarine)], ['sinkBattleship', of(ShipClass.Battleship)],
  ], now);
  return { progress: next, reward, cost, merit, promotedTo: promoted.promotedTo, lost: gain.lost };
}
