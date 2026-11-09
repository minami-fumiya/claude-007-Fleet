/**
 * 画面の外の艦隊 (0.0.72): runs the fleets under orders up to now against the game's own data (the ship registry,
 * the day's residents, the navy's docks), and saves what came of it — the fleets' places, their ships' HP, the
 * residents beaten. Called when the home port or the open sea opens, and every few seconds at sea.
 */
import campaignData from '@/data/campaign.json';
import { baseOfProgress, baseReaches } from '@/systems/BaseSystem';
import { theatersFor } from '@/systems/CampaignSystem';
import { fleetPower } from '@/systems/DifficultyCurve';
import { setDamage } from '@/systems/DockSystem';
import { advanceOrders, IOffscreenFight } from '@/systems/FleetOrders';
import { nearestDock } from '@/systems/AnchorageSystem';
import { WORLD_MAP, baseAnchor, findRoute } from '@/systems/OpenSeaSystem';
import { residentDay, residentsFor } from '@/systems/WorldSim';
import { markResidentWon, spotWon, worldEnemyFleet, worldEnemyScale, emptyWorld } from '@/systems/WorldSystem';
import { ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { IProgress } from '@/utils/ProgressStore';

export interface IShipLookup {
  byId(id: string): IShipData | undefined;
  byNation(nation: string): IShipData[];
}

/** The seas a navy sails: its theaters a base of its reaches. */
export function navyTheaters(progress: IProgress): string[] {
  const reach = baseOfProgress(progress);
  return theatersFor(campaignData as ICampaignData, progress.nation).filter((t) => baseReaches(reach, t.id)).map((t) => t.id);
}

/** The fleets under orders brought up to `now`; null when none is under way. */
export function runFleetOrders(progress: IProgress, ships: IShipLookup, now: number): { progress: IProgress; fights: IOffscreenFight[] } | null {
  if (!progress.openSea.anchors.some((a) => a.order)) return null;
  const data = campaignData as ICampaignData;
  const theaters = navyTheaters(progress);
  const residents = residentsFor(progress.nation, theaters, residentDay(now));
  const hp: Record<string, number> = {};
  for (const a of progress.openSea.anchors) for (const id of a.shipIds) hp[id] = progress.damage[id] ?? 1;
  const world = progress.world ?? emptyWorld();
  const result = advanceOrders(progress.openSea.anchors, hp, now, {
    residents,
    won: (id) => spotWon(world, id),
    power: (ids, health) => fleetPower(ids.map((id) => ships.byId(id)).filter((s): s is IShipData => s !== undefined).map((s) => ({ hp: s.hp * (health[s.id] ?? 1), armor: s.armor }))),
    enemyPower: (r) => {
      const opponent = data.theaters.find((t) => t.id === r.theater)?.opponents?.[progress.nation] ?? Nation.USN;
      return fleetPower(worldEnemyFleet(ships.byNation(opponent), { id: r.id, danger: r.danger })) * worldEnemyScale(r.danger);
    },
    homeFrom: (s) => {
      const base = nearestDock(progress, s);
      const at = base ? baseAnchor(base.id) : undefined;
      const sector = base ? WORLD_MAP.bases[base.id] : undefined;
      const route = sector ? findRoute(s, { c: sector.c, r: sector.r }) : null;
      return at && route ? { route, dest: at } : null;
    },
  });
  let next: IProgress = { ...progress, openSea: { ...progress.openSea, anchors: result.anchors } };
  for (const [id, h] of Object.entries(result.hp)) {
    if (h !== hp[id]) next = { ...next, ...setDamage(next, id, h) };
  }
  let w = next.world ?? emptyWorld();
  for (const f of result.fights) if (f.won) w = markResidentWon(w, f.residentId);
  next = { ...next, world: w };
  return { progress: next, fights: result.fights };
}

/** A line for a fight fought off-screen. */
export function fightNote(f: IOffscreenFight, ships: IShipLookup): string {
  const lead = ships.byId(f.shipIds[0])?.name.replace(/\s*\(.*\)\s*$/, '') ?? '艦隊';
  const worst = Math.max(...Object.values(f.hurt), 0);
  return `${lead}の艦隊が敵と交戦: ${f.won ? '撃退' : '振り切った'} (最大 ${Math.round(worst * 100)}% の損傷)${f.turnedHome ? '・帰投の基準に達したので入渠できる基地へ' : ''}`;
}
