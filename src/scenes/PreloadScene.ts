import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';
import { Colors, Css, eyebrowStyle, textStyle } from '@/ui/theme';
import { drawMeter } from '@/ui/components/UIKit';
import ijnData from '@/data/ships/ijn.json';
import usnData from '@/data/ships/usn.json';
import kmData from '@/data/ships/km.json';
import { DataLoader } from '@/utils/DataLoader';
import { generateShipTextures } from '@/entities/ships/ShipTextures';
import weaponsData from '@/data/weapons/weapons.json';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.PRELOAD });
  }

  preload(): void {
    this.createProgressBar();
    this.cache.json.add('ijn', ijnData);
    this.cache.json.add('usn', usnData);
    this.cache.json.add('km', kmData);
    this.cache.json.add('weapons', weaponsData);
  }

  create(): void {
    generateShipTextures(this, DataLoader.getRegistry(this).all());
    this.generateShellTexture();
    this.scene.start(SceneKeys.MAIN_MENU);
  }

  private generateShellTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffee88);
    g.fillCircle(3, 3, 3);
    g.generateTexture('shell', 6, 6);
    g.destroy();
  }

  private createProgressBar(): void {
    const barW = 360;
    const barH = 8;
    const x = (CANVAS_W - barW) / 2;
    const y = CANVAS_H / 2 + 20;

    this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, Colors.bgDeep).setOrigin(0, 0);
    this.add.text(CANVAS_W / 2, y - 64, 'WW2 NAVAL FLEET', eyebrowStyle(13)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, y - 32, '出撃準備中…', textStyle(18, Css.text, { fontStyle: 'bold' })).setOrigin(0.5);

    const fill = this.add.graphics();
    const draw = (value: number): void => {
      fill.clear();
      drawMeter(fill, x, y, barW, barH, value, Colors.cyan);
    };
    draw(0);
    this.load.on('progress', draw);
  }
}
