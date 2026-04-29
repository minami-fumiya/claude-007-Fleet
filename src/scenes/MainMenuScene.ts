import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.MAIN_MENU });
  }

  create(): void {
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x040e1c);

    this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 - 130, 'WW2 NAVAL FLEET', {
        fontSize: '64px',
        color: '#c8d8f0',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 - 60, '太平洋戦争', {
        fontSize: '28px',
        color: '#8aaccc',
      })
      .setOrigin(0.5);

    const startBtn = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 + 60, '[ START ]', {
        fontSize: '40px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setStyle({ color: '#4af0ff' }));
    startBtn.on('pointerout', () => startBtn.setStyle({ color: '#ffffff' }));
    startBtn.on('pointerdown', () => this.scene.start(SceneKeys.FLEET_BUILDER));
  }
}
