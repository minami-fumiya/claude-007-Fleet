import { BaseProjectile } from './BaseProjectile';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';

const OUT_OF_BOUNDS_MARGIN = 100;

export class Shell extends BaseProjectile {
  constructor(scene: Phaser.Scene, x = -200, y = -200) {
    super(scene, x, y, 'shell');
    this.speed = 600;
    this.setDepth(30);
  }

  update(_time: number, _delta: number): void {
    if (!this.active) return;
    const { x, y } = this;
    if (
      x < -OUT_OF_BOUNDS_MARGIN ||
      x > CANVAS_W + OUT_OF_BOUNDS_MARGIN ||
      y < -OUT_OF_BOUNDS_MARGIN ||
      y > CANVAS_H + OUT_OF_BOUNDS_MARGIN
    ) {
      this.deactivate();
    }
  }
}
