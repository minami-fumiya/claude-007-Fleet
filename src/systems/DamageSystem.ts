import { CriticalState, CriticalType, ICriticalEffects, IStatusState, ShellMode, StatusKind } from '@/types/ShipDamage';
import { WeaponType } from '@/types/Weapon';
import { ShipClass } from '@/types/ShipClass';

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

// ---------------------------------------------------------------------------
// 弾種と火災・浸水 (#48)
// ---------------------------------------------------------------------------

/** Chance a hit sets the ship on fire (HE and bombs above all) or floods it (torpedoes). */
const FIRE_CHANCE: Partial<Record<WeaponType, number>> = { [WeaponType.ShellHE]: 0.12, [WeaponType.Bomb]: 0.2, [WeaponType.ShellAP]: 0.02 };
const FLOOD_CHANCE: Partial<Record<WeaponType, number>> = { [WeaponType.Torpedo]: 0.35, [WeaponType.DepthCharge]: 0.1 };
export const STATUS_DURATION_MS: Record<StatusKind, number> = { fire: 12_000, flood: 15_000 };
/** Share of the ship's full HP lost each second */
export const STATUS_DPS: Record<StatusKind, number> = { fire: 0.005, flood: 0.0035 };
/** A flooding ship is slower */
export const FLOOD_SPEED_MUL = 0.85;
/** Switching the main guns' shells costs this long (the guns reload) */
export const SHELL_SWITCH_MS = 2500;

export const STATUS_LABEL: Record<StatusKind, string> = { fire: '火災', flood: '浸水' };
export const SHELL_LABEL: Record<ShellMode, string> = { auto: '弾種 自動', AP: '徹甲弾', HE: '榴弾' };

/**
 * Rolls for a fire or flooding on a hit; `chanceMul` is the ship's damage control (lower is better). A ship on fire
 * doesn't catch fire again, but the fire burns on.
 */
export function rollStatus(type: WeaponType, rng: () => number = Math.random, chanceMul = 1): StatusKind | null {
  if (rng() < (FIRE_CHANCE[type] ?? 0) * chanceMul) return 'fire';
  if (rng() < (FLOOD_CHANCE[type] ?? 0) * chanceMul) return 'flood';
  return null;
}

/** Starts (or restarts) a fire / flooding; `durationMul` shortens it for good damage control. */
export function applyStatus(state: IStatusState, kind: StatusKind, now: number, durationMul = 1): IStatusState {
  return { ...state, [kind]: now + STATUS_DURATION_MS[kind] * durationMul };
}

export function activeStatus(state: IStatusState, now: number): StatusKind[] {
  return (Object.keys(state) as StatusKind[]).filter((k) => (state[k] ?? 0) > now);
}

/** HP lost to fire and flooding over `dtMs`. */
export function statusDamage(state: IStatusState, now: number, dtMs: number, maxHp: number): number {
  return activeStatus(state, now).reduce((sum, k) => sum + STATUS_DPS[k] * maxHp * (dtMs / 1000), 0);
}

export function statusSpeedMul(state: IStatusState, now: number): number {
  return (state.flood ?? 0) > now ? FLOOD_SPEED_MUL : 1;
}

/** The shell a main-gun hit counts as: AUTO uses AP on battleships and cruisers, HE on the rest. */
export function effectiveShell(type: WeaponType, mode: ShellMode, target: ShipClass): WeaponType {
  if (type !== WeaponType.ShellAP && type !== WeaponType.ShellHE) return type;
  if (mode === 'AP') return WeaponType.ShellAP;
  if (mode === 'HE') return WeaponType.ShellHE;
  return target === ShipClass.Battleship || target === ShipClass.Cruiser ? WeaponType.ShellAP : WeaponType.ShellHE;
}

export function nextShellMode(m: ShellMode): ShellMode {
  return m === 'auto' ? 'AP' : m === 'AP' ? 'HE' : 'auto';
}

// ---------------------------------------------------------------------------
// HUD readouts (#81)
// ---------------------------------------------------------------------------

const EFFECT_TEXT: Record<CriticalType, string> = {
  [CriticalType.MainGun]: `装填 ×${EFFECTS[CriticalType.MainGun].gunReloadMul}`,
  [CriticalType.Engine]: `速力 −${Math.round((1 - (EFFECTS[CriticalType.Engine].speedMul ?? 1)) * 100)}%`,
  [CriticalType.Rudder]: `旋回 −${Math.round((1 - (EFFECTS[CriticalType.Rudder].turnMul ?? 1)) * 100)}%`,
};

/** "機関損傷 速力 −40% 12秒  ·  火災 8秒" for what is wrong with a ship now (#81); '' when nothing is. */
export function damageReadout(crits: CriticalState, status: IStatusState, now: number): string {
  const secs = (until: number | undefined): number => Math.ceil(((until ?? now) - now) / 1000);
  const parts = [
    ...activeCriticals(crits, now).map((c) => `${CRITICAL_LABEL[c]} ${EFFECT_TEXT[c]} ${secs(crits[c])}秒`),
    ...activeStatus(status, now).map((k) => `${STATUS_LABEL[k]}${k === 'flood' ? ` 速力 −${Math.round((1 - FLOOD_SPEED_MUL) * 100)}%` : ''} ${secs(status[k])}秒`),
  ];
  return parts.join('  ·  ');
}

/** "主砲 ●  副砲 64%  魚雷 ●" (#81): each kind of weapon the ship carries, ready (●) or how far reloaded. */
export function weaponReadout(weapons: Array<{ label: string; progress: number }>): string {
  return weapons.map((w) => `${w.label} ${w.progress >= 1 ? '●' : `${Math.floor(w.progress * 100)}%`}`).join('  ');
}
