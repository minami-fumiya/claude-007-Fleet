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

    const shipDefs: Array<{ key: string; color: number; w: number; h: number }> = [
      { key: 'yamato',  color: 0x9988aa, w: 48, h: 20 },
      { key: 'musashi', color: 0x9988cc, w: 48, h: 20 },
      { key: 'takao',   color: 0x6699bb, w: 38, h: 14 },
      { key: 'fubuki',  color: 0x44aa88, w: 28, h: 10 },
      { key: 'shokaku', color: 0xaa8844, w: 52, h: 24 },
    ];
    for (const def of shipDefs) {
      gfx.clear();
      gfx.fillStyle(def.color, 1);
      gfx.fillRect(0, 0, def.w, def.h);
      gfx.generateTexture(def.key, def.w, def.h);
    }

    gfx.destroy();
  }

  create(): void {
    this.scene.start(SceneKeys.PRELOAD);
  }
}
