import { ICampaignArea, ICampaignData, ITheater } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { BattleMode } from '@/types/Battle';
import { ShipRegistry } from './ShipRegistry';

/** Campaign progress (pure): which areas are open, recording clears and building the enemy fleet. */

export function isUnlocked(area: ICampaignArea, cleared: string[]): boolean {
  return area.requires.every((r) => cleared.includes(r));
}

/** The first area of a theater (no prerequisites) is sortied to for free (#28), so a new nation can't get stuck. */
export function isFreeArea(area: ICampaignArea): boolean {
  return area.requires.length === 0;
}

export function isCleared(area: ICampaignArea, cleared: string[]): boolean {
  return cleared.includes(area.id);
}

export function areasOf(data: ICampaignData, theater: string): ICampaignArea[] {
  return data.areas.filter((a) => a.theater === theater);
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

/** Share of a theater cleared, 0..1. */
export function theaterProgress(data: ICampaignData, theater: string, cleared: string[]): number {
  const areas = areasOf(data, theater);
  return areas.length === 0 ? 0 : areas.filter((a) => cleared.includes(a.id)).length / areas.length;
}
