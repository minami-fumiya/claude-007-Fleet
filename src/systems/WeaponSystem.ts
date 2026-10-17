import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { BaseProjectile } from '@/entities/weapons/BaseProjectile';
import { Shell } from '@/entities/weapons/Shell';
import { Torpedo } from '@/entities/weapons/Torpedo';
import { DepthCharge } from '@/entities/weapons/DepthCharge';
import { IWeaponData } from '@/types/Weapon';
import { ReloadState } from './ReloadState';
import { weaponKind, WeaponKind } from './WeaponSelector';

export { ReloadState } from './ReloadState';

/** Called when a depth charge goes off, so the scene can apply area damage. */
export type DetonationHandler = (x: number, y: number, weapon: IWeaponData) => void;

/** Torpedoes leave the tubes this far apart (radians) when a spread is fired. */
const TORPEDO_SPREAD = 0.08;
/** A torpedo weapon's firePower is for the whole salvo; each torpedo carries its share. */
export const TORPEDOES_PER_SALVO = 2;

/**
 * Fires every weapon of one side (shells, torpedo spreads, depth charges) and owns their
 * projectiles. Projectiles carry their weapon, so one system serves a whole fleet. Inactive
 * projectiles are reused before new ones are created.
 */
export class WeaponSystem {
  /** Shells and torpedoes: register these for hit detection (new ones are appended in place). */
  readonly projectiles: BaseProjectile[] = [];
  private readonly charges: DepthCharge[] = [];
  private reload = new ReloadState();
  /** Extra random spread on every shot (weather), radians */
  aimError = 0;
  private lastFired = new WeakMap<BaseShip, number>();
  /** Per-torpedo copies of torpedo weapons (firePower split across the salvo) */
  private perTorpedo = new Map<string, IWeaponData>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onDetonate: DetonationHandler = () => undefined,
  ) {}

  /** Reload time with a damaged main battery taken into account. */
  private reloadTime(ship: BaseShip, weapon: IWeaponData): number {
    return weaponKind(weapon) === WeaponKind.Gun ? weapon.reloadTime * ship.critEffects().gunReloadMul : weapon.reloadTime;
  }

  /** When `ship` last fired anything (for muzzle flashes at night). */
  lastFiredAt(ship: BaseShip): number | undefined {
    return this.lastFired.get(ship);
  }

  isReady(ship: BaseShip, weapon: IWeaponData, now: number): boolean {
    return this.reload.isReady(ship, this.reloadTime(ship, weapon), now, weapon.id);
  }

  /** Fires `weapon` from `ship` towards `targetAngle` (radians) if it has reloaded. */
  fireWeapon(ship: BaseShip, weapon: IWeaponData, targetAngle: number, now: number): boolean {
    if (!this.isReady(ship, weapon, now)) return false;
    this.reload.markFired(ship, now, weapon.id);
    this.lastFired.set(ship, now);
    if (this.aimError > 0) targetAngle += (Math.random() * 2 - 1) * this.aimError;

    switch (weaponKind(weapon)) {
      case WeaponKind.Torpedo: {
        const each = this.torpedoShare(weapon);
        for (let i = 0; i < TORPEDOES_PER_SALVO; i++) {
          const offset = (i - (TORPEDOES_PER_SALVO - 1) / 2) * TORPEDO_SPREAD;
          this.acquire(Torpedo).fire(ship.x, ship.y, targetAngle + offset, each);
        }
        break;
      }
      case WeaponKind.DepthCharge:
        this.acquireCharge().drop(ship.x, ship.y, weapon, now);
        break;
      default:
        this.acquire(Shell).fire(ship.x, ship.y, targetAngle, weapon);
    }
    return true;
  }

  /** Launches a projectile without a reload check (aircraft drops). Depth charges are not supported. */
  launchProjectile(x: number, y: number, angle: number, weapon: IWeaponData): void {
    const type = weaponKind(weapon) === WeaponKind.Torpedo ? Torpedo : Shell;
    this.acquire<BaseProjectile>(type).fire(x, y, angle, weapon);
  }

  reloadProgress(ship: BaseShip, weapon: IWeaponData, now: number): number {
    return this.reload.progress(ship, this.reloadTime(ship, weapon), now, weapon.id);
  }

  update(time: number, delta: number): void {
    for (const p of this.projectiles) p.update(time, delta);
    for (const c of this.charges) {
      if (c.update(time) && c.weapon) this.onDetonate(c.x, c.y, c.weapon);
    }
  }

  private torpedoShare(weapon: IWeaponData): IWeaponData {
    let each = this.perTorpedo.get(weapon.id);
    if (!each) {
      each = { ...weapon, firePower: weapon.firePower / TORPEDOES_PER_SALVO };
      this.perTorpedo.set(weapon.id, each);
    }
    return each;
  }

  private acquire<T extends BaseProjectile>(type: new (scene: Phaser.Scene) => T): T {
    const idle = this.projectiles.find((p): p is T => !p.active && p instanceof type);
    if (idle) return idle;
    const p = new type(this.scene);
    this.projectiles.push(p);
    return p;
  }

  private acquireCharge(): DepthCharge {
    const idle = this.charges.find((c) => !c.active);
    if (idle) return idle;
    const c = new DepthCharge(this.scene);
    this.charges.push(c);
    return c;
  }
}
