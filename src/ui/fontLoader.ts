import { Fonts } from '@/ui/theme';
import { UI_GLYPHS } from '@/ui/fontGlyphs';

const ASCII = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
const LOAD_TIMEOUT_MS = 6000;

/** CSS font shorthands used by Text styles (see theme.ts). */
const FONT_SPECS = [
  `400 32px ${Fonts.display}`,
  `400 16px ${Fonts.body}`,
  `700 16px ${Fonts.body}`,
  `900 16px ${Fonts.body}`,
];

/**
 * Waits until the Japanese web fonts (and the glyph slices the UI needs) are ready, so Phaser
 * rasterises text with them from the first frame. Never rejects: on a slow or offline network
 * the game starts after a timeout with system fallback fonts.
 */
export function loadUiFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const text = ASCII + UI_GLYPHS;
  const loads = Promise.all(FONT_SPECS.map((spec) => document.fonts.load(spec, text))).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, LOAD_TIMEOUT_MS));
  return Promise.race([loads, timeout]).catch(() => undefined);
}
