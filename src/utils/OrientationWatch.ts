import type Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { ORIENTATION } from '@/config/GameConstants';
import { detectOrientation } from '@/config/Layout';

/**
 * 縦横の切り替え (#95): when a phone is turned (or the window changes shape) so that the other layout fits, the game
 * reloads in that layout and opens the screen that was open. A battle is never thrown away: during one, a note asks
 * to turn the phone back, and the layout changes after it.
 */

const RESUME_KEY = 'ww2fleet.resume';
/** Screens that open without anything handed to them, and so can be reopened after the reload. */
const RESUMABLE: readonly string[] = [
  SceneKeys.HOME, SceneKeys.SETTINGS, SceneKeys.RECORD, SceneKeys.ENCYCLOPEDIA, SceneKeys.CAPTAIN, SceneKeys.BASE,
  SceneKeys.SHOP, SceneKeys.ITEMS, SceneKeys.EXPEDITION, SceneKeys.HELP, SceneKeys.CAMPAIGN, SceneKeys.SCENARIO, SceneKeys.ARSENAL,
];
/** Screens a reload would cut short: the layout waits for them to end. */
const BUSY: readonly string[] = [SceneKeys.BATTLE, SceneKeys.RESULTS];

/** The screen to open after a reload for `key`, or undefined for the title screen (pure). */
export function resumeTarget(key: string | null): string | undefined {
  return key && RESUMABLE.includes(key) ? key : undefined;
}

/** Whether the layout may change while `active` screens are open (pure). */
export function canFlip(active: readonly string[]): boolean {
  return !active.some((k) => BUSY.includes(k));
}

/** The screen to open after a layout reload, taken once. */
export function takeResume(): string | undefined {
  try {
    const key = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    return resumeTarget(key);
  } catch {
    return undefined;
  }
}

/** Reloads the page and reopens `key` after it (the theme and the layout are read once at start-up). */
export function reloadAt(key: string | undefined): void {
  try {
    if (key) sessionStorage.setItem(RESUME_KEY, key);
  } catch {
    // Storage blocked: the reload opens the title screen.
  }
  window.location.reload();
}

let note: HTMLDivElement | null = null;

function showNote(on: boolean): void {
  if (on && !note) {
    note = document.createElement('div');
    note.textContent = '戦闘中は画面の向きを変えられません。元の向きに戻してください (戦闘の後に切り替わります)';
    Object.assign(note.style, {
      position: 'fixed', left: '0', right: '0', top: '0', padding: '10px 16px', background: 'rgba(2,8,20,0.9)', color: '#ffc94a',
      font: 'bold 14px sans-serif', textAlign: 'center', zIndex: '20',
    });
    document.body.appendChild(note);
  } else if (!on && note) {
    note.remove();
    note = null;
  }
}

/** Watches the window and reloads in the other layout when it fits better (#95). */
export function watchOrientation(game: Phaser.Game): void {
  let timer = 0;
  const check = (): void => {
    const want = detectOrientation();
    if (want === ORIENTATION) {
      showNote(false);
      return;
    }
    const active = game.scene.getScenes(true).map((s) => s.scene.key);
    if (!canFlip(active)) {
      showNote(active.includes(SceneKeys.BATTLE));
      return;
    }
    reloadAt(active.find((k) => RESUMABLE.includes(k)));
  };
  const later = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, 400);
  };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  // A battle that ended while the phone was turned: switch then.
  game.events.on('step', () => {
    if (note && canFlip(game.scene.getScenes(true).map((s) => s.scene.key))) check();
  });
}
