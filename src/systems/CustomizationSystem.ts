import { IShipModifiers, IUpgradeData, NO_MODIFIERS } from '@/types/Modifiers';
import { IShipStats } from '@/types/Ship';
import { IWeaponData } from '@/types/Weapon';
import { weaponKind, WeaponKind } from './WeaponSelector';

/** Upgrade slots on every ship. */
export const UPGRADE_SLOTS = 2;

/** Combines modifiers: multipliers multiply, additions add. */
export function combineModifiers(...mods: Array<Partial<IShipModifiers>>): IShipModifiers {
  const out = { ...NO_MODIFIERS };
  for (const m of mods) {
    out.hpMul *= m.hpMul ?? 1;
    out.armorAdd += m.armorAdd ?? 0;
    out.speedMul *= m.speedMul ?? 1;
    out.gunPowerMul *= m.gunPowerMul ?? 1;
    out.gunReloadMul *= m.gunReloadMul ?? 1;
    out.torpedoPowerMul *= m.torpedoPowerMul ?? 1;
    out.visionMul *= m.visionMul ?? 1;
    out.aaMul *= m.aaMul ?? 1;
  }
  return out;
}

/** Modifiers from the upgrades fitted (unknown ids and slots beyond UPGRADE_SLOTS are ignored). */
export function upgradeModifiers(fitted: string[], catalog: IUpgradeData[]): IShipModifiers {
  const effects = fitted
    .slice(0, UPGRADE_SLOTS)
    .map((id) => catalog.find((u) => u.id === id)?.effects)
    .filter((e): e is Partial<IShipModifiers> => e !== undefined);
  return combineModifiers(...effects);
}

/** Fits `upgradeId` (toggles it off if already fitted). Refuses duplicates and a full ship. */
export function toggleUpgrade(fitted: string[], upgradeId: string): string[] {
  if (fitted.includes(upgradeId)) return fitted.filter((id) => id !== upgradeId);
  if (fitted.length >= UPGRADE_SLOTS) return fitted;
  return [...fitted, upgradeId];
}

export function applyToStats(stats: IShipStats, m: IShipModifiers): IShipStats {
  const maxHp = Math.round(stats.maxHp * m.hpMul);
  return {
    ...stats,
    maxHp,
    currentHp: maxHp,
    armor: Math.max(0, stats.armor + m.armorAdd),
    speed: Math.round(stats.speed * m.speedMul),
  };
}

/** Weapon copies with the modifiers applied (ids are kept so reload slots stay distinct). */
export function applyToWeapons(loadout: IWeaponData[], m: IShipModifiers): IWeaponData[] {
  return loadout.map((w) => {
    const kind = weaponKind(w);
    if (kind === WeaponKind.Gun) {
      return { ...w, firePower: w.firePower * m.gunPowerMul, reloadTime: Math.round(w.reloadTime * m.gunReloadMul) };
    }
    if (kind === WeaponKind.Torpedo) return { ...w, firePower: w.firePower * m.torpedoPowerMul };
    return w;
  });
}
