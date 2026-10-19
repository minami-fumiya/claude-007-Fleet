import { CriticalState, CriticalType, ICriticalEffects } from '@/types/ShipDamage';
import { WeaponType } from '@/types/Weapon';

/** Component damage (pure): rolling criticals on hits and what an active critical does to a ship. */

/** Crew repairs a critical after this long. */
export const CRITICAL_DURATION_MS = 15000;

const BASE_CHANCE: Partial<Record<WeaponType, number>> = {
  [WeaponType.ShellAP]: 0.08,
  [WeaponType.ShellHE]: 0.05,
  [WeaponType.Torpedo]: 0.25,
  [WeaponType.Bomb]: 0.15,
  [WeaponType.DepthCharge]: 0.2,
};

/** Relative odds of each critical type by weapon (torpedoes hit below the waterline: engines). */
const WEIGHTS: Partial<Record<WeaponType, Record<CriticalType, number>>> = {
  [WeaponType.Torpedo]: { [CriticalType.Engine]: 5, [CriticalType.Rudder]: 3, [CriticalType.MainGun]: 2 },
  [WeaponType.DepthCharge]: { [CriticalType.Engine]: 6, [CriticalType.Rudder]: 3, [CriticalType.MainGun]: 1 },
  [WeaponType.Bomb]: { [CriticalType.MainGun]: 5, [CriticalType.Engine]: 3, [CriticalType.Rudder]: 2 },
};
const DEFAULT_WEIGHTS: Record<CriticalType, number> = { [CriticalType.MainGun]: 4, [CriticalType.Engine]: 3, [CriticalType.Rudder]: 3 };

const EFFECTS: Record<CriticalType, Partial<ICriticalEffects>> = {
  [CriticalType.MainGun]: { gunReloadMul: 2 },
  [CriticalType.Engine]: { speedMul: 0.6 },
  [CriticalType.Rudder]: { turnMul: 0.4 },
};

export const CRITICAL_LABEL: Record<CriticalType, string> = {
  [CriticalType.MainGun]: '主砲損傷',
  [CriticalType.Engine]: '機関損傷',
  [CriticalType.Rudder]: '舵損傷',
};
/** One-character badges for ship labels. */
export const CRITICAL_BADGE: Record<CriticalType, string> = {
  [CriticalType.MainGun]: '砲',
  [CriticalType.Engine]: '機',
  [CriticalType.Rudder]: '舵',
};

/** Chance a hit causes a critical: the weapon's base chance, scaled by how big the hit was. */
export function criticalChance(type: WeaponType, damage: number, targetMaxHp: number): number {
  const base = BASE_CHANCE[type] ?? 0;
  if (base === 0 || targetMaxHp <= 0) return 0;
  const size = Math.min(1.5, Math.max(0.3, damage / (targetMaxHp * 0.08)));
  return Math.min(1, base * size);
}

/** Shore targets can't move: a hit can only silence their guns (#133). */
export const LAND_CRITICAL_LABEL = '砲台沈黙';

/**
 * Rolls for a critical on a hit. `rng` returns [0, 1) and is called twice at most. A shore target (`land`) only
 * ever gets its guns knocked out — engines and rudders mean nothing to a fort.
 */
export function rollCriticalHit(type: WeaponType, damage: number, targetMaxHp: number, rng: () => number = Math.random, land = false): CriticalType | null {
  if (rng() >= criticalChance(type, damage, targetMaxHp)) return null;
  if (land) return CriticalType.MainGun;
  const weights = WEIGHTS[type] ?? DEFAULT_WEIGHTS;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let pick = rng() * total;
  for (const [crit, w] of Object.entries(weights) as Array<[CriticalType, number]>) {
    pick -= w;
    if (pick < 0) return crit;
  }
  return CriticalType.MainGun;
}

export function applyCritical(state: CriticalState, type: CriticalType, now: number): CriticalState {
  return { ...state, [type]: now + CRITICAL_DURATION_MS };
}

export function activeCriticals(state: CriticalState, now: number): CriticalType[] {
  return (Object.keys(state) as CriticalType[]).filter((k) => (state[k] ?? 0) > now);
}

export function criticalEffects(state: CriticalState, now: number): ICriticalEffects {
  const out: ICriticalEffects = { speedMul: 1, turnMul: 1, gunReloadMul: 1 };
  for (const c of activeCriticals(state, now)) {
    const e = EFFECTS[c];
    out.speedMul *= e.speedMul ?? 1;
    out.turnMul *= e.turnMul ?? 1;
    out.gunReloadMul *= e.gunReloadMul ?? 1;
  }
  return out;
}
