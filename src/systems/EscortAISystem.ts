import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { WeaponSystem } from './WeaponSystem';
import { FormationSystem } from './FormationSystem';
import { IWeaponData } from '@/types/Weapon';
import { IFormationSlotOffset } from '@/types/Formation';

const ARRIVE_THRESHOLD = 24;
const ROTATE_SPEED_DEG = 100;

export class EscortAISystem {
  private weaponSystem: WeaponSystem;
  private weapon: IWeaponData;
  private offset: IFormationSlotOffset;

  constructor(weaponSystem: WeaponSystem, weapon: IWeaponData, offset: IFormationSlotOffset) {
    this.weaponSystem = weaponSystem;
    this.weapon = weapon;
    this.offset = offset;
  }

  update(escort: BaseShip, flagship: BaseShip, enemies: BaseShip[], time: number, delta: number): void {
    if (!escort.isAlive || !flagship.isAlive) return;

    const dtSec = delta / 1000;
    const target = FormationSystem.getWorldPosition(flagship, this.offset);
    const distToSlot = Phaser.Math.Distance.Between(escort.x, escort.y, target.x, target.y);
    const body = escort.body as Phaser.Physics.Arcade.Body;

    if (distToSlot > ARRIVE_THRESHOLD) {
      const angleToSlot = Phaser.Math.Angle.Between(escort.x, escort.y, target.x, target.y);
      body.setVelocity(
        Math.cos(angleToSlot) * escort.stats.speed,
        Math.sin(angleToSlot) * escort.stats.speed,
      );
      const targetAngleDeg = Phaser.Math.RadToDeg(angleToSlot) + 90;
      const currentAngleDeg = escort.angle;
      const diff = Phaser.Math.Angle.ShortestBetween(currentAngleDeg, targetAngleDeg);
      const step = ROTATE_SPEED_DEG * dtSec;
      escort.angle += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
    } else {
      body.setVelocity(0, 0);
      escort.angle = flagship.angle;
    }

    const nearestEnemy = this.findNearestEnemy(escort, enemies);
    if (nearestEnemy) {
      const dist = Phaser.Math.Distance.Between(escort.x, escort.y, nearestEnemy.x, nearestEnemy.y);
      if (dist <= this.weapon.range) {
        const angleToEnemy = Phaser.Math.Angle.Between(escort.x, escort.y, nearestEnemy.x, nearestEnemy.y);
        this.weaponSystem.fireWeapon(escort, this.weapon, angleToEnemy, time);
      }
    }
  }

  private findNearestEnemy(escort: BaseShip, enemies: BaseShip[]): BaseShip | null {
    let nearest: BaseShip | null = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (!e.isAlive) continue;
      const d = Phaser.Math.Distance.Between(escort.x, escort.y, e.x, e.y);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    }
    return nearest;
  }
}
