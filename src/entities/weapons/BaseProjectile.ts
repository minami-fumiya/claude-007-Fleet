import Phaser from 'phaser';

export class BaseProjectile extends Phaser.Physics.Arcade.Sprite {
  protected speed = 600;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
  }

  fire(x: number, y: number, angleRad: number): void {
    this.setActive(true).setVisible(true);
    this.setPosition(x, y);
    this.setRotation(angleRad);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(
      Math.cos(angleRad) * this.speed,
      Math.sin(angleRad) * this.speed,
    );
  }

  deactivate(): void {
    this.setActive(false).setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.setPosition(-200, -200);
  }
}
