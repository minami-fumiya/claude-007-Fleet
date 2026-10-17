import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { loadUiFonts } from './ui/fontLoader';

loadUiFonts().then(() => {
  document.getElementById('boot-loader')?.remove();
  new Phaser.Game(GameConfig);
});
