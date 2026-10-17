import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { BattleMode } from '@/types/Battle';
import { ShipRegistry } from './ShipRegistry';

/** Campaign progress (pure): which areas are open, recording clears and building the enemy fleet. */

export function isUnlocked(area: ICampaignArea, cleared: string[]): boolean {
  return area.requires.every((r) => cleared.includes(r));
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

/** The area's enemy ships (unknown ids are skipped). */
export function enemyShips(area: ICampaignArea, registry: ShipRegistry): IShipData[] {
  return area.enemy.ships.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
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
