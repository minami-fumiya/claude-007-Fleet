import { IShipData, ShipSubtype, SUBTYPE_JA } from '@/types/Ship';
import { IShipModifiers } from '@/types/Modifiers';
import { ShipClass } from '@/types/ShipClass';

/**
 * Ship kinds for lists and badges (#37, pure). The data already splits cruisers (and battleships, carriers) into
 * subtypes; these helpers show that split everywhere and let lists filter and sort by it.
 */

export const SUBTYPE_SHORT: Record<ShipSubtype, string> = {
  [ShipSubtype.BattleCruiser]: '巡戦',
  [ShipSubtype.AviationBattleship]: '航戦',
  [ShipSubtype.FastBattleship]: '高速戦艦',
  [ShipSubtype.HeavyCruiser]: '重巡',
  [ShipSubtype.LightCruiser]: '軽巡',
  [ShipSubtype.AACruiser]: '防空巡',
  [ShipSubtype.LeaderDestroyer]: '嚮導駆逐',
  [ShipSubtype.AADestroyer]: '防空駆逐',
  [ShipSubtype.EscortDestroyer]: '護衛駆逐',
  [ShipSubtype.LightCarrier]: '軽空母',
  [ShipSubtype.EscortCarrier]: '護衛空母',
  [ShipSubtype.ArmoredCarrier]: '装甲空母',
  [ShipSubtype.Escort]: '海防艦',
  [ShipSubtype.LargeSubmarine]: '大型潜',
  [ShipSubtype.SubmarineCarrier]: '潜水空母',
};

// ---------------------------------------------------------------------------
// The three levels (#260): 大分類 ShipClass → 中分類 MidClass → 小分類 the class of ships (ShipOrder.classKey)
// ---------------------------------------------------------------------------

/** 中分類: a subtype, or a class's plain kind for a ship without one. */
export type MidClass = ShipSubtype | 'Battleship' | 'Destroyer' | 'FleetCarrier' | 'Submarine';

/** Every 中分類 under its 大分類, in list order. */
export const MID_CLASSES: Record<ShipClass, MidClass[]> = {
  [ShipClass.Battleship]: ['Battleship', ShipSubtype.FastBattleship, ShipSubtype.BattleCruiser, ShipSubtype.AviationBattleship],
  [ShipClass.Cruiser]: [ShipSubtype.HeavyCruiser, ShipSubtype.LightCruiser, ShipSubtype.AACruiser],
  [ShipClass.Destroyer]: ['Destroyer', ShipSubtype.LeaderDestroyer, ShipSubtype.AADestroyer, ShipSubtype.EscortDestroyer, ShipSubtype.Escort],
  [ShipClass.Carrier]: ['FleetCarrier', ShipSubtype.ArmoredCarrier, ShipSubtype.LightCarrier, ShipSubtype.EscortCarrier],
  [ShipClass.Submarine]: ['Submarine', ShipSubtype.LargeSubmarine, ShipSubtype.SubmarineCarrier],
};

export const ALL_MID_CLASSES: MidClass[] = Object.values(MID_CLASSES).flat();

const PLAIN_MID: Record<ShipClass, MidClass> = {
  [ShipClass.Battleship]: 'Battleship',
  // A cruiser without a subtype (the convoy freighter's data) counts as light.
  [ShipClass.Cruiser]: ShipSubtype.LightCruiser,
  [ShipClass.Destroyer]: 'Destroyer',
  [ShipClass.Carrier]: 'FleetCarrier',
  [ShipClass.Submarine]: 'Submarine',
};

/** The ship's 中分類 (#260): every ship has one. */
export function midClass(ship: Pick<IShipData, 'shipClass' | 'subtype'>): MidClass {
  return ship.subtype ?? PLAIN_MID[ship.shipClass];
}

/** The 大分類 a 中分類 belongs to. */
export function midParent(mid: MidClass): ShipClass {
  return (Object.keys(MID_CLASSES) as ShipClass[]).find((c) => MID_CLASSES[c].includes(mid))!;
}

const PLAIN_JA: Record<string, { ja: string; short: string }> = {
  Battleship: { ja: '戦艦', short: '戦艦' },
  Destroyer: { ja: '駆逐艦', short: '駆逐' },
  FleetCarrier: { ja: '正規空母', short: '正規空母' },
  Submarine: { ja: '潜水艦', short: '潜水' },
};

/** "高速戦艦", "正規空母" … */
export function midLabel(mid: MidClass): string {
  return PLAIN_JA[mid]?.ja ?? SUBTYPE_JA[mid as ShipSubtype];
}

/** The short form for chips: "高速戦艦", "防空巡" … */
export function midShort(mid: MidClass): string {
  return PLAIN_JA[mid]?.short ?? SUBTYPE_SHORT[mid as ShipSubtype];
}

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
  /** お気に入り (#419): the ships marked ★ */
  Favorite = 'Favorite',
}

export const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: KindFilter.All, label: '全て' },
  { id: KindFilter.Battleship, label: '戦艦' },
  { id: KindFilter.Carrier, label: '空母' },
  { id: KindFilter.HeavyCruiser, label: '重巡' },
  { id: KindFilter.LightCruiser, label: '軽巡' },
  { id: KindFilter.Destroyer, label: '駆逐' },
  { id: KindFilter.Submarine, label: '潜水' },
  { id: KindFilter.Favorite, label: '★' },
];

export function matchesKind(ship: Pick<IShipData, 'shipClass' | 'subtype'>, filter: KindFilter): boolean {
  switch (filter) {
    case KindFilter.All: return true;
    // Which ships are favourites is the caller's (filterAndSort's `favorites`).
    case KindFilter.Favorite: return true;
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
  /** Highest morale first (#357): the tired ones come last */
  Morale = 'Morale',
}

export const SORT_LABEL: Record<ShipSort, string> = {
  [ShipSort.Default]: '標準',
  [ShipSort.Hp]: '耐久順',
  [ShipSort.Speed]: '速力順',
  [ShipSort.Morale]: '士気順',
};

/** Filtered and sorted copy; favourites (#419) come first under every sort; ties keep roster order. */
export function filterAndSort<T extends Pick<IShipData, 'id' | 'shipClass' | 'subtype' | 'hp' | 'speed'>>(ships: T[], filter: KindFilter, sort: ShipSort, morale: (id: string) => number = () => 0, favorites: readonly string[] = []): T[] {
  const fav = new Set(favorites);
  const list = ships.map((s, i) => ({ s, i })).filter(({ s }) => matchesKind(s, filter) && (filter !== KindFilter.Favorite || fav.has(s.id)));
  const key = (s: T): number => (sort === ShipSort.Hp ? s.hp : sort === ShipSort.Speed ? s.speed : sort === ShipSort.Morale ? morale(s.id) : 0);
  const star = (s: T): number => (fav.has(s.id) ? 1 : 0);
  return list.sort((a, b) => star(b.s) - star(a.s) || key(b.s) - key(a.s) || a.i - b.i).map(({ s }) => s);
}

/** Display order of kinds in an enemy lineup: capital ships first (#68). */
function kindRank(ship: Pick<IShipData, 'shipClass' | 'subtype'>): number {
  if (ship.shipClass === ShipClass.Battleship) return 0;
  if (ship.shipClass === ShipClass.Carrier) return 1;
  if (isHeavyCruiser(ship)) return 2;
  if (ship.shipClass === ShipClass.Cruiser) return 3;
  if (ship.shipClass === ShipClass.Destroyer) return 4;
  return 5;
}

/** Ships grouped by kind label (戦艦 / 重巡 / 駆逐艦 …), capital kinds first, names in fleet order. */
export function kindGroups<T extends Pick<IShipData, 'shipClass' | 'subtype' | 'name'>>(ships: T[]): Array<{ kind: string; names: string[] }> {
  const groups: Array<{ kind: string; rank: number; names: string[] }> = [];
  for (const s of ships) {
    const kind = kindShort(s);
    const g = groups.find((x) => x.kind === kind);
    if (g) g.names.push(s.name);
    else groups.push({ kind, rank: kindRank(s), names: [s.name] });
  }
  return groups.sort((a, b) => a.rank - b.rank).map(({ kind, names }) => ({ kind, names }));
}

/** "戦艦 1・重巡 2・駆逐艦 3" — how many of each kind (#68). */
export function kindBreakdown(ships: Array<Pick<IShipData, 'shipClass' | 'subtype' | 'name'>>): string {
  return kindGroups(ships).map((g) => `${g.kind} ${g.names.length}`).join('・');
}

/** True when the fleet has a battleship, carrier or heavy cruiser (a hard fight for a small fleet). */
export function hasCapitalShips(ships: Array<Pick<IShipData, 'shipClass' | 'subtype'>>): boolean {
  return ships.some((s) => kindRank(s) <= 2);
}

/**
 * What a 中分類 is good at (#260): 海防艦 hunt submarines and guard convoys (sonar and depth charges 1.75×, AA 1.2×),
 * 護衛駆逐艦 lean the same way, the 防空 kinds shoot down planes (AA 1.5×). Applied to the ship's own modifiers.
 */
export const MID_MODIFIERS: Partial<Record<MidClass, Partial<IShipModifiers>>> = {
  [ShipSubtype.Escort]: { sonarMul: 1.75, depthChargeMul: 1.75, aaMul: 1.2 },
  [ShipSubtype.EscortDestroyer]: { sonarMul: 1.3, depthChargeMul: 1.3 },
  [ShipSubtype.AACruiser]: { aaMul: 1.5 },
  [ShipSubtype.AADestroyer]: { aaMul: 1.5 },
};

export function midModifiers(ship: Pick<IShipData, 'shipClass' | 'subtype'>): Partial<IShipModifiers> {
  return MID_MODIFIERS[midClass(ship)] ?? {};
}

/** 海防艦 (#260) cost 6 tenths of a destroyer to build and run, and build in half the time. */
export const ESCORT_COST_MUL = 0.6;
export const ESCORT_TIME_MUL = 0.5;
