import data from '@/data/superweapons.json';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { CriticalType } from '@/types/ShipDamage';
import { theaterFinalArea } from './CampaignSystem';

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

/** What is left of each part (#148 HUD): 100% at full HP, 0% when it breaks. */
export function partDurability(hpFraction: number): Record<SuperweaponPart, number> {
  const left = (p: SuperweaponPart): number => Math.max(0, Math.min(1, (hpFraction - PART_BREAK_AT[p]) / (1 - PART_BREAK_AT[p])));
  return { turret: left('turret'), engine: left('engine'), bridge: left('bridge') };
}

const PART_SHORT: Record<SuperweaponPart, string> = { turret: '主砲塔', engine: '機関', bridge: '艦橋' };

/** The line over the giant (#148): "主砲塔 40%  機関 70%  艦橋 破壊". */
export function partsLine(hpFraction: number): string {
  const d = partDurability(hpFraction);
  return (Object.keys(PART_SHORT) as SuperweaponPart[]).map((p) => `${PART_SHORT[p]} ${d[p] <= 0 ? '破壊' : `${Math.round(d[p] * 100)}%`}`).join('  ');
}

/** Gold for sinking a superweapon (#148), on top of the battle's */
export const SUPERWEAPON_GOLD = 500;

/** 設計図の断片 (#150): what one enemy superweapon sunk gives, more in its own sea (#148). */
export const BLUEPRINT_PER_GIANT = 1;
export const BLUEPRINT_PER_GIANT_AREA = 2;
/** Fragments that let the nation build its own superweapon. */
export const BLUEPRINT_NEED = 5;
/** The nation's own superweapon is a tamer copy of its giant: this share of the HP, a little less armour. */
export const OWN_SUPERWEAPON_HP = 0.35;
export const OWN_SUPERWEAPON_ARMOR = 6;

/**
 * The nation's own superweapon (#148): built in the shipyard once BLUEPRINT_NEED fragments are in hand. It is a
 * smaller copy of the giant the enemies field — still the strongest hull of its navy.
 */
export function ownSuperweapon(nation: Nation): IShipData | undefined {
  const sw = superweaponOf(nation);
  if (!sw) return undefined;
  const { scale: _scale, ...ship } = sw;
  void _scale;
  return {
    ...ship,
    id: `${sw.id}_own`,
    no: sw.no !== undefined ? sw.no + 1 : undefined,
    // 「超巨大戦艦 紀伊」 → 「紀伊」
    name: sw.name.replace(/^超(巨大|高速)(戦艦|空母)\s*/, '').trim(),
    hp: Math.round(sw.hp * OWN_SUPERWEAPON_HP),
    armor: sw.armor - OWN_SUPERWEAPON_ARMOR,
    airWing: sw.airWing ? { fighters: Math.round(sw.airWing.fighters / 2), diveBombers: Math.round(sw.airWing.diveBombers / 2), torpedoBombers: Math.round(sw.airWing.torpedoBombers / 2) } : undefined,
    blueprint: true,
    description: `${sw.description} 沈めた超兵器の設計図から建造する自国版。`,
  };
}

/** Every navy's own superweapon, for the ship registry. */
export function ownSuperweapons(): IShipData[] {
  return SUPERWEAPONS.map((s) => ownSuperweapon(s.nation)).filter((s): s is IShipData => s !== undefined);
}

/**
 * 超兵器海域 (#148): once a theater's final area is won, it can be fought again against the enemy's superweapon, as
 * often as the player likes — outside any sortie, for blueprint fragments and its parts (#150).
 */
export function superweaponSeaOpen(data: { areas: ReadonlyArray<{ id: string; theater: string; training?: boolean }> }, area: { id: string; theater: string; training?: boolean }, cleared: readonly string[]): boolean {
  return !area.training && theaterFinalArea(data, area.theater) === area.id && cleared.includes(area.id);
}
