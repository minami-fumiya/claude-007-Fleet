import type { BaseShip } from '@/entities/ships/BaseShip';
import Phaser from 'phaser';
import { DEPTH_WATER_FX } from '@/config/GameConstants';
import { IWeaponData } from '@/types/Weapon';

/** Time from the drop to the underwater blast. */
export const DEPTH_CHARGE_FUSE_MS = 800;
/** Blast radius in px: every ship inside takes falloff damage. */
export const DEPTH_CHARGE_RADIUS = 110;

/** A depth charge sinking where it was dropped; `update` reports when its fuse runs out. */
export class DepthCharge extends Phaser.GameObjects.Image {
  weapon: IWeaponData | null = null;
  /** The ship that dropped it (#199) */
  source: BaseShip | null = null;
  private detonateAt = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, -200, -200, 'depth-charge');
    scene.add.existing(this);
    this.setDepth(DEPTH_WATER_FX + 1).setActive(false).setVisible(false);
  }

  drop(x: number, y: number, weapon: IWeaponData, now: number, source: BaseShip | null = null): void {
    this.weapon = weapon;
    this.source = source;
    this.detonateAt = now + DEPTH_CHARGE_FUSE_MS;
    this.setPosition(x, y).setAlpha(1).setScale(1).setActive(true).setVisible(true);
  }

  /** Returns true on the frame the charge detonates (it then deactivates itself). */
  update(time: number): boolean {
    if (!this.active) return false;
    const left = this.detonateAt - time;
    // Fades and shrinks as it sinks.
    const t = Math.max(0, Math.min(1, left / DEPTH_CHARGE_FUSE_MS));
    this.setAlpha(0.35 + 0.65 * t).setScale(0.6 + 0.4 * t);
    if (left > 0) return false;
    this.setActive(false).setVisible(false);
    return true;
  }
}
