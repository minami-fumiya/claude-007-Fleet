import type { ShakeLevel } from './SettingsSystem';
import type { ShipSize } from './SoundRules';

/**
 * 画面の揺れとスマホの振動 (#107, pure): how hard the camera shakes and the phone buzzes for what happens. A big
 * ship sinking shakes more than a destroyer, a far one less than a near one; the setting picks 弱 (the default, for
 * those who get motion-sick), 強 or none.
 */

export type FeedbackEvent = 'enemySunk' | 'ownSunk' | 'ownHeavy' | 'ownHit' | 'nearMiss';

const SIZE_SHAKE: Record<ShipSize, number> = { large: 0.012, medium: 0.007, small: 0.003 };
const EVENT_SHAKE: Record<Exclude<FeedbackEvent, 'enemySunk'>, number> = { ownSunk: 0.014, ownHeavy: 0.01, ownHit: 0.004, nearMiss: 0.005 };
const LEVEL_MUL: Record<ShakeLevel, number> = { off: 0, weak: 0.5, strong: 1 };
/** Shaking fades out with distance and stops past this. */
export const SHAKE_RANGE = 1600;

export interface IShake {
  durationMs: number;
  /** Phaser camera shake intensity */
  intensity: number;
}

/** The camera shake for an event (`size`: the ship's, for a sinking), or null for none. */
export function shakeFor(event: FeedbackEvent, size: ShipSize, distance: number, level: ShakeLevel): IShake | null {
  const base = event === 'enemySunk' ? SIZE_SHAKE[size] : EVENT_SHAKE[event];
  const fall = Math.max(0, 1 - Math.max(0, distance) / SHAKE_RANGE);
  const intensity = base * LEVEL_MUL[level] * fall;
  if (intensity < 0.0008) return null;
  return { intensity, durationMs: event === 'enemySunk' && size === 'large' ? 500 : event === 'ownSunk' ? 600 : 250 };
}

/** The phone's buzz (navigator.vibrate pattern, ms) for an event, or null: only what matters to the player. */
export function vibrateFor(event: FeedbackEvent, size: ShipSize, on: boolean): number[] | null {
  if (!on) return null;
  if (event === 'ownSunk') return [120, 60, 220];
  if (event === 'ownHeavy') return [150];
  if (event === 'ownHit') return [40];
  if (event === 'enemySunk') return size === 'large' ? [80, 40, 80] : null;
  return null;
}
