import Phaser from 'phaser';
import { DEPTH_EFFECTS } from '@/config/GameConstants';

/** Fireball sparks plus a slower column of black smoke drifting up from the hit. */
export class Explosion {
  private fire: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.fire = scene.add.particles(0, 0, 'particle', {
      speed: { min: 80, max: 260 },
      lifespan: { min: 300, max: 700 },
      scale: { start: 2.5, end: 0 },
      tint: [0xffff00, 0xff8800, 0xff4400],
      quantity: 1,
      emitting: false,
    });
    this.fire.setDepth(DEPTH_EFFECTS);
    this.smoke = scene.add.particles(0, 0, 'soft', {
      speed: { min: 10, max: 45 },
      angle: { min: 240, max: 300 },
      lifespan: { min: 900, max: 1600 },
      scale: { start: 0.6, end: 1.8 },
      alpha: { start: 0.55, end: 0 },
      tint: [0x2a2a2a, 0x3c3c3c, 0x1a1a1a],
      quantity: 1,
      emitting: false,
    });
    this.smoke.setDepth(DEPTH_EFFECTS - 1);
  }

  play(x: number, y: number): void {
    this.fire.explode(24, x, y);
    this.smoke.explode(8, x, y);
  }
}
