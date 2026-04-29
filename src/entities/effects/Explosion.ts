import Phaser from 'phaser';
import { DEPTH_EFFECTS } from '@/config/GameConstants';

export class Explosion {
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.emitter = scene.add.particles(0, 0, 'particle', {
      speed: { min: 80, max: 260 },
      lifespan: { min: 300, max: 700 },
      scale: { start: 2.5, end: 0 },
      tint: [0xffff00, 0xff8800, 0xff4400],
      quantity: 1,
      emitting: false,
    });
    this.emitter.setDepth(DEPTH_EFFECTS);
  }

  play(x: number, y: number): void {
    this.emitter.explode(24, x, y);
  }
}
