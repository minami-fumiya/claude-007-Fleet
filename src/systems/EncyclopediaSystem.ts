import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';

export const CLASS_JA: Record<ShipClass, string> = {
  [ShipClass.Battleship]: '戦艦',
  [ShipClass.Cruiser]: '巡洋艦',
  [ShipClass.Destroyer]: '駆逐艦',
  [ShipClass.Carrier]: '空母',
  [ShipClass.Submarine]: '潜水艦',
};

/** Display order of ship classes in the encyclopedia. */
export const CLASS_ORDER: ShipClass[] = [
  ShipClass.Battleship,
  ShipClass.Cruiser,
  ShipClass.Destroyer,
  ShipClass.Carrier,
  ShipClass.Submarine,
];

/** Ships of one nation, optionally of one class, sorted by class order (stable within a class). */
export function filterEntries(ships: IShipData[], shipClass: ShipClass | null): IShipData[] {
  return ships
    .filter((s) => shipClass === null || s.shipClass === shipClass)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => CLASS_ORDER.indexOf(a.s.shipClass) - CLASS_ORDER.indexOf(b.s.shipClass) || a.i - b.i)
    .map(({ s }) => s);
}

/** Collapses a loadout into weapon ids with mount counts, in first-seen order. */
export function summarizeWeapons(ids: string[]): Array<{ id: string; count: number }> {
  const out: Array<{ id: string; count: number }> = [];
  for (const id of ids) {
    const hit = out.find((e) => e.id === id);
    if (hit) hit.count++;
    else out.push({ id, count: 1 });
  }
  return out;
}
