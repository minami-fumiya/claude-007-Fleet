import Phaser from 'phaser';
import { IShipStats } from '@/types/Ship';

export class BaseShip extends Phaser.Physics.Arcade.Sprite {
  stats: IShipStats;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, stats: IShipStats) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.stats = { ...stats };
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
