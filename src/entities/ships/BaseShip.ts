import Phaser from 'phaser';
import { IShipStats } from '@/types/Ship';

export class BaseShip extends Phaser.Physics.Arcade.Sprite {
  stats: IShipStats;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, stats: IShipStats) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.stats = { ...stats };

    // Arcade bodies never rotate, so a long hull box would be wrong whenever the ship turns.
    // A circle sized between beam and length stays a fair fit at every heading.
    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = (this.width + this.height) / 4;
    body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    body.setCollideWorldBounds(true);
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
