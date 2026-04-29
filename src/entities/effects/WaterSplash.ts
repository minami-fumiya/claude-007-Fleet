import Phaser from 'phaser';
import { DEPTH_EFFECTS } from '@/config/GameConstants';

export class WaterSplash {
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.emitter = scene.add.particles(0, 0, 'particle', {
      speed: { min: 40, max: 140 },
      angle: { min: 230, max: 310 },
      lifespan: { min: 200, max: 500 },
      scale: { start: 1.5, end: 0 },
      tint: [0xaaddff, 0x88bbff, 0xffffff],
      quantity: 1,
      emitting: false,
    });
    this.emitter.setDepth(DEPTH_EFFECTS);
  }

  play(x: number, y: number): void {
    this.emitter.explode(12, x, y);
  }
}
