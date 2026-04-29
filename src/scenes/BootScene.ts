import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.BOOT });
  }

  preload(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 });

    gfx.fillStyle(0xffff00);
    gfx.fillRect(0, 0, 8, 4);
    gfx.generateTexture('shell', 8, 4);

    gfx.clear();
    gfx.fillStyle(0xffffff);
    gfx.fillRect(0, 0, 4, 4);
    gfx.generateTexture('particle', 4, 4);

    gfx.destroy();
  }

  create(): void {
    this.scene.start(SceneKeys.PRELOAD);
  }
}
