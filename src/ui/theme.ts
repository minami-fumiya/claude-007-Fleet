import type Phaser from 'phaser';
import { IS_PORTRAIT, IS_TOUCH_ONLY } from '@/config/GameConstants';
import { jaWordWrap } from '@/utils/JaWrap';

/**
 * Shared visual tokens for every scene.
 * Dark "night ocean" base, glassy panels with a thin cyan rim, gold as the hero accent. A light theme (#94) swaps the
 * values at start-up (applyTheme, before the game is made), so every screen reads them as before.
 */
const DARK_COLORS = {
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
};

/** Light theme (#94): dark ink on paper-white panels; accents darkened to keep 4.5:1 against white (WCAG). */
const LIGHT_COLORS: typeof DARK_COLORS = {
  bgDeep: 0xe6edf6,
  bgMid: 0xd5e2f0,
  panel: 0xffffff,
  panelHi: 0xe3f1fb,
  rim: 0x1f7fb0,
  cyan: 0x0a6f9c,
  blue: 0x2a55c4,
  gold: 0x8a5600,
  danger: 0xbf1f3a,
  success: 0x0f7a4b,
  text: 0x0b1a2e,
  muted: 0x45597a,
  dim: 0x6a7a93,
};

const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const cssOf = (c: typeof DARK_COLORS) => ({
  bgDeep: css(c.bgDeep), bgMid: css(c.bgMid), cyan: css(c.cyan), blue: css(c.blue), gold: css(c.gold), danger: css(c.danger),
  success: css(c.success), text: css(c.text), muted: css(c.muted), dim: css(c.dim), ink: '#061226',
});

export const Colors = { ...DARK_COLORS };

/** CSS forms of the same tokens, for Text styles and canvas drawing. */
export const Css = cssOf(DARK_COLORS);

/** What the drawn surfaces use beyond the tokens (#94): backdrop, sea, plain buttons and the vignette. */
export const Surface = {
  backdropTop: '#05142c',
  oceanTop: '#072447',
  oceanBottom: '#03142b',
  sea: '#05203f',
  secondaryFill: 'rgba(11,29,56,0.85)',
  vignette: 'rgba(0,0,0,0.55)',
};
const LIGHT_SURFACE: typeof Surface = {
  backdropTop: '#f4f8fc',
  oceanTop: '#cfe6f7',
  oceanBottom: '#a9cfea',
  sea: '#8fc3e6',
  secondaryFill: 'rgba(255,255,255,0.9)',
  vignette: 'rgba(40,70,110,0.12)',
};

export type ThemeName = 'dark' | 'light';
let current: ThemeName = 'dark';

/** Puts the light or dark values in place; call before the game is made (#94). */
export function applyTheme(name: ThemeName): void {
  current = name;
  Object.assign(Colors, name === 'light' ? LIGHT_COLORS : DARK_COLORS);
  Object.assign(Css, cssOf(name === 'light' ? LIGHT_COLORS : DARK_COLORS));
  if (name === 'light') Object.assign(Surface, LIGHT_SURFACE);
}

export function themeName(): ThemeName {
  return current;
}

/** The theme a settings choice gives: 'system' follows the device's dark-mode setting. */
export function resolveTheme(choice: string, prefersDark: boolean): ThemeName {
  return choice === 'light' ? 'light' : choice === 'system' ? (prefersDark ? 'dark' : 'light') : 'dark';
}

export const Fonts = {
  // Japanese web fonts loaded in index.html; system fonts are only a fallback.
  display: '"Dela Gothic One", "Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif',
  body: '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
} as const;

/** Below this size display text falls back to the body family, where Dela Gothic One turns blotchy. */
const DISPLAY_FONT_MIN_SIZE = 48;

/** Render text at 2x so it stays crisp when Scale.FIT enlarges the canvas. */
const TEXT_RESOLUTION = 2;

/**
 * Phones show the 720px-wide portrait canvas at roughly half size, so small text is enlarged
 * there (×1.5, never below 17px). On PC nothing goes below 12px. Large display text is unchanged.
 */
export function uiFontSize(size: number): number {
  if (size >= 40) return size;
  if (IS_PORTRAIT) return Math.round(Math.max(17, size * 1.5));
  // A phone held sideways (#95) shows the landscape canvas small: its text a little larger, never below 14px.
  return IS_TOUCH_ONLY ? Math.round(Math.max(14, size * 1.15)) : Math.max(12, size);
}

export function textStyle(
  size: number,
  color: string = Css.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  // Wrapped text keeps the Japanese line-breaking rules (#248): every screen's descriptions go through here.
  const wrap = extra.wordWrap?.width && !extra.wordWrap.callback ? { wordWrap: { ...extra.wordWrap, callback: jaWordWrap } } : {};
  return {
    fontFamily: Fonts.body,
    fontSize: `${uiFontSize(size)}px`,
    color,
    resolution: TEXT_RESOLUTION,
    ...extra,
    ...wrap,
  };
}

export function displayStyle(
  size: number,
  color: string = Css.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  // Dela Gothic One only reads well large; smaller headings use the body family's Black weight.
  // Dela ships a single weight, so it gets 'normal' — asking for bold would make the browser fake it.
  const font = uiFontSize(size) >= DISPLAY_FONT_MIN_SIZE
    ? { fontFamily: Fonts.display, fontStyle: 'normal' }
    : { fontFamily: Fonts.body, fontStyle: '900' };
  return textStyle(size, color, { ...font, ...extra });
}

/** Small, letter-spaced, all-caps label used above titles and on stat cards. */
export function eyebrowStyle(
  size = 13,
  color: string = Css.cyan,
): Phaser.Types.GameObjects.Text.TextStyle {
  return textStyle(size, color, { fontStyle: 'bold', letterSpacing: Math.round(uiFontSize(size) * 0.22) });
}
