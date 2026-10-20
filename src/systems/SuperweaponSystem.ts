import data from '@/data/superweapons.json';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { CriticalType } from '@/types/ShipDamage';

/**
 * 超兵器 (#148, pure): one giant per navy. During the 超兵器出現 event (#89) it joins the enemy's main fleet in the
 * event's theater. Its parts give way as it is worn down: the turrets at three quarters of its HP, the engines at
 * half, the bridge at a quarter, each weakening it for the rest of the battle.
 */

export interface ISuperweapon extends IShipData {
  /** Drawn this much larger than the ship whose sprite it borrows */
  scale: number;
}

export const SUPERWEAPONS = (data as unknown as { superweapons: ISuperweapon[] }).superweapons;

export function superweaponOf(nation: Nation): ISuperweapon | undefined {
  return SUPERWEAPONS.find((s) => s.nation === nation);
}

export type SuperweaponPart = 'turret' | 'engine' | 'bridge';

/** HP fraction at or below which each part breaks. */
export const PART_BREAK_AT: Record<SuperweaponPart, number> = { turret: 0.75, engine: 0.5, bridge: 0.25 };
export const PART_LABEL: Record<SuperweaponPart, string> = { turret: '主砲塔破壊', engine: '機関破壊', bridge: '艦橋破壊' };
/** The component damage each broken part counts as (the bridge throws its aim off instead) */
export const PART_CRITICAL: Partial<Record<SuperweaponPart, CriticalType>> = { turret: CriticalType.MainGun, engine: CriticalType.Engine };
/** A broken bridge's aim error multiplier */
export const BRIDGE_AIM_MUL = 1.6;

/** Parts broken at `hpFraction`. */
export function brokenParts(hpFraction: number): SuperweaponPart[] {
  return (Object.keys(PART_BREAK_AT) as SuperweaponPart[]).filter((p) => hpFraction <= PART_BREAK_AT[p]);
}

/** Parts that broke between two HP fractions (the hit that took it from `before` to `after`). */
export function newlyBroken(before: number, after: number): SuperweaponPart[] {
  const was = brokenParts(before);
  return brokenParts(after).filter((p) => !was.includes(p));
}

/** Gold for sinking a superweapon (#148), on top of the battle's */
export const SUPERWEAPON_GOLD = 500;
