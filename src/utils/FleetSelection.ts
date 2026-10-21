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
