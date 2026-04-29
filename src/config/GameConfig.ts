import Phaser from 'phaser';
import { CANVAS_W, CANVAS_H } from './GameConstants';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { MainMenuScene } from '@/scenes/MainMenuScene';
import { FleetBuilderScene } from '@/scenes/FleetBuilderScene';
import { BattleScene } from '@/scenes/BattleScene';
import { ResultsScene } from '@/scenes/ResultsScene';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_W,
  height: CANVAS_H,
  backgroundColor: '#0a1a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, PreloadScene, MainMenuScene, FleetBuilderScene, BattleScene, ResultsScene],
};
