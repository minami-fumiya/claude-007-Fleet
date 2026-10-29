import { canvasSize, detectOrientation, touchOnly } from './Layout';

/** Fixed for the session: chosen once at boot from the device's input capabilities. */
export const ORIENTATION = detectOrientation();
export const IS_PORTRAIT = ORIENTATION === 'portrait';
/** A finger-only device (#95): a phone held sideways plays the landscape layout with larger text. */
export const IS_TOUCH_ONLY = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && touchOnly({ coarsePointer: window.matchMedia('(any-pointer: coarse)').matches, finePointer: window.matchMedia('(any-pointer: fine)').matches });

const SIZE = canvasSize(ORIENTATION);
export const CANVAS_W = SIZE.width;
export const CANVAS_H = SIZE.height;

export const DEPTH_BACKGROUND = 0;
export const DEPTH_WATER_FX = 10;
export const DEPTH_SHIPS = 20;
export const DEPTH_PROJECTILES = 30;
export const DEPTH_EFFECTS = 40;
export const DEPTH_HUD = 100;
