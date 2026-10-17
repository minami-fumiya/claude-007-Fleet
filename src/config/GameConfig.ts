import Phaser from 'phaser';
import { CANVAS_W, CANVAS_H } from './GameConstants';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { MainMenuScene } from '@/scenes/MainMenuScene';
import { FleetBuilderScene } from '@/scenes/FleetBuilderScene';
import { BattleScene } from '@/scenes/BattleScene';
import { ResultsScene } from '@/scenes/ResultsScene';
import { CustomizationScene } from '@/scenes/CustomizationScene';
import { HomeScene } from '@/scenes/HomeScene';
import { ArsenalScene } from '@/scenes/ArsenalScene';
import { CampaignMapScene } from '@/scenes/CampaignMapScene';
import { ScenarioScene } from '@/scenes/ScenarioScene';
import { EncyclopediaScene } from '@/scenes/EncyclopediaScene';
import { RecordScene } from '@/scenes/RecordScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { HelpScene } from '@/scenes/HelpScene';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_W,
  height: CANVAS_H,
  backgroundColor: '#020814',
  parent: 'game',
  scale: {
    // Fit the fixed 1280x720 canvas into any screen (phones included) while keeping aspect ratio.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    // Two simultaneous touches so the player can steer and fire at once.
    activePointers: 2,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, PreloadScene, MainMenuScene, FleetBuilderScene, BattleScene, ResultsScene, CustomizationScene, HomeScene, ArsenalScene, CampaignMapScene, ScenarioScene, EncyclopediaScene, RecordScene, SettingsScene, HelpScene],
};
