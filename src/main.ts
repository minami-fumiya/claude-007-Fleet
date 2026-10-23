import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { loadUiFonts } from './ui/fontLoader';
import { ORIENTATION } from './config/GameConstants';
import { audio } from './systems/AudioSystem';
import { loadSave } from './utils/ProgressStore';
import { applyFrameLimit } from './utils/FrameLimit';

document.body.dataset.layout = ORIENTATION;
// Read (and, for an older release's save, back up and migrate) the save before any screen touches it.
loadSave();
// Browsers only allow audio after a user gesture.
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.unlock());

loadUiFonts().then(() => {
  document.getElementById('boot-loader')?.remove();
  const game = new Phaser.Game(GameConfig);
  // フレームの上限 (#336) from the settings.
  game.events.once(Phaser.Core.Events.READY, () => applyFrameLimit(game, audio.settings.frameLimit));
  // Dev builds expose the game for browser smoke tests (Playwright).
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
});
