import Phaser from 'phaser';
import { IShipStats } from '@/types/Ship';
import { IWeaponData } from '@/types/Weapon';
import { ShipClass } from '@/types/ShipClass';
import { ISteer } from '@/systems/AutoPilot';
import { createSubmarineState, ISubmarineState, speedFactor } from '@/systems/SubmarineSystem';
import { rotateTowardsDegrees } from '@/utils/MathUtils';
import { CriticalState, ICriticalEffects } from '@/types/ShipDamage';
import { criticalEffects } from '@/systems/DamageSystem';

export class BaseShip extends Phaser.Physics.Arcade.Sprite {
  stats: IShipStats;
  /** Every weapon the ship carries, in data order */
  loadout: IWeaponData[] = [];
  /** Dive state; null for surface ships */
  sub: ISubmarineState | null;
  /** From upgrades: radar widens vision, extra guns strengthen AA */
  visionMul = 1;
  aaMul = 1;
  /** Ship data id (for saving damage after the battle) */
  dataId = '';
  /** Sea state (storms slow every ship) */
  envSpeedMul = 1;
  /** Turns a wanted heading away from land (set by the battle when the map has islands) */
  avoid: ((x: number, y: number, headingDeg: number) => number) | null = null;
  /** Component damage (expiry times) */
  criticals: CriticalState = {};

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, stats: IShipStats) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.stats = { ...stats };
    this.sub = stats.shipClass === ShipClass.Submarine ? createSubmarineState() : null;

    // Arcade bodies never rotate, so a long hull box would be wrong whenever the ship turns.
    // A circle sized between beam and length stays a fair fit at every heading.
    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = (this.width + this.height) / 4;
    body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    body.setCollideWorldBounds(true);
  }

  get submerged(): boolean {
    return this.sub?.submerged ?? false;
  }

  /** Effects of the component damage active now. */
  critEffects(): ICriticalEffects {
    return criticalEffects(this.criticals, this.scene?.time.now ?? 0);
  }

  /** Top speed right now (submerged boats and damaged engines are slower). */
  get currentSpeed(): number {
    return this.stats.speed * (this.sub ? speedFactor(this.sub) : 1) * this.critEffects().speedMul * this.envSpeedMul;
  }

  /** Turns toward the requested heading at `turnRateDeg` and moves along the bow at the throttle. */
  steer(s: ISteer, dtSec: number, turnRateDeg: number, avoidLand = true): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const spd = this.currentSpeed * s.throttle;
    const heading = avoidLand && this.avoid ? this.avoid(this.x, this.y, s.headingDeg) : s.headingDeg;
    this.angle = rotateTowardsDegrees(this.angle, heading, turnRateDeg * this.critEffects().turnMul * dtSec);
    const bow = Phaser.Math.DegToRad(this.angle - 90);
    body.setVelocity(Math.cos(bow) * spd, Math.sin(bow) * spd);
  }

  takeDamage(amount: number): void {
    this.stats.currentHp = Math.max(0, this.stats.currentHp - amount);
    if (this.stats.currentHp <= 0) {
      this.destroy();
    }
  }

  get isAlive(): boolean {
    return this.active && this.stats.currentHp > 0;
  }

  update(_time: number, _delta: number): void {
    // override in subclasses
  }
}
