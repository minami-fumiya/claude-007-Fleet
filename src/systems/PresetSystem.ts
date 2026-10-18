import { Formation } from '@/types/Formation';

/**
 * Saved fleet setups (#33, pure): the player keeps a few named compositions per nation and loads one
 * instead of rebuilding a big fleet slot by slot.
 */

export const PRESET_COUNT = 3;

export interface IFleetPreset {
  slotIds: (string | null)[];
  captainIds: (string | null)[];
  formation: Formation;
}

/** `presets` with slot `index` replaced (the list is padded with nulls up to PRESET_COUNT). */
export function withPreset(presets: (IFleetPreset | null)[], index: number, preset: IFleetPreset): (IFleetPreset | null)[] {
  const out = Array.from({ length: PRESET_COUNT }, (_, i) => presets[i] ?? null);
  if (index >= 0 && index < PRESET_COUNT) out[index] = preset;
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
