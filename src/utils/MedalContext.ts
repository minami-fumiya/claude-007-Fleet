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
import { levelForXp } from '@/systems/CaptainSystem';
import { rankOf } from '@/systems/RankSystem';
import { awardMedals, IMedalContext, newMedals } from '@/systems/RecordSystem';
import type { ISave } from './ProgressStore';

const CAMPAIGN = campaignData as ICampaignData;
/** Carrier ids of every navy, for the 機動部隊編成章 (#204) */
const CARRIERS = new Set([ijn, usn, km, rn, fr, su, rm].flatMap((d) => (d.ships as IShipData[]).filter((s) => s.shipClass === ShipClass.Carrier).map((s) => s.id)));

/**
 * What the medals (#92) look at beyond the record, over every nation the admiral has played: lifetime quest-event
 * totals are summed, collections (ships, research, captains) count the best nation.
 */
export function medalContext(save: Pick<ISave, 'nations'>): IMedalContext {
  const nations = Object.entries(save.nations).filter(([, np]) => np !== undefined);
  const totals: Record<string, number> = {};
  const theaters = new Set<string>();
  const ctx: Required<Omit<IMedalContext, 'totals' | 'clearedTheaters'>> = {
    areasCleared: 0, areasS: 0, shipsOwned: 0, researchDone: 0, captains: 0, captainLevel: 0, captainSinks: 0, carriersOwned: 0, maxDocks: 0, parallelFacilities: 0, facilityLevels: 0, nationsPlayed: nations.length, rankIndex: 0,
  };
  for (const [nation, np] of nations) {
    if (!np) continue;
    for (const [k, v] of Object.entries(np.quests?.totals ?? {})) totals[k] = (totals[k] ?? 0) + (v ?? 0);
    for (const t of CAMPAIGN.theaters) if (theaterProgress(CAMPAIGN, t.id, np.campaign) >= 1) theaters.add(t.id);
    ctx.areasCleared += np.campaign.length;
    ctx.areasS += Object.values(np.areaRanks ?? {}).filter((r) => r === 'S').length;
    ctx.shipsOwned = Math.max(ctx.shipsOwned, np.ships.length);
    const byBase: Record<string, number> = {};
    for (const j of np.facilityJobs ?? []) byBase[j.base] = (byBase[j.base] ?? 0) + 1;
    ctx.parallelFacilities = Math.max(ctx.parallelFacilities, ...Object.values(byBase), 0);
    for (const n of Object.values(np.baseDocks ?? {})) ctx.maxDocks = Math.max(ctx.maxDocks, n ?? 0);
    ctx.carriersOwned = Math.max(ctx.carriersOwned, np.ships.filter((id) => CARRIERS.has(id)).length);
    ctx.researchDone = Math.max(ctx.researchDone, np.research.length);
    ctx.captains = Math.max(ctx.captains, (np.captains ?? []).length);
    for (const xp of Object.values(np.captainXp ?? {})) ctx.captainLevel = Math.max(ctx.captainLevel, levelForXp(xp));
    for (const st of Object.values(np.captainStats ?? {})) ctx.captainSinks = Math.max(ctx.captainSinks, st?.sinks ?? 0);
    for (const levels of Object.values(np.facilities ?? {})) for (const lv of Object.values(levels ?? {})) ctx.facilityLevels += lv ?? 0;
    ctx.rankIndex = Math.max(ctx.rankIndex, rankOf({ ...np, nation }).index);
  }
  return { ...ctx, totals, clearedTheaters: [...theaters] };
}

/** The save with every medal it has now earned (#92), and those new ones. */
export function awardEarnedMedals<T extends Pick<ISave, 'nations' | 'record'>>(save: T): { save: T; medals: IMedal[] } {
  const medals = newMedals(save.record, medalContext(save));
  return medals.length === 0 ? { save, medals } : { save: { ...save, record: awardMedals(save.record, medals) }, medals };
}
