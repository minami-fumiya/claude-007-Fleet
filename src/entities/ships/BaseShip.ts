import Phaser from 'phaser';
import { IShipStats } from '@/types/Ship';
import { IWeaponData } from '@/types/Weapon';
import { ShipClass } from '@/types/ShipClass';
import { ISteer } from '@/systems/AutoPilot';
import { createSubmarineState, ISubmarineState, speedFactor } from '@/systems/SubmarineSystem';
import { rotateTowardsDegrees } from '@/utils/MathUtils';

export class BaseShip extends Phaser.Physics.Arcade.Sprite {
  stats: IShipStats;
  /** Every weapon the ship carries, in data order */
  loadout: IWeaponData[] = [];
  /** Dive state; null for surface ships */
  sub: ISubmarineState | null;

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

  /** Top speed right now (submerged boats are slower). */
  get currentSpeed(): number {
    return this.stats.speed * (this.sub ? speedFactor(this.sub) : 1);
  }

  /** Turns toward the requested heading at `turnRateDeg` and moves along the bow at the throttle. */
  steer(s: ISteer, dtSec: number, turnRateDeg: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const spd = this.currentSpeed * s.throttle;
    this.angle = rotateTowardsDegrees(this.angle, s.headingDeg, turnRateDeg * dtSec);
    const heading = Phaser.Math.DegToRad(this.angle - 90);
    body.setVelocity(Math.cos(heading) * spd, Math.sin(heading) * spd);
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
