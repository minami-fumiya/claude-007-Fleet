import campaignData from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { ICampaignData } from '@/types/Campaign';
import { IMedal } from '@/types/Record';
import { theaterProgress } from '@/systems/CampaignSystem';
import { shipClasses } from '@/systems/ShipOrder';
import { shipTypeCode } from '@/systems/Numbering';
import { midClass } from '@/systems/ShipKind';
import { TECH_LEVELS, TECH_TREE } from '@/systems/ResearchSystem';
import { levelForXp } from '@/systems/CaptainSystem';
import { rankOf } from '@/systems/RankSystem';
import { theaterStep } from '@/systems/DifficultyCurve';
import { holdCap } from '@/systems/FacilitySystem';
import { dockTotal, openBaseCount } from '@/systems/BaseSystem';
import { atHoldCap } from '@/systems/ResourceSystem';
import { awardMedals, IMedalContext, newMedals } from '@/systems/RecordSystem';
import type { ISave } from './ProgressStore';
import { IWallet } from '@/types/Progression';
import { addGold, GOLD_PER_MEDAL } from '@/systems/GoldSystem';

const CAMPAIGN = campaignData as ICampaignData;
/** Carrier ids of every navy, for the 機動部隊編成章 (#204) */
/** Each class of two or more ships (#85, real sisters too since #246), per nation: every ship id of the class. */
const CLASSES: Record<string, string[][]> = {};
/** Ship id → its 通し番号 type (#249), for the 艦種章 */
const SHIP_TYPE = new Map<string, number>();
/** Ship id → its 中分類 (#260), for the 艦種分類章 */
const SHIP_MID = new Map<string, string>();
/** Escorts (海防艦・護衛駆逐艦), for the 海防艦隊章 (#260) */
const ESCORTS = new Set<string>();
/** The last level of every research branch (#298), for the 研究の極み章 */
const TOP_RESEARCH = TECH_TREE.filter((n) => n.level === TECH_LEVELS).map((n) => n.id);
for (const d of [ijn, usn, km, rn, fr, su, rm]) {
  const ships = d.ships as IShipData[];
  for (const g of shipClasses(ships).filter((c) => c.ships.length > 1)) (CLASSES[ships[0].nation] ??= []).push(g.ships.map((s) => s.id));
  for (const s of ships) {
    SHIP_TYPE.set(s.id, shipTypeCode(s));
    SHIP_MID.set(s.id, midClass(s));
    if (s.subtype === 'Escort' || s.subtype === 'EscortDestroyer') ESCORTS.add(s.id);
  }
}
const CARRIERS = new Set([ijn, usn, km, rn, fr, su, rm].flatMap((d) => (d.ships as IShipData[]).filter((s) => s.shipClass === ShipClass.Carrier).map((s) => s.id)));

/**
 * What the medals (#92) look at beyond the record, over every nation the admiral has played: lifetime quest-event
 * totals are summed, collections (ships, research, captains) count the best nation.
 */
export function medalContext(save: Pick<ISave, 'nations'> & { wallet?: IWallet }): IMedalContext {
  const nations = Object.entries(save.nations).filter(([, np]) => np !== undefined);
  const totals: Record<string, number> = {};
  const theaters = new Set<string>();
  const ctx: Required<Omit<IMedalContext, 'totals' | 'clearedTheaters' | 'goldEarned'>> = {
    areasCleared: 0, areasS: 0, shipsOwned: 0, researchDone: 0, captains: 0, captainLevel: 0, captainSinks: 0, carriersOwned: 0, maxDocks: 0, fullStock: 0, steelCap: 0, supplyLevel: 0, basesOpen: 0, farthestSea: 0, classesComplete: 0, expeditionKinds: 0, shipTypes: 0, midClasses: 0, escortsOwned: 0, researchTop: 0, parallelFacilities: 0, facilityLevels: 0, nationsPlayed: nations.length, rankIndex: 0,
  };
  for (const [nation, np] of nations) {
    if (!np) continue;
    for (const [k, v] of Object.entries(np.quests?.totals ?? {})) totals[k] = (totals[k] ?? 0) + (v ?? 0);
    for (const t of CAMPAIGN.theaters) {
      if (theaterProgress(CAMPAIGN, t.id, np.campaign) < 1) continue;
      theaters.add(t.id);
      ctx.farthestSea = Math.max(ctx.farthestSea, (theaterStep(nation, t.id) ?? -1) + 1);
    }
    ctx.areasCleared += np.campaign.length;
    ctx.areasS += Object.values(np.areaRanks ?? {}).filter((r) => r === 'S').length;
    ctx.shipsOwned = Math.max(ctx.shipsOwned, np.ships.length);
    const byBase: Record<string, number> = {};
    for (const j of np.facilityJobs ?? []) byBase[j.base] = (byBase[j.base] ?? 0) + 1;
    ctx.parallelFacilities = Math.max(ctx.parallelFacilities, ...Object.values(byBase), 0);
    // The pooled docks of every open base (#281).
    ctx.maxDocks = Math.max(ctx.maxDocks, dockTotal({ ...np, nation, baseDocks: np.baseDocks ?? {} }));
    // Holding cap (#221): the steel cap the mills reached, and whether every resource is full.
    const cap = holdCap(np.facilities ?? {});
    ctx.steelCap = Math.max(ctx.steelCap, cap.steel);
    if (np.resources && atHoldCap(np.resources, cap)) ctx.fullStock = 1;
    // The four resource facilities together (#190): the weakest one counts.
    const supply = (['fuelTank', 'ammoDepot', 'steelMill', 'airBase'] as const).map((id) => Object.values(np.facilities ?? {}).reduce((s, lv) => s + (lv?.[id] ?? 0), 0));
    ctx.supplyLevel = Math.max(ctx.supplyLevel, Math.min(...supply));
    ctx.basesOpen = Math.max(ctx.basesOpen, openBaseCount(nation, { ...np, nation }));
    ctx.classesComplete = Math.max(ctx.classesComplete, (CLASSES[nation] ?? []).filter((ids) => ids.every((id) => np.ships.includes(id))).length);
    // Expeditions sent remember their group (#337), one entry an expedition.
    ctx.expeditionKinds = Math.max(ctx.expeditionKinds, Object.keys(np.expeditionGroups ?? {}).length);
    ctx.shipTypes = Math.max(ctx.shipTypes, new Set(np.ships.map((id) => SHIP_TYPE.get(id)).filter((t) => t !== undefined)).size);
    ctx.midClasses = Math.max(ctx.midClasses, new Set(np.ships.map((id) => SHIP_MID.get(id)).filter((t) => t !== undefined)).size);
    ctx.escortsOwned = Math.max(ctx.escortsOwned, np.ships.filter((id) => ESCORTS.has(id)).length);
    ctx.researchTop = Math.max(ctx.researchTop, TOP_RESEARCH.filter((id) => np.research.includes(id)).length);
    ctx.carriersOwned = Math.max(ctx.carriersOwned, np.ships.filter((id) => CARRIERS.has(id)).length);
    ctx.researchDone = Math.max(ctx.researchDone, np.research.length);
    ctx.captains = Math.max(ctx.captains, (np.captains ?? []).length);
    for (const xp of Object.values(np.captainXp ?? {})) ctx.captainLevel = Math.max(ctx.captainLevel, levelForXp(xp));
    for (const st of Object.values(np.captainStats ?? {})) ctx.captainSinks = Math.max(ctx.captainSinks, st?.sinks ?? 0);
    for (const levels of Object.values(np.facilities ?? {})) for (const lv of Object.values(levels ?? {})) ctx.facilityLevels += lv ?? 0;
    ctx.rankIndex = Math.max(ctx.rankIndex, rankOf({ ...np, nation }).index);
  }
  return { ...ctx, totals, clearedTheaters: [...theaters], goldEarned: save.wallet?.earned ?? 0 };
}

/** The save with every medal it has now earned (#92), and those new ones. */
export function awardEarnedMedals<T extends Pick<ISave, 'nations' | 'record'> & { wallet?: IWallet }>(save: T): { save: T; medals: IMedal[] } {
  const medals = newMedals(save.record, medalContext(save));
  if (medals.length === 0) return { save, medals };
  // Every medal comes with gold (#183).
  const wallet = save.wallet ? { wallet: addGold(save.wallet, GOLD_PER_MEDAL * medals.length) } : {};
  return { save: { ...save, record: awardMedals(save.record, medals), ...wallet }, medals };
}
