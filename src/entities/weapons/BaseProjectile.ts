import Phaser from 'phaser';
import { IWeaponData } from '@/types/Weapon';

/** How much farther than the weapon's listed range a projectile flies before it expires. */
const RANGE_OVERSHOOT = 1.15;
const OUT_OF_BOUNDS_MARGIN = 100;

/**
 * A pooled projectile that remembers the weapon that fired it (for damage) and expires after
 * travelling its weapon's range or leaving the battle world.
 */
export class BaseProjectile extends Phaser.Physics.Arcade.Sprite {
  protected speed = 600;
  weapon: IWeaponData | null = null;
  private startX = 0;
  private startY = 0;
  private maxDistance = Infinity;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
  }

  fire(x: number, y: number, angleRad: number, weapon?: IWeaponData): void {
    this.weapon = weapon ?? null;
    if (weapon && weapon.projectileSpeed > 0) this.speed = weapon.projectileSpeed;
    this.maxDistance = weapon ? weapon.range * RANGE_OVERSHOOT : Infinity;
    this.startX = x;
    this.startY = y;
    this.setActive(true).setVisible(true);
    this.setPosition(x, y);
    this.setRotation(angleRad);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(Math.cos(angleRad) * this.speed, Math.sin(angleRad) * this.speed);
  }

  /** Returns true on the frame the projectile runs out of range (a miss into the sea). */
  update(_time: number, _delta: number): boolean {
    if (!this.active) return false;
    const { x, y } = this;
    // The battle world can be larger than the screen, so test against the physics world.
    const world = this.scene.physics.world.bounds;
    const outOfWorld =
      x < world.left - OUT_OF_BOUNDS_MARGIN ||
      x > world.right + OUT_OF_BOUNDS_MARGIN ||
      y < world.top - OUT_OF_BOUNDS_MARGIN ||
      y > world.bottom + OUT_OF_BOUNDS_MARGIN;
    const spent = Math.hypot(x - this.startX, y - this.startY) > this.maxDistance;
    if (outOfWorld || spent) {
      this.deactivate();
      return spent && !outOfWorld;
    }
    return false;
  }

  deactivate(): void {
    this.setActive(false).setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.setPosition(-200, -200);
  }
}
