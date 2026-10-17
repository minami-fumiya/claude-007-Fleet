import { BaseProjectile } from './BaseProjectile';

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
    // The battle world can be larger than the screen, so test against the physics world.
    const world = this.scene.physics.world.bounds;
    if (
      x < world.left - OUT_OF_BOUNDS_MARGIN ||
      x > world.right + OUT_OF_BOUNDS_MARGIN ||
      y < world.top - OUT_OF_BOUNDS_MARGIN ||
      y > world.bottom + OUT_OF_BOUNDS_MARGIN
    ) {
      this.deactivate();
    }
  }
}
