import Phaser from 'phaser';
import { DEPTH_EFFECTS, DEPTH_WATER_FX } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';

/** Below this HP fraction a ship trails smoke from its fires. */
const BURNING_HP = 0.35;
/** Wakes appear only when a ship is making way. */
const WAKE_MIN_SPEED = 20;

interface ITrail {
  ship: BaseShip;
  wake: Phaser.GameObjects.Particles.ParticleEmitter;
  smoke: Phaser.GameObjects.Particles.ParticleEmitter;
}

/**
 * Per-ship ambient effects: a white wake while moving and black smoke once badly damaged. Both are
 * hidden for ships the player can't see (so they don't give hidden enemies away) and for submerged boats.
 */
export class ShipTrails {
  private trails: ITrail[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  add(ship: BaseShip): void {
    const wake = this.scene.add.particles(0, 0, 'soft', {
      lifespan: 1300,
      scale: { start: 0.35, end: 0.9 },
      alpha: { start: 0.28, end: 0 },
      tint: 0xe6f2ff,
      frequency: 70,
      quantity: 1,
    });
    wake.setDepth(DEPTH_WATER_FX).startFollow(ship);
    const smoke = this.scene.add.particles(0, 0, 'soft', {
      speed: { min: 8, max: 30 },
      angle: { min: 240, max: 300 },
      lifespan: 1600,
      scale: { start: 0.5, end: 1.6 },
      alpha: { start: 0.45, end: 0 },
      tint: [0x262626, 0x3a3a3a],
      frequency: 120,
      emitting: false,
    });
    smoke.setDepth(DEPTH_EFFECTS - 1).startFollow(ship);
    this.trails.push({ ship, wake, smoke });
  }

  update(): void {
    for (const t of this.trails) {
      if (!t.ship.active) {
        t.wake.stop();
        t.smoke.stop();
        continue;
      }
      const body = t.ship.body as Phaser.Physics.Arcade.Body | null;
      const moving = (body?.speed ?? 0) > WAKE_MIN_SPEED;
      const shown = t.ship.visible && !t.ship.submerged;
      t.wake.emitting = shown && moving;
      t.wake.setVisible(shown);
      const burning = t.ship.stats.currentHp / Math.max(1, t.ship.stats.maxHp) < BURNING_HP;
      t.smoke.emitting = shown && burning;
      t.smoke.setVisible(shown);
    }
  }
}
