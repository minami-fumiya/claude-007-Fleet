import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';
import ijnData from '@/data/ships/ijn.json';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.PRELOAD });
  }

  preload(): void {
    this.createProgressBar();
    this.cache.json.add('ijn', ijnData);
    this.load.image('yamato', 'assets/ships/ijn/yamato.png');
  }

  create(): void {
    this.scene.start(SceneKeys.BATTLE);
  }

  private createProgressBar(): void {
    const barW = 400;
    const barH = 20;
    const x = (CANVAS_W - barW) / 2;
    const y = CANVAS_H / 2;

    const border = this.add.graphics();
    border.lineStyle(2, 0xffffff);
    border.strokeRect(x, y, barW, barH);

    const fill = this.add.graphics();

    this.load.on('progress', (value: number) => {
      fill.clear();
      fill.fillStyle(0x4488ff);
      fill.fillRect(x + 2, y + 2, (barW - 4) * value, barH - 4);
    });

    this.add
      .text(CANVAS_W / 2, y - 30, 'Loading…', { fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5);
  }
}
