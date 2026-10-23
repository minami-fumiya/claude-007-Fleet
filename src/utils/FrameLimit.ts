import type { FrameLimit } from '@/systems/SettingsSystem';

/** The parts of Phaser's game loop a frame limit changes (`_limitRate` is internal). */
interface ILimitLoop {
  fpsLimit: number;
  hasFpsLimit: boolean;
  _limitRate: number;
  sleep(): void;
  wake(seamless?: boolean): void;
}

/**
 * フレームの上限 (#336): caps the game loop at 30 or 60 frames a second, or lifts the cap (0, the screen's own rate:
 * 120 on a fast screen). The loop picks its step function when it wakes, so it is put to sleep and woken.
 */
export function applyFrameLimit(game: { loop: unknown }, limit: FrameLimit): void {
  const loop = game.loop as ILimitLoop;
  if (loop.fpsLimit === limit) return;
  loop.fpsLimit = limit;
  loop.hasFpsLimit = limit > 0;
  loop._limitRate = limit > 0 ? 1000 / limit : 0;
  loop.sleep();
  loop.wake(true);
}
