import { describe, it, expect } from 'vitest';
import { applyPreset, IFleetPreset, PRESET_COUNT, PRESET_MAX, presetLabel, presetSlots, withPreset } from '@/systems/PresetSystem';
import { emptySave, parseSave, switchNation, withProgress, progressView } from '@/utils/ProgressStore';
import { Formation } from '@/types/Formation';
import { Nation } from '@/types/Nation';

const preset: IFleetPreset = { slotIds: ['yamato', null, 'takao', 'fubuki'], captainIds: ['c1', null, 'c3', 'c4'], formation: Formation.Circle };

describe('PresetSystem (#33)', () => {
  it('stores a preset in its slot, padding the list', () => {
    const list = withPreset([], 1, preset);
    expect(list).toHaveLength(PRESET_COUNT);
    expect(list[0]).toBeNull();
    expect(list[1]).toEqual(preset);
    expect(withPreset(list, PRESET_MAX, preset)).toEqual(list);
    // More slots with rank (#401): a later slot pads the list up to it.
    expect(withPreset(list, 6, preset)).toHaveLength(7);
    expect(presetSlots(0)).toBe(3);
    expect(presetSlots(6)).toBe(5);
    expect(presetSlots(8)).toBe(7);
    expect(presetSlots(13)).toBe(PRESET_MAX);
  });

  it('applies onto the current slot count, dropping ships no longer offered (with their captain)', () => {
    expect(applyPreset(preset, ['yamato', 'fubuki'], 4)).toEqual({ slotIds: ['yamato', null, null, 'fubuki'], captainIds: ['c1', null, null, 'c4'] });
    expect(applyPreset(preset, ['yamato', 'takao', 'fubuki'], 2)).toEqual({ slotIds: ['yamato', null], captainIds: ['c1', null] });
    expect(applyPreset(preset, ['yamato', 'takao', 'fubuki'], 6).slotIds).toEqual(['yamato', null, 'takao', 'fubuki', null, null]);
    // The same ship twice (an old preset) is placed once.
    expect(applyPreset({ ...preset, slotIds: ['yamato', 'yamato'] }, ['yamato'], 2).slotIds).toEqual(['yamato', null]);
  });

  it('labels presets by their first ship', () => {
    const names: Record<string, string> = { yamato: '大和' };
    expect(presetLabel(preset, (id) => names[id])).toBe('大和 他2');
    expect(presetLabel({ ...preset, slotIds: ['yamato'] }, (id) => names[id])).toBe('大和');
    expect(presetLabel(null, () => undefined)).toBe('空き');
  });

  it('presets survive the save round trip, and malformed ones become empty', () => {
    let save = switchNation(emptySave(), Nation.IJN, 'fubuki', 1);
    save = withProgress(save, { ...progressView(save), presets: withPreset([], 0, preset) });
    expect(parseSave(JSON.stringify(save)).nations[Nation.IJN]?.presets).toEqual([preset, null, null]);
    const bad = parseSave(JSON.stringify({ version: 3, current: 'IJN', nations: { IJN: { presets: [5, { slotIds: ['a', 2] , formation: 'Nope' }] } } }));
    expect(bad.nations[Nation.IJN]?.presets).toEqual([null, { slotIds: ['a', null], captainIds: [], formation: Formation.LineAhead }]);
  });
});
