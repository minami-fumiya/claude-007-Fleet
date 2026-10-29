import Phaser from 'phaser';
// The colour theme (#94) goes in before anything reads a colour.
import './ui/themeBoot';
import { GameConfig } from './config/GameConfig';
import { loadUiFonts } from './ui/fontLoader';
import { ORIENTATION } from './config/GameConstants';
import { audio } from './systems/AudioSystem';
import { loadSave } from './utils/ProgressStore';
import { applyFrameLimit } from './utils/FrameLimit';
import { watchOrientation } from './utils/OrientationWatch';
import { installRuby } from './ui/RubyText';

document.body.dataset.layout = ORIENTATION;
// ふりがな (#94): readings after hard words, when the settings ask for them.
installRuby(audio.settings.ruby);
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
  // 縦横の切り替え (#95)
  watchOrientation(game);
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
});
