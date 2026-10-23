import economyData from '@/data/economy.json';
import questData from '@/data/quests.json';
import techTree from '@/data/tech-tree.json';
import ijn from '@/data/ships/ijn.json';
import { IResources } from '@/types/Progression';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { buildCost } from './ShipyardSystem';
import { repairCost } from './DockSystem';
import { facilityCost, regenRules } from './FacilitySystem';
import { REFIT_TABLE } from './RefitSystem';
import { addResources, BAUXITE_PER_PLANE, battleReward, REGEN_INTERVAL_MS, RESOURCE_KEYS, resources, sortieCost } from './ResourceSystem';
import { SWEEP_REWARD_SCALE } from './ProgressionSystem';
import { EXPEDITIONS } from './ExpeditionSystem';
import { QUESTS_SHOWN } from './QuestSystem';
import { scaleCost } from './ResourceSystem';
import { GOLD_FOR_RANK, GOLD_SWEEP, SELL, SHOP_ENTRIES } from './GoldSystem';
import type { BattleRank } from './BattleRank';

/**
 * Economy model (#222, pure): a typical hour of play at each stage, from `economy.json`, run through the game's own
 * reward and cost functions. Used by the balance tests (#223) and docs/balance, not by the game.
 */

export interface IEconomyPhase {
  id: string;
  label: string;
  /** Ship ids (IJN) of the fleet sent out */
  fleet: string[];
  /** Classes of the enemies sunk in one battle */
  enemies: string[];
  battlesPerHour: number;
  /** HP fraction each ship loses per battle, on average */
  damagePerBattle: number;
  planesLostPerBattle: number;
  /** Research nodes finished per hour, and their typical level */
  researchPerHour: number;
  researchLevel: number;
  /** Minutes of the hour spent below the regeneration cap */
  regenMinutes: number;
  /** Level of each resource facility (all four), summed over the bases */
  facilityLevels: number;
  sweepsPerHour: number;
  /** Refits per hour, at the first stage of this class */
  refitsPerHour: number;
  refitClass: string;
  /** Facility levels raised per hour, at this level */
  facilitiesPerHour: number;
  facilityLevel: number;
  /** The ship a player of this stage builds */
  build: string;
  /** The carrier a player of this stage builds (#321), its bauxite checked apart */
  carrier?: string;
  /** What the open bases take off building (#281 #321): 1 = no discount */
  baseBuildMul?: number;
  /** 遠征 kept running through the hour (#41), one per slot */
  expeditions?: string[];
}

interface IEconomyData {
  /** Share of the hour an expedition is out (the player sends it again when it is back, not at once) */
  expeditionUptime?: number;
  playHoursPerDay: number;
  playHoursPerWeek: number;
  rankRewardMul: number;
  /** Share of each board's quests finished (#180) */
  questCompletion: Record<'hourly' | 'daily' | 'weekly', number>;
  /** Share of battles won; a defeat pays half per sink and no victory bonus */
  winRate: number;
  /** Share of the won battles at each rank (#320: from the battle simulator), for the gold */
  rankShare: Partial<Record<BattleRank, number>>;
  phases: IEconomyPhase[];
}

export const ECONOMY = economyData as IEconomyData;
const SHIPS = ijn.ships as IShipData[];
const ship = (id: string): IShipData => {
  const s = SHIPS.find((x) => x.id === id);
  if (!s) throw new Error(`economy.json: unknown ship ${id}`);
  return s;
};
/** A typical enemy of each class, for sweep costs. */
const typical = (c: ShipClass): IShipData => SHIPS.find((s) => s.shipClass === c && !s.fictional && !s.subtype) ?? SHIPS[0];

export interface IHourBudget {
  income: Record<string, IResources>;
  spending: Record<string, IResources>;
  totalIn: IResources;
  totalOut: IResources;
  /** Income minus spending, before building anything */
  net: IResources;
  /** What building the phase's ship costs (with the bases' discount) */
  buildCost: IResources;
  /** What building the phase's carrier costs, when it has one */
  carrierCost?: IResources;
  /** Gold of the hour: battles by rank, sweeps and quests (#321) */
  gold: number;
}

/** Average reward of the quests of one kind on a board (the board shows QUESTS_SHOWN of them). */
function questShare(kind: 'hourly' | 'daily' | 'weekly', data: IEconomyData = ECONOMY): IResources {
  const pool = (questData.quests as Array<{ kind: string; reward?: Partial<IResources> }>).filter((q) => q.kind === kind);
  const sum = pool.reduce((s, q) => addResources(s, q.reward ?? {}), resources());
  return addResources(resources(), sum, pool.length > 0 ? (QUESTS_SHOWN[kind] / pool.length) * data.questCompletion[kind] : 0);
}

function researchCost(level: number): IResources {
  const nodes = (techTree.tech as Array<{ level?: number; cost: Partial<IResources> }>).filter((n) => n.level === level);
  const sum = nodes.reduce((s, n) => addResources(s, n.cost), resources());
  return addResources(resources(), sum, nodes.length > 0 ? 1 / nodes.length : 0);
}

/** Resources an hour of the phase's 遠征 bring (#41): each reward × runs per hour × uptime. */
function expeditionIncome(phase: IEconomyPhase, data: IEconomyData): IResources {
  return (phase.expeditions ?? []).reduce((acc, id) => {
    const e = EXPEDITIONS.find((x) => x.id === id);
    return e ? addResources(acc, e.reward, (60 / e.minutes) * (data.expeditionUptime ?? 1)) : acc;
  }, resources());
}

function sum(parts: Record<string, IResources>): IResources {
  return Object.values(parts).reduce((s, r) => addResources(s, r), resources());
}

/** One hour of the phase: what comes in and goes out, by source. */
export function hourBudget(phase: IEconomyPhase, data: IEconomyData = ECONOMY): IHourBudget {
  const fleet = phase.fleet.map(ship);
  const enemies = phase.enemies.map((c) => c as ShipClass);
  const won = addResources(resources(), battleReward(true, enemies.length, enemies), data.rankRewardMul * data.winRate);
  // A lost battle still sinks about half as many.
  const half = enemies.slice(0, Math.floor(enemies.length / 2));
  const win = addResources(won, battleReward(false, half.length, half), 1 - data.winRate);
  const lv = phase.facilityLevels;
  const regen = regenRules({ model: { fuelTank: lv, ammoDepot: lv, steelMill: lv, airBase: lv } }).perTick;
  const ticks = (phase.regenMinutes * 60_000) / REGEN_INTERVAL_MS;
  const income: Record<string, IResources> = {
    battle: addResources(resources(), win, phase.battlesPerHour),
    sweep: addResources(resources(), battleReward(true, enemies.length, enemies), SWEEP_REWARD_SCALE * phase.sweepsPerHour),
    regen: addResources(resources(), regen, ticks),
    quest: addResources(addResources(questShare('hourly', data), questShare('daily', data), 1 / data.playHoursPerDay), questShare('weekly', data), 1 / data.playHoursPerWeek),
    expedition: expeditionIncome(phase, data),
  };
  const repairs = fleet.reduce((s, x) => addResources(s, repairCost(x.hp, 1 - phase.damagePerBattle)), resources());
  const spending: Record<string, IResources> = {
    sortie: addResources(resources(), sortieCost(fleet), phase.battlesPerHour),
    sweep: addResources(resources(), sortieCost(enemies.map(typical)), phase.sweepsPerHour),
    repair: addResources(resources(), repairs, phase.battlesPerHour),
    aircraft: resources({ bauxite: phase.planesLostPerBattle * BAUXITE_PER_PLANE * phase.battlesPerHour }),
    research: addResources(resources(), researchCost(phase.researchLevel), phase.researchPerHour),
    refit: addResources(resources(), REFIT_TABLE.classes[phase.refitClass as ShipClass]?.[0]?.cost ?? {}, phase.refitsPerHour),
    facility: addResources(resources(), facilityCost('steelMill', phase.facilityLevel), phase.facilitiesPerHour),
  };
  const totalIn = sum(income);
  const totalOut = sum(spending);
  const net = resources();
  for (const k of RESOURCE_KEYS) net[k] = totalIn[k] - totalOut[k];
  const mul = phase.baseBuildMul ?? 1;
  return {
    income, spending, totalIn, totalOut, net,
    buildCost: scaleCost(buildCost(ship(phase.build)), mul),
    ...(phase.carrier ? { carrierCost: scaleCost(buildCost(ship(phase.carrier)), mul) } : {}),
    gold: hourGold(phase, data),
  };
}

/** Gold of an hour (#321): won battles by rank, sweeps and the quests finished. */
export function hourGold(phase: IEconomyPhase, data: IEconomyData = ECONOMY): number {
  const perWin = (Object.entries(data.rankShare) as Array<[BattleRank, number]>).reduce((s, [r, share]) => s + GOLD_FOR_RANK[r] * share, 0);
  const quest = (kind: 'hourly' | 'daily' | 'weekly'): number => {
    const pool = (questData.quests as Array<{ kind: string; gold?: number }>).filter((q) => q.kind === kind);
    const sum = pool.reduce((s, q) => s + (q.gold ?? 0), 0);
    return pool.length > 0 ? (sum * QUESTS_SHOWN[kind] / pool.length) * data.questCompletion[kind] : 0;
  };
  const quests = quest('hourly') + quest('daily') / data.playHoursPerDay + quest('weekly') / data.playHoursPerWeek;
  return Math.round(phase.battlesPerHour * data.winRate * perWin + phase.sweepsPerHour * GOLD_SWEEP + quests);
}

/** Builds of the phase's carrier one hour's surplus bauxite pays for (#321); Infinity without a carrier. */
export function bauxiteCarriersPerHour(b: IHourBudget): number {
  return b.carrierCost && b.carrierCost.bauxite > 0 ? b.net.bauxite / b.carrierCost.bauxite : Infinity;
}

/**
 * Fuel the shop turns 1,000 surplus steel into (#321): sold at the steel rate, the gold buys the large fuel pack
 * (its daily limit aside).
 */
export function steelToFuel(): number {
  const pack = SHOP_ENTRIES.find((e) => e.id === 'fuel_l');
  const fuelPerGold = pack?.give?.fuel && pack.price ? pack.give.fuel / pack.price : 0;
  return Math.round(SELL.rates.steel * fuelPerGold * (1000 / SELL.amount));
}

/** Builds of the phase's ship one hour's surplus steel pays for. */
export function steelBuildsPerHour(b: IHourBudget): number {
  return b.buildCost.steel > 0 ? b.net.steel / b.buildCost.steel : Infinity;
}
