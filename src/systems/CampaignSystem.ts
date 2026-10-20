import { ICampaignArea, ICampaignData, ITheater } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { BattleMode } from '@/types/Battle';
import { ShipRegistry } from './ShipRegistry';
import type { IScenarioSide } from '@/types/Scenario';

/** Campaign progress (pure): which areas are open, recording clears and building the enemy fleet. */

/** Open when every `requires` area is cleared and, where routes merge (#40), one of `requiresAny`. */
export function isUnlocked(area: ICampaignArea, cleared: string[]): boolean {
  const any = area.requiresAny ?? [];
  return area.requires.every((r) => cleared.includes(r)) && (any.length === 0 || any.some((r) => cleared.includes(r)));
}

/** Areas that lead into `area` (both kinds of prerequisite). */
export function prerequisitesOf(area: ICampaignArea): string[] {
  return [...area.requires, ...(area.requiresAny ?? [])];
}

/** The first area of a theater (no prerequisites) is sortied to for free (#28), so a new nation can't get stuck. */
export function isFreeArea(area: ICampaignArea): boolean {
  return prerequisitesOf(area).length === 0;
}

export function isCleared(area: ICampaignArea, cleared: string[]): boolean {
  return cleared.includes(area.id);
}

export function areasOf(data: ICampaignData, theater: string): ICampaignArea[] {
  return data.areas.filter((a) => a.theater === theater);
}

/**
 * A theater's final area: its last listed one, training areas aside (#241). Nation unlocks, promotion exams and the
 * theater's progress all count from this, so a training area listed last never stands in for the real final.
 */
export function theaterFinalArea(data: { areas: ReadonlyArray<{ id: string; theater: string; training?: boolean }> }, theater: string): string | undefined {
  return data.areas.filter((a) => a.theater === theater && !a.training).pop()?.id;
}

/** What an area's first S rank brings (#247): one thing only — its reward-only ship, else a captain. */
export type FirstSReward = { kind: 'ship'; ship: IShipData } | { kind: 'captain' } | null;

/**
 * The one reward of an area's S rank (#247). A training area brings none. An area with a reward-only ship the nation
 * does not own yet brings that ship (on any S until it is won, #160); otherwise the area's first S brings a captain
 * while someone is left to join.
 */
export function firstSReward(
  area: Pick<ICampaignArea, 'id' | 'training'>,
  input: { rewardShip?: IShipData; perfect: string[]; captainsLeft: number },
): FirstSReward {
  if (area.training) return null;
  if (input.rewardShip) return { kind: 'ship', ship: input.rewardShip };
  if (input.perfect.includes(area.id) || input.captainsLeft <= 0) return null;
  return { kind: 'captain' };
}

/** Records a victory. `firstClear` is true when the area had not been cleared before (reward due). */
export function recordClear(cleared: string[], areaId: string): { cleared: string[]; firstClear: boolean } {
  if (cleared.includes(areaId)) return { cleared, firstClear: false };
  return { cleared: [...cleared, areaId], firstClear: true };
}

/** Theaters the given nation can play, in data order. */
export function theatersFor(data: ICampaignData, player: Nation): ITheater[] {
  return data.theaters.filter((t) => t.opponents[player] !== undefined);
}

/** The nation the player fights in this area: the theater's opponent for them, else the area's own. */
export function enemyNationFor(data: ICampaignData, area: ICampaignArea, player?: Nation): Nation {
  const theater = data.theaters.find((t) => t.id === area.theater);
  return (player && theater?.opponents[player]) ?? area.enemy.nation;
}

/**
 * The area's enemy ships (unknown ids are skipped). When the player fights a different nation here than the one the
 * area was written for, each ship is swapped for that nation's closest historical ship of the same class (by HP),
 * using each replacement once while possible. A class the nation lacks (no carrier) falls back to a battleship.
 */
export function enemyShips(area: ICampaignArea, registry: ShipRegistry, nation: Nation = area.enemy.nation): IShipData[] {
  const written = area.enemy.ships.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
  if (nation === area.enemy.nation) return uniqueShips(written, registry.byNation(nation).filter((s) => !s.fictional));
  const roster = registry.byNation(nation).filter((s) => !s.fictional);
  if (roster.length === 0) return written;
  const used = new Set<string>();
  const fallback = [ShipClass.Battleship, ShipClass.Cruiser, ShipClass.Destroyer];
  const out: IShipData[] = [];
  for (const orig of written) {
    // The closest unused ship of the same class, else of a fallback class, else any unused ship; none left → the
    // slot stays empty (#76).
    for (const cls of [orig.shipClass, ...fallback, null]) {
      const fresh = roster.filter((s) => (cls === null || s.shipClass === cls) && !used.has(s.id));
      if (fresh.length === 0) continue;
      const pick = fresh.reduce((best, s) => (Math.abs(s.hp - orig.hp) < Math.abs(best.hp - orig.hp) ? s : best));
      used.add(pick.id);
      out.push(pick);
      break;
    }
  }
  return out;
}

/**
 * The same fleet with repeated ships (area data lists e.g. two Fletchers) swapped for an unused ship of the same class
 * closest in HP; a repeat with no replacement is dropped. No battle has the same ship twice (#76).
 */
export function uniqueShips(ships: IShipData[], roster: IShipData[]): IShipData[] {
  const used = new Set(ships.map((s) => s.id));
  const seen = new Set<string>();
  const out: IShipData[] = [];
  for (const ship of ships) {
    if (!seen.has(ship.id)) {
      seen.add(ship.id);
      out.push(ship);
      continue;
    }
    const pool = roster.filter((s) => s.shipClass === ship.shipClass && !used.has(s.id));
    if (pool.length === 0) continue;
    const swap = pool.reduce((best, s) => (Math.abs(s.hp - ship.hp) < Math.abs(best.hp - ship.hp) ? s : best));
    used.add(swap.id);
    seen.add(swap.id);
    out.push(swap);
  }
  return out;
}

/** A fleet of nothing but submarines is fought as an ASW battle (for AI and visuals). */
export function areaMode(ships: IShipData[]): BattleMode {
  if (ships.length > 0 && ships.every((s) => s.shipClass === ShipClass.Submarine)) return BattleMode.ASW;
  if (ships.some((s) => s.shipClass === ShipClass.Carrier)) return BattleMode.CarrierStrike;
  return BattleMode.Surface;
}

/** 訓練海域 pay this share of rewards, experience and merit (#202). */
export const TRAINING_SCALE = 0.5;

/** Share of a theater cleared, 0..1 (訓練海域 don't count, #202). */
export function theaterProgress(data: ICampaignData, theater: string, cleared: string[]): number {
  const areas = areasOf(data, theater).filter((a) => !a.training);
  return areas.length === 0 ? 0 : areas.filter((a) => cleared.includes(a.id)).length / areas.length;
}

/** A campaign area's objective set up like a scenario side (#40), so the battle reads both the same way. */
export function campaignSide(area: ICampaignArea | undefined): (IScenarioSide & { targetLead?: boolean; arrivalSec?: number }) | null {
  if (!area?.side) return null;
  const { targetLead, zone, timeLimitSec, enemyGoesForZone, arrivalSec } = area.side;
  return { force: 'A', label: area.name, brief: area.description, objective: area.objective, targetLead, zone, timeLimitSec, enemyGoesForZone, arrivalSec };
}
