import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { CaptainSkill } from '@/types/Captain';
import { AircraftType } from '@/types/Aircraft';
import { WeaponType } from '@/types/Weapon';

/**
 * 通し番号 (#249, pure): every ship, captain, aircraft, ground target, weapon and item has a number of its own, seven
 * digits made of four parts — category (1), nation (1), type (2), serial (3). "1101003" is 艦 · 日本 · 戦艦 · 3rd.
 * The serial counts up inside its category, nation and type, oldest first when the data was numbered; anything added
 * later takes the next free serial, and a number once given never changes (scripts/gen-numbers.ts). Saves keep
 * using the string ids, so numbers can be added or reordered without touching a save. docs/specs/numbering.md has
 * the tables.
 */

export enum NoCategory {
  Ship = 1,
  Captain = 2,
  Aircraft = 3,
  Ground = 4,
  Weapon = 5,
  Item = 6,
  Other = 9,
}

/** 0 for anything shared by every navy; gaps left for navies to come. */
export const NATION_CODE: Record<Nation, number> = {
  [Nation.IJN]: 1,
  [Nation.USN]: 2,
  [Nation.KM]: 3,
  [Nation.RN]: 4,
  [Nation.RM]: 5,
  [Nation.SU]: 6,
  [Nation.FR]: 7,
};
export const COMMON_NATION = 0;

/** Ship types: the kind shown in the lists (subtype first, else the class). 90 is the superweapons (#148). */
export const SHIP_TYPE_CODE = {
  Battleship: 1,
  [ShipSubtype.BattleCruiser]: 2,
  [ShipSubtype.AviationBattleship]: 3,
  [ShipSubtype.HeavyCruiser]: 4,
  [ShipSubtype.LightCruiser]: 5,
  Cruiser: 6,
  Destroyer: 7,
  [ShipSubtype.Escort]: 8,
  Carrier: 9,
  [ShipSubtype.LightCarrier]: 10,
  [ShipSubtype.EscortCarrier]: 11,
  Submarine: 12,
  Superweapon: 90,
} as const;

export const CAPTAIN_TYPE_CODE: Record<CaptainSkill, number> = {
  [CaptainSkill.Gunnery]: 1,
  [CaptainSkill.Torpedo]: 2,
  [CaptainSkill.Engineering]: 3,
  [CaptainSkill.Aviation]: 4,
  [CaptainSkill.AntiAir]: 5,
  [CaptainSkill.ASW]: 6,
  [CaptainSkill.Night]: 7,
  [CaptainSkill.Recon]: 8,
  [CaptainSkill.Damecon]: 9,
};

export const AIRCRAFT_TYPE_CODE: Record<AircraftType, number> = {
  [AircraftType.Fighter]: 1,
  [AircraftType.DiveBomber]: 2,
  [AircraftType.TorpedoBomber]: 3,
  [AircraftType.Recon]: 4,
};

/** Ground targets (#83): 01 transports, 02 coastal guns, 03 harbours, 04 airfields; more kinds to come (#251). */
export const GROUND_TYPE_CODE: Record<string, number> = {
  convoy_ship: 1,
  land_battery: 2,
  land_harbor: 3,
  land_airfield: 4,
};

export const WEAPON_TYPE_CODE: Record<WeaponType, number> = {
  [WeaponType.ShellAP]: 1,
  [WeaponType.ShellHE]: 2,
  [WeaponType.Torpedo]: 3,
  [WeaponType.DepthCharge]: 4,
  [WeaponType.Bomb]: 5,
  [WeaponType.AntiAir]: 6,
};

export const ITEM_TYPE_CODE = 1;

/**
 * The 中分類 added in 0.0.42 (#260) number with the kind they were filed under before, so no ship's number changes:
 * the type digits stay the twelve kinds of #249.
 */
const NUMBERED_AS: Partial<Record<ShipSubtype, keyof typeof SHIP_TYPE_CODE>> = {
  [ShipSubtype.FastBattleship]: 'Battleship',
  [ShipSubtype.AACruiser]: ShipSubtype.LightCruiser,
  [ShipSubtype.LeaderDestroyer]: 'Destroyer',
  [ShipSubtype.AADestroyer]: 'Destroyer',
  [ShipSubtype.EscortDestroyer]: 'Destroyer',
  [ShipSubtype.ArmoredCarrier]: 'Carrier',
  [ShipSubtype.LargeSubmarine]: 'Submarine',
  [ShipSubtype.SubmarineCarrier]: 'Submarine',
};

/** The type code of a ship. */
export function shipTypeCode(ship: Pick<IShipData, 'shipClass' | 'subtype'>): number {
  if (ship.subtype) return SHIP_TYPE_CODE[NUMBERED_AS[ship.subtype] ?? (ship.subtype as keyof typeof SHIP_TYPE_CODE)];
  const byClass: Record<ShipClass, number> = {
    [ShipClass.Battleship]: SHIP_TYPE_CODE.Battleship,
    [ShipClass.Cruiser]: SHIP_TYPE_CODE.Cruiser,
    [ShipClass.Destroyer]: SHIP_TYPE_CODE.Destroyer,
    [ShipClass.Carrier]: SHIP_TYPE_CODE.Carrier,
    [ShipClass.Submarine]: SHIP_TYPE_CODE.Submarine,
  };
  return byClass[ship.shipClass];
}

export interface INoParts {
  category: number;
  nation: number;
  type: number;
  serial: number;
}

/** The number made of its parts: 1 · 1 · 01 · 003 → 1101003. */
export function composeNo(p: INoParts): number {
  return p.category * 1_000_000 + p.nation * 100_000 + p.type * 1_000 + p.serial;
}

/** A number split back into its parts. */
export function parseNo(no: number): INoParts {
  return {
    category: Math.floor(no / 1_000_000),
    nation: Math.floor(no / 100_000) % 10,
    type: Math.floor(no / 1_000) % 100,
    serial: no % 1_000,
  };
}

/** The first six digits (category, nation, type): what a number must start with for what it numbers. */
export function noPrefix(p: Omit<INoParts, 'serial'>): number {
  return composeNo({ ...p, serial: 0 });
}

/** "No.1101003" */
export function formatNo(no: number | undefined): string {
  return no === undefined ? '' : `No.${String(no).padStart(7, '0')}`;
}

/** The next free number under `prefix`, given the numbers already used. */
export function nextNo(prefix: number, used: ReadonlySet<number>): number {
  for (let serial = 1; serial < 1_000; serial++) {
    const no = prefix + serial;
    if (!used.has(no)) return no;
  }
  throw new Error(`no free serial under ${prefix}`);
}
