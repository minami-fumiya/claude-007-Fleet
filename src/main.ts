import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { loadUiFonts } from './ui/fontLoader';
import { ORIENTATION } from './config/GameConstants';
import { audio } from './systems/AudioSystem';

document.body.dataset.layout = ORIENTATION;
// Browsers only allow audio after a user gesture.
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.unlock());

loadUiFonts().then(() => {
  document.getElementById('boot-loader')?.remove();
  const game = new Phaser.Game(GameConfig);
  // Dev builds expose the game for browser smoke tests (Playwright).
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
});
