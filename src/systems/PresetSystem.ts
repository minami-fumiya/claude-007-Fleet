import { Formation } from '@/types/Formation';

/**
 * Saved fleet setups (#33, pure): the player keeps a few named compositions per nation and loads one
 * instead of rebuilding a big fleet slot by slot.
 */

/** Preset buttons shown at a time (a page of the row). */
export const PRESET_COUNT = 3;
/** Most presets any rank keeps (#401). */
export const PRESET_MAX = 10;

/** Saved fleets a rank keeps (#401): 3, then 5 at 少佐, 7 at 大佐 and 10 at 少将. */
export function presetSlots(rankIndex: number): number {
  return rankIndex >= 10 ? 10 : rankIndex >= 8 ? 7 : rankIndex >= 6 ? 5 : PRESET_COUNT;
}

/** The rank index that opens more preset slots after `rankIndex`, or null at the top. */
export function nextPresetRank(rankIndex: number): number | null {
  return [6, 8, 10].find((r) => r > rankIndex) ?? null;
}

export interface IFleetPreset {
  slotIds: (string | null)[];
  captainIds: (string | null)[];
  formation: Formation;
}

/** `presets` with slot `index` replaced (the list is padded with nulls up to the slot used). */
export function withPreset(presets: (IFleetPreset | null)[], index: number, preset: IFleetPreset): (IFleetPreset | null)[] {
  const ok = index >= 0 && index < PRESET_MAX;
  const out = Array.from({ length: Math.min(PRESET_MAX, Math.max(PRESET_COUNT, presets.length, ok ? index + 1 : 0)) }, (_, i) => presets[i] ?? null);
  if (ok) out[index] = preset;
  return out;
}

/**
 * A preset laid onto `slotCount` slots: ships the nation no longer offers (or that are already placed) become
 * empty slots, captains follow their ship, and anything beyond the slot count is dropped.
 */
export function applyPreset(preset: IFleetPreset, offeredIds: string[], slotCount: number): { slotIds: (string | null)[]; captainIds: (string | null)[] } {
  const used = new Set<string>();
  const slotIds: (string | null)[] = [];
  const captainIds: (string | null)[] = [];
  for (let i = 0; i < slotCount; i++) {
    const id = preset.slotIds[i] ?? null;
    const ok = id !== null && offeredIds.includes(id) && !used.has(id);
    if (ok) used.add(id);
    slotIds.push(ok ? id : null);
    captainIds.push(ok ? preset.captainIds[i] ?? null : null);
  }
  return { slotIds, captainIds };
}

/** "大和 ほか 3 隻" style label, or 空き for an unused preset. */
export function presetLabel(preset: IFleetPreset | null, nameOf: (id: string) => string | undefined): string {
  const ids = (preset?.slotIds ?? []).filter((id): id is string => id !== null);
  if (ids.length === 0) return '空き';
  const first = nameOf(ids[0]) ?? ids[0];
  return ids.length === 1 ? first : `${first} 他${ids.length - 1}`;
}
