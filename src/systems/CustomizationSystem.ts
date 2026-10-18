import { ADDITIVE_MODIFIERS, IShipModifiers, IUpgradeData, NO_MODIFIERS } from '@/types/Modifiers';
import { IShipStats } from '@/types/Ship';
import { IWeaponData } from '@/types/Weapon';
import { IAirWing } from '@/types/Aircraft';
import { weaponKind, WeaponKind } from './WeaponSelector';

/** Upgrade slots on a ship that has not been remodelled. */
export const UPGRADE_SLOTS = 2;
/** Upgrade slots by remodel stage: 2 → 3 (改) → 4 (改二 and later). */
const SLOTS_BY_STAGE = [2, 3, 4];
export const MAX_UPGRADE_SLOTS = SLOTS_BY_STAGE[SLOTS_BY_STAGE.length - 1];

export function upgradeSlots(refitStage: number): number {
  return SLOTS_BY_STAGE[Math.max(0, Math.min(refitStage, SLOTS_BY_STAGE.length - 1))];
}

/** Combines modifiers: multipliers multiply, additions (armor, planes) add. */
export function combineModifiers(...mods: Array<Partial<IShipModifiers>>): IShipModifiers {
  const out: IShipModifiers = { ...NO_MODIFIERS };
  const keys = Object.keys(NO_MODIFIERS) as Array<keyof IShipModifiers>;
  for (const m of mods) {
    for (const key of keys) {
      const v = m[key];
      if (v === undefined) continue;
      out[key] = ADDITIVE_MODIFIERS.includes(key) ? out[key] + v : out[key] * v;
    }
  }
  return out;
}

/** Modifiers from the upgrades fitted (unknown ids and slots beyond `slots` are ignored). */
export function upgradeModifiers(fitted: string[], catalog: IUpgradeData[], slots: number = UPGRADE_SLOTS): IShipModifiers {
  const effects = fitted
    .slice(0, slots)
    .map((id) => catalog.find((u) => u.id === id)?.effects)
    .filter((e): e is Partial<IShipModifiers> => e !== undefined);
  return combineModifiers(...effects);
}

/** Fits `upgradeId` (toggles it off if already fitted). Refuses duplicates and a full ship. */
export function toggleUpgrade(fitted: string[], upgradeId: string, slots: number = UPGRADE_SLOTS): string[] {
  if (fitted.includes(upgradeId)) return fitted.filter((id) => id !== upgradeId);
  if (fitted.length >= slots) return fitted;
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
    if (kind === WeaponKind.DepthCharge && m.depthChargeMul !== 1) return { ...w, firePower: w.firePower * m.depthChargeMul };
    return w;
  });
}

/** Air wing with the modifiers' extra planes (only types the carrier already flies; never below 0). */
export function applyToAirWing(wing: IAirWing, m: IShipModifiers): IAirWing {
  const add = Math.round(m.planesAdd);
  const grow = (n: number): number => (n > 0 ? Math.max(0, n + add) : n);
  return { fighters: grow(wing.fighters), diveBombers: grow(wing.diveBombers), torpedoBombers: grow(wing.torpedoBombers) };
}

const MODIFIER_LABEL: Record<keyof IShipModifiers, string> = {
  hpMul: '耐久',
  armorAdd: '装甲',
  speedMul: '速力',
  gunPowerMul: '砲火力',
  gunReloadMul: '砲装填',
  torpedoPowerMul: '魚雷',
  visionMul: '視界',
  aaMul: '対空',
  airPowerMul: '航空攻撃',
  planesAdd: '搭載機',
  rearmMul: '再装備',
  sonarMul: 'ソナー',
  depthChargeMul: '爆雷',
  nightAimMul: '夜間照準誤差',
  nightVisionMul: '夜間視界',
};

/** Short labels for every modifier that differs from "no change", e.g. ['砲火力 ×1.10', '装甲 +6']. */
export function describeModifiers(m: Partial<IShipModifiers>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(NO_MODIFIERS) as Array<keyof IShipModifiers>) {
    const v = m[key];
    if (v === undefined || Math.abs(v - NO_MODIFIERS[key]) < 1e-9) continue;
    out.push(ADDITIVE_MODIFIERS.includes(key) ? `${MODIFIER_LABEL[key]} ${v > 0 ? '+' : ''}${v}` : `${MODIFIER_LABEL[key]} ×${v.toFixed(2)}`);
  }
  return out;
}
