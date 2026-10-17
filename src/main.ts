import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { loadUiFonts } from './ui/fontLoader';
import { ORIENTATION } from './config/GameConstants';

document.body.dataset.layout = ORIENTATION;

loadUiFonts().then(() => {
  document.getElementById('boot-loader')?.remove();
  new Phaser.Game(GameConfig);
});
