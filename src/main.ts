import Phaser from 'phaser';
// The colour theme (#94) goes in before anything reads a colour.
import './ui/themeBoot';
import { GameConfig } from './config/GameConfig';
import { loadUiFonts } from './ui/fontLoader';
import { ORIENTATION } from './config/GameConstants';
import { audio } from './systems/AudioSystem';
import * as ProgressStore from './utils/ProgressStore';
import { loadSave, saveSave } from './utils/ProgressStore';
import { noteTune } from './systems/RecordSystem';
import { setQuestEventClock } from './systems/QuestSystem';
import { eventFor } from './systems/EventSystem';
import { applyFrameLimit } from './utils/FrameLimit';
import { watchOrientation } from './utils/OrientationWatch';
import { installRuby } from './ui/RubyText';

document.body.dataset.layout = ORIENTATION;
// ふりがな (#94): readings after hard words, when the settings ask for them.
installRuby(audio.settings.ruby);
// Read (and, for an older release's save, back up and migrate) the save before any screen touches it.
loadSave();
// イベントの任務 (#385): ordinary wins and sorties move the running event's quests.
setQuestEventClock((now) => eventFor(now, loadSave().lastSeenAt)?.kind ?? null);
// 音楽室 (#383): each tune heard goes into the shared record, for the book's tune list and the medal.
audio.onTune = (id) => {
  const save = loadSave();
  const record = noteTune(save.record, id);
  if (record !== save.record) saveSave({ ...save, record });
};
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
  // …and the save store the game itself reads (#433): a script's own import of it can be a second copy with its own
  // in-memory save, so what the battle simulator wrote never reached the battle.
  if (import.meta.env.DEV) (window as unknown as { progressStore: typeof ProgressStore }).progressStore = ProgressStore;
});
