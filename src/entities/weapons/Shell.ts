import { BaseProjectile } from './BaseProjectile';
import { DEPTH_PROJECTILES } from '@/config/GameConstants';

export class Shell extends BaseProjectile {
  constructor(scene: Phaser.Scene, x = -200, y = -200) {
    super(scene, x, y, 'shell');
    this.speed = 600;
    this.setDepth(DEPTH_PROJECTILES);
  }
}
