/**
 * 海の上の港・資源・要塞 (#445, 0.0.70). The old 外洋 chart's places (WorldSystem: two ports, an oil field, a mine,
 * a convoy route and the enemy's stronghold for each navy) stand at their real spots on the world map:
 * - a port refills the tank and patches the ships to PORT_REPAIR (the voyage goes on);
 * - an oil field or a mine pays as the fleet passes through its ring, once a game hour;
 * - the convoy waits at the start of its route: sinking it pays the convoy's resources (once a game hour);
 * - the stronghold is fought in place (batteries and a garrison), once a game week.
 * Their visits are kept in the old world record (`visits`, `forts`), so their medals keep counting.
 */
import { IFeature, IWorld, featureReady, resourceReward, FeatureKind } from '@/systems/WorldSystem';
import { WORLD_MAP, ISectorRef, dangerAt, SECTOR_PX } from '@/systems/OpenSeaSystem';
import { gameHour, gameWeek } from '@/systems/QuestSystem';
import { IResources } from '@/types/Progression';

export interface ISeaPlace extends ISectorRef {
  id: string;
  kind: FeatureKind;
  nation: string;
  name: string;
}

/** How near a convoy or a stronghold brings out its ships (as near as a group met at sea). */
export const PLACE_FIGHT_RANGE = SECTOR_PX * 1.5;

/** A navy's places on the world map. */
export function seaPlaces(nation: string): ISeaPlace[] {
  return Object.entries(WORLD_MAP.places ?? {})
    .filter(([, p]) => p.nation === nation)
    .map(([id, p]) => ({ id, kind: p.kind as FeatureKind, nation: p.nation, name: p.name, c: p.c, r: p.r }));
}

/** The danger of the water a place lies in, for the navy sailing there. */
export function placeDanger(nation: string, p: ISectorRef): number {
  return dangerAt(nation, p);
}

/** The old chart's view of a place (for featureReady and the rewards). */
export function asFeature(p: ISeaPlace, nation: string): IFeature {
  return { id: p.id, kind: p.kind, name: p.name, x: p.c, y: p.r, danger: placeDanger(nation, p) };
}

/** Whether a place pays (or fights) now: ports and resources once a game hour, the stronghold once a week. */
export function placeReady(world: Pick<IWorld, 'visits' | 'forts'> | undefined, p: ISeaPlace, nation: string, now: number): boolean {
  return featureReady(world, asFeature(p, nation), now);
}

/** The visit marked (the hour for a port, a resource or a convoy; the week for a stronghold). */
export function markPlace(world: IWorld, p: ISeaPlace, now: number): IWorld {
  if (p.kind === 'fort') return { ...world, forts: { ...(world.forts ?? {}), [p.id]: gameWeek(now) } };
  return { ...world, visits: { ...(world.visits ?? {}), [p.id]: gameHour(now) } };
}

/** What passing a resource point (or sinking the convoy) pays at its danger. */
export function placeReward(p: ISeaPlace, nation: string): IResources {
  return resourceReward(p.kind, placeDanger(nation, p));
}
