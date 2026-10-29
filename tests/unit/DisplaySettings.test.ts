import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '@/systems/SettingsSystem';
import { canFlip, resumeTarget } from '@/utils/OrientationWatch';
import { applyTheme, Colors, Css, resolveTheme, Surface } from '@/ui/theme';
import { SceneKeys } from '@/config/SceneKeys';

describe('表示の設定 (#94 #95)', () => {
  it('reads the theme, ruby and orientation with defaults', () => {
    expect(parseSettings('{}')).toMatchObject({ theme: 'dark', ruby: 'off', orientation: 'auto' });
    expect(parseSettings('{"theme":"light","ruby":"hard","orientation":"portrait"}')).toMatchObject({ theme: 'light', ruby: 'hard', orientation: 'portrait' });
    expect(parseSettings('{"theme":"pink","ruby":3}')).toMatchObject({ theme: DEFAULT_SETTINGS.theme, ruby: DEFAULT_SETTINGS.ruby });
  });

  it('system follows the device, the others are fixed', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('nonsense', false)).toBe('dark');
  });

  it('the light theme swaps every token, and the dark one puts them back', () => {
    const dark = { ...Colors };
    applyTheme('light');
    expect(Colors.text).not.toBe(dark.text);
    expect(Css.text).toBe(`#${Colors.text.toString(16).padStart(6, '0')}`);
    expect(Surface.sea).not.toBe('#05203f');
    applyTheme('dark');
    expect(Colors).toEqual(dark);
  });

  it('light text keeps 4.5:1 against a white panel (WCAG)', () => {
    applyTheme('light');
    const lum = (n: number): number => {
      const c = [16, 8, 0].map((s) => ((n >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: number, b: number): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const k of ['text', 'muted', 'cyan', 'gold', 'danger', 'success'] as const) expect(ratio(Colors[k], 0xffffff), k).toBeGreaterThanOrEqual(4.5);
    applyTheme('dark');
  });

  it('a layout reload reopens plain screens, never a battle', () => {
    expect(resumeTarget(SceneKeys.ENCYCLOPEDIA)).toBe(SceneKeys.ENCYCLOPEDIA);
    expect(resumeTarget(SceneKeys.BATTLE)).toBeUndefined();
    expect(resumeTarget(null)).toBeUndefined();
    expect(canFlip([SceneKeys.HOME])).toBe(true);
    expect(canFlip([SceneKeys.BATTLE])).toBe(false);
  });
});
