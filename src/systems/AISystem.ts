import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { WeaponSystem } from './WeaponSystem';
import { IWeaponData } from '@/types/Weapon';

const FIRE_RANGE = 420;
const APPROACH_STOP_DIST = 280;
const ROTATE_SPEED_DEG = 80;

export class AISystem {
  private weaponSystem: WeaponSystem;
  private weapon: IWeaponData;

  constructor(weaponSystem: WeaponSystem, weapon: IWeaponData) {
    this.weaponSystem = weaponSystem;
    this.weapon = weapon;
  }

  update(enemy: BaseShip, target: BaseShip, time: number, delta: number): void {
    if (!enemy.isAlive || !target.isAlive) return;

    const angleToTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
    const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
    const dtSec = delta / 1000;

    const currentAngleRad = Phaser.Math.DegToRad(enemy.angle - 90);
    const angleDiff = Phaser.Math.Angle.Wrap(angleToTarget - currentAngleRad);
    const rotateAmountDeg = ROTATE_SPEED_DEG * dtSec;

    if (Math.abs(Phaser.Math.RadToDeg(angleDiff)) > rotateAmountDeg) {
      enemy.angle += angleDiff > 0 ? rotateAmountDeg : -rotateAmountDeg;
    }

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    if (distance > APPROACH_STOP_DIST) {
      const speed = enemy.stats.speed * 0.6;
      body.setVelocity(Math.cos(angleToTarget) * speed, Math.sin(angleToTarget) * speed);
    } else {
      body.setVelocity(0, 0);
    }

    if (distance <= FIRE_RANGE) {
      this.weaponSystem.fireWeapon(enemy, this.weapon, angleToTarget, time);
    }
  }
}
