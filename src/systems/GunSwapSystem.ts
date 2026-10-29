import weaponsData from '@/data/weapons/weapons.json';
import { IShipData } from '@/types/Ship';
import { IResources } from '@/types/Progression';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { canAfford, pay } from './ResourceSystem';

/**
 * 型の載せ替え (#368, pure): a ship's main battery can be swapped for another of its navy's guns of about the same
 * size — 41cm 連装 for 46cm, 20.3cm for 20cm — within a sixth of its firepower either way, and back. Each swap costs
 * resources by the gun's size; what is fitted shows in the battle and the 改装 screen.
 */
export const SWAP_RANGE = 1 / 6;

const WEAPONS = (weaponsData as { weapons: IWeaponData[] }).weapons;

function weapon(id: string): IWeaponData | undefined {
  return WEAPONS.find((w) => w.id === id);
}

/** The ship's main guns that can be swapped: its armour-piercing guns. */
export function swappableGuns(ship: Pick<IShipData, 'weapons'>): IWeaponData[] {
  return ship.weapons.map(weapon).filter((w): w is IWeaponData => w?.type === WeaponType.ShellAP && w.id !== 'shore_battery');
}

/** Guns that can take the place of `gunId` on this ship: the navy's own of the same kind and about its size. */
export function swapOptions(ship: Pick<IShipData, 'weapons' | 'nation' | 'shipClass'>, gunId: string, roster: readonly IShipData[]): IWeaponData[] {
  const gun = weapon(gunId);
  if (!gun || gun.type !== WeaponType.ShellAP) return [];
  const navy = new Set(roster.filter((s) => s.nation === ship.nation && s.shipClass === ship.shipClass && !s.designed && !s.foreign).flatMap((s) => s.weapons));
  const lo = gun.firePower * (1 - SWAP_RANGE);
  const hi = gun.firePower * (1 + SWAP_RANGE);
  return WEAPONS.filter((w) => w.id !== gunId && w.type === WeaponType.ShellAP && navy.has(w.id) && w.id !== 'shore_battery' && w.firePower >= lo && w.firePower <= hi && !ship.weapons.includes(w.id))
    .sort((a, b) => a.firePower - b.firePower);
}

/** The ship's weapons with its swaps fitted. */
export function swappedWeapons(weapons: readonly string[], swaps: Readonly<Record<string, string>> | undefined): string[] {
  return weapons.map((id) => swaps?.[id] ?? id);
}

/** The ship as fitted: its swaps in place of its own guns. */
export function withSwaps<T extends Pick<IShipData, 'weapons'>>(ship: T, swaps: Readonly<Record<string, string>> | undefined): T {
  return swaps && Object.keys(swaps).length > 0 ? { ...ship, weapons: swappedWeapons(ship.weapons, swaps) } : ship;
}

/** A swap's price: ammunition and steel by the new gun's firepower. */
export function swapCost(gunId: string): IResources {
  const fp = weapon(gunId)?.firePower ?? 60;
  return { fuel: 0, ammo: Math.round(fp * 6 / 10) * 10, steel: Math.round(fp * 10 / 10) * 10, bauxite: 0 };
}

export interface ISwapHolder {
  resources: IResources;
  gunSwaps: Record<string, Record<string, string>>;
}

/**
 * Fits `to` in place of the ship's own gun `from` (or puts `from` back when `to` is `from`); pays for a new gun, not
 * for going back. Null when the gun can't go there or can't be paid for.
 */
export function swapGun<T extends ISwapHolder>(holder: T, ship: IShipData, from: string, to: string, roster: readonly IShipData[]): T | null {
  if (!ship.weapons.includes(from)) return null;
  const swaps = { ...(holder.gunSwaps[ship.id] ?? {}) };
  if (to === from) {
    if (!swaps[from]) return null;
    delete swaps[from];
    return { ...holder, gunSwaps: { ...holder.gunSwaps, [ship.id]: swaps } };
  }
  if (!swapOptions(ship, from, roster).some((w) => w.id === to)) return null;
  if (!canAfford(holder.resources, swapCost(to))) return null;
  swaps[from] = to;
  return { ...holder, resources: pay(holder.resources, swapCost(to))!, gunSwaps: { ...holder.gunSwaps, [ship.id]: swaps } };
}
