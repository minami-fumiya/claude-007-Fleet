import { IShipData } from '@/types/Ship';
import { IResources } from '@/types/Progression';
import type { IProgress } from '@/utils/ProgressStore';
import { buildCost, isRewardOnly, ownedIds } from './ShipyardSystem';
import { gainResources, resources, RESOURCE_KEYS } from './ResourceSystem';
import { REFIT_TABLE, stagesFor } from './RefitSystem';
import { holdCap } from './FacilitySystem';
import { sailingIds } from './FleetGroups';
import { shipsAway } from './ExpeditionSystem';
import { inDorm } from './DormSystem';
import { unfitAll } from './EquipmentSystem';
import { withQuestEvents } from './QuestSystem';

/**
 * 解体 (#42, pure): a ship no longer used goes back to the yard for part of what it cost — mostly steel — and a
 * share of its remodels. Its fitted equipment returns to the stock (#55); its crew's proficiency, morale and place
 * in the saved fleets go with it. The flagship, the last ship, reward-only ships and ships that are busy (docked,
 * at sea, on an expedition, in the dorm) can't be scrapped.
 */

/** Share of the build cost returned, by resource (steel the most). */
export const SCRAP_SHARE: IResources = { fuel: 0.25, ammo: 0.25, steel: 0.4, bauxite: 0.3 };
/** Share of each remodel stage's cost returned. */
export const SCRAP_REFIT_SHARE = 0.3;

export type ScrapBlock = 'flagship' | 'last' | 'reward' | 'docked' | 'sailing' | 'expedition' | 'dorm' | 'unowned';

export const SCRAP_BLOCK_LABEL: Record<ScrapBlock, string> = {
  flagship: '旗艦は解体できません',
  last: '最後の 1 隻は解体できません',
  reward: '報酬限定艦は解体できません',
  docked: '入渠中の艦は解体できません',
  sailing: '出撃中の艦は解体できません',
  expedition: '遠征中の艦は解体できません',
  dorm: '寮舎にいる艦は解体できません',
  unowned: '保有していない艦です',
};

/** What scrapping returns: a share of the build cost and of every remodel stage reached (rounded to tens). */
export function scrapRefund(ship: IShipData, refitStage = 0, branch?: string): IResources {
  const build = buildCost(ship);
  const out = resources();
  for (const key of RESOURCE_KEYS) out[key] = build[key] * SCRAP_SHARE[key];
  stagesFor(REFIT_TABLE, ship, branch).slice(0, Math.max(0, refitStage)).forEach((stage) => {
    for (const key of RESOURCE_KEYS) out[key] += (stage.cost[key] ?? 0) * SCRAP_REFIT_SHARE;
  });
  for (const key of RESOURCE_KEYS) out[key] = Math.round(out[key] / 10) * 10;
  return out;
}

/** Why the ship can't be scrapped now, or undefined when it can. `flagshipId` is the first ship of the fleet set up. */
export function scrapBlock(progress: IProgress, roster: IShipData[], ship: IShipData, flagshipId?: string): ScrapBlock | undefined {
  const owned = ownedIds(progress, roster);
  if (!owned.includes(ship.id)) return 'unowned';
  if (isRewardOnly(ship)) return 'reward';
  if (owned.length <= 1) return 'last';
  if (flagshipId === ship.id) return 'flagship';
  if (progress.docks.some((d) => d.shipId === ship.id)) return 'docked';
  if (sailingIds(progress.sortie).includes(ship.id)) return 'sailing';
  if (shipsAway(progress.expeditions).has(ship.id)) return 'expedition';
  if (inDorm(progress.dorm, 'ship', ship.id)) return 'dorm';
  return undefined;
}

/** Scraps the ship; null when it can't be. The refund is capped by the stores (#221) like any other income. */
export function scrapShip(progress: IProgress, roster: IShipData[], ship: IShipData, now: number, flagshipId?: string): { progress: IProgress; refund: IResources } | null {
  if (scrapBlock(progress, roster, ship, flagshipId)) return null;
  const id = ship.id;
  const refund = scrapRefund(ship, progress.refits[id] ?? 0, progress.refitBranches[id]);
  const gain = gainResources(progress.resources, refund, holdCap(progress.facilities));
  const drop = <V>(rec: Record<string, V>): Record<string, V> => {
    const out = { ...rec };
    delete out[id];
    return out;
  };
  let next: IProgress = unfitAll({ ...progress }, id);
  next = {
    ...next,
    resources: gain.resources,
    ships: ownedIds(progress, roster).filter((s) => s !== id),
    damage: drop(next.damage), refits: drop(next.refits), refitBranches: drop(next.refitBranches), proficiency: drop(next.proficiency),
    morale: drop(next.morale), moraleAt: drop(next.moraleAt), shipBases: drop(next.shipBases),
    // Saved fleets keep their other ships; the scrapped one's place (and its captain) empties.
    presets: next.presets.map((p) => (p ? { ...p, slotIds: p.slotIds.map((s) => (s === id ? null : s)), captainIds: p.captainIds.map((c, i) => (p.slotIds[i] === id ? null : c)) } : p)),
    expeditionGroups: Object.fromEntries(Object.entries(next.expeditionGroups).map(([k, ids]) => [k, ids.filter((s) => s !== id)])),
  };
  // 解体章 counts the ships scrapped.
  return { progress: withQuestEvents(next, [['scrap', 1]], now), refund };
}
