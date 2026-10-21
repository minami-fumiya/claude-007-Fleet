import Phaser from 'phaser';
import { Nation } from '@/types/Nation';

/**
 * The fleet last set up in the builder, by nation (#77), kept in the game registry for the session. Read by the
 * campaign map too, to weigh that fleet against an area's enemy (#280).
 */
export const SELECTION_KEY = 'fleetBuilder.selections';

/** The ship ids of `nation`'s last fleet (empty slots left out). */
export function selectedShipIds(registry: Phaser.Data.DataManager, nation: Nation): string[] {
  const all = registry.get(SELECTION_KEY) as Partial<Record<Nation, { slotIds: (string | null)[] }>> | undefined;
  return (all?.[nation]?.slotIds ?? []).filter((id): id is string => !!id);
}

/**
 * Where each captain of a fleet serves (#299): captain id → "旗艦" for the first ship, "2 番艦", "3 番艦" … for the
 * rest, in line order. Slots without a ship are skipped (their captain does not sail).
 */
export function captainPlaces(slotIds: readonly (string | null)[], captainIds: readonly (string | null)[]): Map<string, string> {
  const out = new Map<string, string>();
  let place = 0;
  slotIds.forEach((ship, i) => {
    if (!ship) return;
    place += 1;
    const id = captainIds[i];
    if (id) out.set(id, place === 1 ? '旗艦' : `${place} 番艦`);
  });
  return out;
}

/** The captains of `nation`'s last fleet and their places (#299). */
export function fleetCaptainPlaces(registry: Phaser.Data.DataManager, nation: Nation): Map<string, string> {
  const all = registry.get(SELECTION_KEY) as Partial<Record<Nation, { slotIds: (string | null)[]; captainIds?: (string | null)[] }>> | undefined;
  const sel = all?.[nation];
  return sel ? captainPlaces(sel.slotIds, sel.captainIds ?? []) : new Map();
}
