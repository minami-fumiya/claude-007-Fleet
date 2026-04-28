import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H } from '@/config/GameConstants';
import { IBattleResultData } from '@/types/Scene';

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.RESULTS });
  }

  create(data: IBattleResultData): void {
    const { victory } = data;

    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, victory ? 0x0a2a0a : 0x2a0a0a);

    this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 - 80, victory ? 'VICTORY' : 'DEFEAT', {
        fontSize: '72px',
        color: victory ? '#44ff44' : '#ff4444',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const retryBtn = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2 + 60, '[ RETRY ]', {
        fontSize: '36px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    retryBtn.on('pointerover', () => retryBtn.setStyle({ color: '#4488ff' }));
    retryBtn.on('pointerout', () => retryBtn.setStyle({ color: '#ffffff' }));
    retryBtn.on('pointerdown', () => this.scene.start(SceneKeys.BATTLE));
  }
}
