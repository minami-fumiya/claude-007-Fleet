import { BaseProjectile } from './BaseProjectile';
import { DEPTH_WATER_FX } from '@/config/GameConstants';

/** Slow, long-running underwater projectile; drawn under the ships with a pale wake. */
export class Torpedo extends BaseProjectile {
  constructor(scene: Phaser.Scene, x = -200, y = -200) {
    super(scene, x, y, 'torpedo');
    this.speed = 280;
    this.setDepth(DEPTH_WATER_FX + 1);
  }
}
