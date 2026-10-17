import { IWeaponData, WeaponType } from '@/types/Weapon';

/** How a weapon is delivered, which decides the projectile and what it can hit. */
export enum WeaponKind {
  Gun = 'Gun',
  Torpedo = 'Torpedo',
  DepthCharge = 'DepthCharge',
  Other = 'Other',
}

export function weaponKind(weapon: IWeaponData): WeaponKind {
  switch (weapon.type) {
    case WeaponType.ShellAP:
    case WeaponType.ShellHE:
      return WeaponKind.Gun;
    case WeaponType.Torpedo:
      return WeaponKind.Torpedo;
    case WeaponType.DepthCharge:
      return WeaponKind.DepthCharge;
    default:
      return WeaponKind.Other;
  }
}

export interface IFireContext {
  /** Distance from the shooter to the target */
  distance: number;
  /** The target is a submarine below the surface (only depth charges reach it) */
  targetSubmerged: boolean;
  /** The shooter is a submerged submarine (it can only launch torpedoes) */
  shooterSubmerged: boolean;
  /** 0..1: how readily torpedoes are used; below 1 they are held until the target is closer */
  torpedoEagerness?: number;
}

/** Torpedoes are launched inside this fraction of their range at eagerness 0 (full range at 1). */
const TORPEDO_MIN_RANGE_FRACTION = 0.6;

/** Can `weapon` usefully engage the target described by `ctx` right now (ignoring reload)? */
export function canEngage(weapon: IWeaponData, ctx: IFireContext): boolean {
  const kind = weaponKind(weapon);
  if (ctx.shooterSubmerged && kind !== WeaponKind.Torpedo) return false;
  if (kind === WeaponKind.DepthCharge) return ctx.targetSubmerged && ctx.distance <= weapon.range;
  if (ctx.targetSubmerged || kind === WeaponKind.Other) return false;
  if (kind === WeaponKind.Torpedo) {
    const eager = Math.min(1, Math.max(0, ctx.torpedoEagerness ?? 1));
    const fraction = TORPEDO_MIN_RANGE_FRACTION + (1 - TORPEDO_MIN_RANGE_FRACTION) * eager;
    return ctx.distance <= weapon.range * fraction;
  }
  return ctx.distance <= weapon.range;
}

/** The weapons in `loadout` that can engage the target now. */
export function selectWeapons(loadout: IWeaponData[], ctx: IFireContext): IWeaponData[] {
  return loadout.filter((w) => canEngage(w, ctx));
}

/** First gun in the loadout, else the first weapon: the one the player fires by clicking. */
export function primaryWeapon(loadout: IWeaponData[]): IWeaponData | undefined {
  return loadout.find((w) => weaponKind(w) === WeaponKind.Gun) ?? loadout[0];
}

/** Longest reach among weapons that can hit surface ships, used to pick a preferred engagement range. */
export function maxSurfaceRange(loadout: IWeaponData[]): number {
  const ranges = loadout
    .filter((w) => weaponKind(w) === WeaponKind.Gun || weaponKind(w) === WeaponKind.Torpedo)
    .map((w) => w.range);
  return ranges.length > 0 ? Math.max(...ranges) : 0;
}
