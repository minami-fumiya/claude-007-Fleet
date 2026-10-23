import { describe, it, expect } from 'vitest';
import { channelGain, DEFAULT_SETTINGS, parseSettings, stepVolume } from '@/systems/SettingsSystem';
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
  });

  it('parses stored settings tolerantly and keeps the old mute flag', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null, true).muted).toBe(true);
    expect(parseSettings('{"bgm":140,"sfx":"x"}')).toEqual({ bgm: 100, sfx: DEFAULT_SETTINGS.sfx, muted: false, joystick: true, keepExercise: true, encyclopediaOwnedOnly: true, customizeAll: true, lastSeenVersion: '', difficulty: 'normal', showFps: false, frameLimit: 0 });
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
