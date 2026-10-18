import Phaser from 'phaser';
import { DEPTH_EFFECTS, DEPTH_WATER_FX } from '@/config/GameConstants';

const RIPPLE_MS = 700;

/** A shell landing in the sea: a burst of spray and an expanding ripple ring. */
export class WaterSplash {
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private readonly scene: Phaser.Scene) {
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

  play(x: number, y: number, size = 1): void {
    this.emitter.explode(Math.round(12 * size), x, y);
    const ring = this.scene.add.circle(x, y, 6 * size).setStrokeStyle(1.5, 0xcfe8ff, 0.7).setDepth(DEPTH_WATER_FX);
    this.scene.tweens.add({
      targets: ring,
      scale: 4,
      alpha: 0,
      duration: RIPPLE_MS,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}
