import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { loadUiFonts } from './ui/fontLoader';
import { ORIENTATION } from './config/GameConstants';

document.body.dataset.layout = ORIENTATION;

loadUiFonts().then(() => {
  document.getElementById('boot-loader')?.remove();
  const game = new Phaser.Game(GameConfig);
  // Dev builds expose the game for browser smoke tests (Playwright).
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
});
