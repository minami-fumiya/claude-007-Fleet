import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';
import { Colors, Css, eyebrowStyle, textStyle } from '@/ui/theme';
import { drawMeter } from '@/ui/components/UIKit';
import ijnData from '@/data/ships/ijn.json';
import usnData from '@/data/ships/usn.json';
import kmData from '@/data/ships/km.json';
import rnData from '@/data/ships/rn.json';
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
    this.cache.json.add('rn', rnData);
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

    // Torpedo: points along +x (projectiles rotate to their heading), pale wake trailing behind.
    g.clear();
    g.fillStyle(0xd8f4ff, 0.35);
    g.fillTriangle(0, 3, 12, 1, 12, 5);
    g.fillStyle(0xf2f6fa, 1);
    g.fillRoundedRect(10, 1.5, 10, 3, 1.5);
    g.generateTexture('torpedo', 20, 6);

    // Depth charge: a dark drum with a light rim, seen from above.
    g.clear();
    g.fillStyle(0x1c2633, 1);
    g.fillCircle(5, 5, 4.5);
    g.lineStyle(1.5, 0xcfe3f2, 0.9);
    g.strokeCircle(5, 5, 4);
    g.generateTexture('depth-charge', 10, 10);

    // Aircraft, nose along +x: fighters slim, dive bombers broad-winged, torpedo bombers with a torpedo.
    const plane = (key: string, span: number, body: number, extra?: () => void): void => {
      g.clear();
      g.fillStyle(0xf4f7fb, 1);
      g.fillRect(2, 5 - 1, body, 2);
      g.fillTriangle(body * 0.55, 5, body * 0.35, 5 - span / 2, body * 0.25, 5);
      g.fillTriangle(body * 0.55, 5, body * 0.35, 5 + span / 2, body * 0.25, 5);
      g.fillRect(2, 5 - 2.5, 2, 5);
      extra?.();
      g.generateTexture(key, 14, 10);
    };
    plane('plane-fighter', 8, 11);
    plane('plane-dive', 10, 10);
    plane('plane-torpedo', 10, 11, () => {
      g.fillStyle(0x9fb4c8, 1);
      g.fillRect(5, 6, 6, 1.5);
    });
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
