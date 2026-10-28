import { describe, it, expect } from 'vitest';
import { channelGain, COMMENTARY_RATES, DEFAULT_SETTINGS, nextChoice, parseSettings, SHAKE_LEVELS, stepVolume } from '@/systems/SettingsSystem';
import { decodeSave, encodeSave, SAVE_PREFIX } from '@/systems/SaveCodec';
import { emptyProgress, emptySave, withProgress } from '@/utils/ProgressStore';
import { Nation } from '@/types/Nation';

describe('SettingsSystem', () => {
  it('steps and clamps volumes', () => {
    expect(stepVolume(95, 1)).toBe(100);
    expect(stepVolume(5, -1)).toBe(0);
    expect(stepVolume(50, 2)).toBe(70);
  });

  it('scales channel gain by volume and mute', () => {
    expect(channelGain(0.5, 50, false)).toBeCloseTo(0.25);
    expect(channelGain(0.5, 100, true)).toBe(0);
    expect(channelGain(0.5, 100, false, false)).toBe(0);
  });

  it('reads the 0.0.49 sound settings with defaults from older data (#105 #106 #107)', () => {
    const old = parseSettings('{"bgm":50,"sfx":60,"muted":false}');
    expect(old).toMatchObject({ voice: 80, commentary: 80, bgmOn: true, sfxOn: true, voiceOn: true, commentaryOn: true, nationalBgm: true, commentaryRate: 'normal', subtitles: true, shake: 'weak', vibrate: true });
    expect(parseSettings('{"voiceOn":false,"commentary":130,"commentaryRate":"many","shake":"huge","vibrate":false}')).toMatchObject({ voiceOn: false, commentary: 100, commentaryRate: 'many', shake: 'weak', vibrate: false });
    expect(nextChoice(SHAKE_LEVELS, 'off')).toBe('weak');
    expect(nextChoice(COMMENTARY_RATES, 'few')).toBe('normal');
  });

  it('parses stored settings tolerantly and keeps the old mute flag', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null, true).muted).toBe(true);
    expect(parseSettings('{"bgm":140,"sfx":"x"}')).toEqual({ ...DEFAULT_SETTINGS, bgm: 100 });
    expect(parseSettings('{"frameLimit":30}').frameLimit).toBe(30);
    expect(parseSettings('{"frameLimit":45}').frameLimit).toBe(0);
    expect(parseSettings('{"showFps":true}').showFps).toBe(true);
    expect(parseSettings('{"keepExercise":false}').keepExercise).toBe(false);
    expect(parseSettings('not json', true)).toEqual({ ...DEFAULT_SETTINGS, muted: true });
  });

  it('shows the touch stick by default and remembers hiding it (#46)', () => {
    expect(DEFAULT_SETTINGS.joystick).toBe(true);
    expect(parseSettings('{"bgm":50}').joystick).toBe(true);
    expect(parseSettings('{"joystick":false}').joystick).toBe(false);
    expect(parseSettings('{"joystick":"no"}').joystick).toBe(true);
  });
});

describe('SaveCodec', () => {
  it('round-trips the whole save, including Japanese text and whitespace from pasting', () => {
    const p = withProgress(emptySave(), { ...emptyProgress(), campaign: ['p1', 'a2'], research: ['gunnery_1'], captainXp: { 山本: 120 } });
    const code = encodeSave(p);
    expect(code.startsWith(SAVE_PREFIX)).toBe(true);
    const spaced = code.slice(0, 20) + '\n  ' + code.slice(20);
    expect(decodeSave(spaced)).toEqual(p);
  });

  it('rejects codes that are not saves', () => {
    expect(decodeSave('')).toBeNull();
    expect(decodeSave('hello')).toBeNull();
    expect(decodeSave(SAVE_PREFIX + '!!!')).toBeNull();
    expect(decodeSave(SAVE_PREFIX + btoa('[1,2]'))).toBeNull();
    // An old (v1) code is migrated like a v1 save: everything into the IJN slot.
    const v1 = decodeSave(SAVE_PREFIX + btoa('{"campaign":"x"}'))!;
    expect(v1.current).toBe(Nation.IJN);
    expect(v1.nations[Nation.IJN]?.campaign).toEqual([]);
  });
});
