import Phaser from 'phaser';

/**
 * Shared visual tokens for every scene.
 * Dark "night ocean" base, glassy panels with a thin cyan rim, gold as the hero accent.
 */
export const Colors = {
  bgDeep: 0x020814,
  bgMid: 0x061a33,
  panel: 0x0b1d38,
  panelHi: 0x12294d,
  rim: 0x61e7ff,
  cyan: 0x61e7ff,
  blue: 0x4f8cff,
  gold: 0xffc94a,
  danger: 0xff5f7a,
  success: 0x5df2b0,
  text: 0xf5fbff,
  muted: 0x8aa0c7,
  dim: 0x4a5f85,
} as const;

/** CSS forms of the same tokens, for Text styles and canvas drawing. */
export const Css = {
  bgDeep: '#020814',
  bgMid: '#061a33',
  cyan: '#61e7ff',
  blue: '#4f8cff',
  gold: '#ffc94a',
  danger: '#ff5f7a',
  success: '#5df2b0',
  text: '#f5fbff',
  muted: '#8aa0c7',
  dim: '#4a5f85',
  ink: '#061226',
} as const;

export const Fonts = {
  display: '"Arial Black", "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Noto Sans JP", Impact, sans-serif',
  body: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Segoe UI", system-ui, sans-serif',
} as const;

/** Render text at 2x so it stays crisp when Scale.FIT enlarges the canvas. */
const TEXT_RESOLUTION = 2;

export function textStyle(
  size: number,
  color: string = Css.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: Fonts.body,
    fontSize: `${size}px`,
    color,
    resolution: TEXT_RESOLUTION,
    ...extra,
  };
}

export function displayStyle(
  size: number,
  color: string = Css.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return textStyle(size, color, { fontFamily: Fonts.display, fontStyle: '900', ...extra });
}

/** Small, letter-spaced, all-caps label used above titles and on stat cards. */
export function eyebrowStyle(
  size = 13,
  color: string = Css.cyan,
): Phaser.Types.GameObjects.Text.TextStyle {
  return textStyle(size, color, { fontStyle: 'bold', letterSpacing: Math.round(size * 0.28) });
}
