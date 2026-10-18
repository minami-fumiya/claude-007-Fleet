import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';

/**
 * Ship kinds for lists and badges (#37, pure). The data already splits cruisers (and battleships, carriers) into
 * subtypes; these helpers show that split everywhere and let lists filter and sort by it.
 */

export const SUBTYPE_SHORT: Record<ShipSubtype, string> = {
  [ShipSubtype.BattleCruiser]: '巡戦',
  [ShipSubtype.AviationBattleship]: '航戦',
  [ShipSubtype.HeavyCruiser]: '重巡',
  [ShipSubtype.LightCruiser]: '軽巡',
  [ShipSubtype.LightCarrier]: '軽空母',
  [ShipSubtype.EscortCarrier]: '護衛空母',
  [ShipSubtype.Escort]: '海防艦',
};

export const CLASS_SHORT: Record<ShipClass, string> = {
  [ShipClass.Battleship]: '戦艦',
  [ShipClass.Cruiser]: '巡洋艦',
  [ShipClass.Destroyer]: '駆逐艦',
  [ShipClass.Carrier]: '空母',
  [ShipClass.Submarine]: '潜水艦',
};

/** Short kind for a badge: 重巡 / 軽巡 / 巡戦 …, else the class. */
export function kindShort(ship: Pick<IShipData, 'shipClass' | 'subtype'>): string {
  return ship.subtype ? SUBTYPE_SHORT[ship.subtype] : CLASS_SHORT[ship.shipClass];
}

export function isHeavyCruiser(ship: Pick<IShipData, 'shipClass' | 'subtype'>): boolean {
  return ship.shipClass === ShipClass.Cruiser && ship.subtype === ShipSubtype.HeavyCruiser;
}

/** A cruiser that is not a heavy cruiser counts as light (the convoy freighter's data has no subtype). */
export function isLightCruiser(ship: Pick<IShipData, 'shipClass' | 'subtype'>): boolean {
  return ship.shipClass === ShipClass.Cruiser && !isHeavyCruiser(ship);
}

export enum KindFilter {
  All = 'All',
  Battleship = 'Battleship',
  Carrier = 'Carrier',
  HeavyCruiser = 'HeavyCruiser',
  LightCruiser = 'LightCruiser',
  Destroyer = 'Destroyer',
  Submarine = 'Submarine',
}

export const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: KindFilter.All, label: '全て' },
  { id: KindFilter.Battleship, label: '戦艦' },
  { id: KindFilter.Carrier, label: '空母' },
  { id: KindFilter.HeavyCruiser, label: '重巡' },
  { id: KindFilter.LightCruiser, label: '軽巡' },
  { id: KindFilter.Destroyer, label: '駆逐' },
  { id: KindFilter.Submarine, label: '潜水' },
];

export function matchesKind(ship: Pick<IShipData, 'shipClass' | 'subtype'>, filter: KindFilter): boolean {
  switch (filter) {
    case KindFilter.All: return true;
    case KindFilter.HeavyCruiser: return isHeavyCruiser(ship);
    case KindFilter.LightCruiser: return isLightCruiser(ship);
    case KindFilter.Battleship: return ship.shipClass === ShipClass.Battleship;
    case KindFilter.Carrier: return ship.shipClass === ShipClass.Carrier;
    case KindFilter.Destroyer: return ship.shipClass === ShipClass.Destroyer;
    case KindFilter.Submarine: return ship.shipClass === ShipClass.Submarine;
  }
}

export enum ShipSort {
  /** Roster order */
  Default = 'Default',
  Hp = 'Hp',
  Speed = 'Speed',
}

export const SORT_LABEL: Record<ShipSort, string> = {
  [ShipSort.Default]: '標準',
  [ShipSort.Hp]: '耐久順',
  [ShipSort.Speed]: '速力順',
};

/** Filtered and sorted copy; ties keep roster order. */
export function filterAndSort<T extends Pick<IShipData, 'shipClass' | 'subtype' | 'hp' | 'speed'>>(ships: T[], filter: KindFilter, sort: ShipSort): T[] {
  const list = ships.map((s, i) => ({ s, i })).filter(({ s }) => matchesKind(s, filter));
  const key = (s: T): number => (sort === ShipSort.Hp ? s.hp : sort === ShipSort.Speed ? s.speed : 0);
  return list.sort((a, b) => key(b.s) - key(a.s) || a.i - b.i).map(({ s }) => s);
}
