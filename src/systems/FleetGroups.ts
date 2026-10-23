import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IFleetPreset, PRESET_COUNT } from './PresetSystem';

/**
 * 複数艦隊 (#84) and 友軍艦隊 (#64), pure: fleets that fight beside the one the player steers. A 支援艦隊 is one of
 * the saved setups (編成 1〜3) sailing with a mission and is the player's own (damage and experience carry over); a
 * 友軍艦隊 belongs to an ally and leaves nothing behind.
 */

export type FleetMission = 'strike' | 'escort' | 'asw' | 'air';

export const MISSIONS: FleetMission[] = ['strike', 'escort', 'asw', 'air'];

export const MISSION_LABEL: Record<FleetMission, string> = {
  strike: '打撃', escort: '護衛', asw: '対潜掃討', air: '航空支援',
};

export const MISSION_NOTE: Record<FleetMission, string> = {
  strike: '敵の主力へ向かって攻撃',
  escort: '操作中の艦隊のそばで守る',
  asw: '潜水艦を優先して攻撃',
  air: '後方から攻撃隊を出す',
};

/** A 支援艦隊 the player chose: which saved setup, and its mission. */
export interface ISupportChoice {
  preset: number;
  mission: FleetMission;
}

/** 支援艦隊 that may sail with the main fleet, by rank index: one at 少佐, two at 准将, three at 大将. */
export function supportSlots(rankIndex: number): number {
  return Math.min(PRESET_COUNT, (rankIndex >= 6 ? 1 : 0) + (rankIndex >= 9 ? 1 : 0) + (rankIndex >= 12 ? 1 : 0));
}

/**
 * The ships of each chosen 支援艦隊: the setup's ships the nation owns, none twice and none from the main fleet or an
 * earlier 支援艦隊, `unavailable` ones (docked, away, training) left out. A fleet with no ship left is dropped.
 */
export function resolveSupport(
  choices: readonly ISupportChoice[], presets: readonly (IFleetPreset | null)[], roster: readonly IShipData[], mainIds: readonly string[],
  slots: number, unavailable: (id: string) => boolean = () => false,
): Array<{ ships: IShipData[]; captainIds: (string | null)[]; mission: FleetMission; preset: number }> {
  const used = new Set(mainIds);
  const out: Array<{ ships: IShipData[]; captainIds: (string | null)[]; mission: FleetMission; preset: number }> = [];
  for (const c of choices.slice(0, slots)) {
    const preset = presets[c.preset];
    if (!preset) continue;
    const ships: IShipData[] = [];
    const captainIds: (string | null)[] = [];
    preset.slotIds.forEach((id, i) => {
      const ship = id ? roster.find((s) => s.id === id) : undefined;
      if (!ship || used.has(ship.id) || unavailable(ship.id)) return;
      used.add(ship.id);
      ships.push(ship);
      captainIds.push(preset.captainIds[i] ?? null);
    });
    if (ships.length > 0) out.push({ ships, captainIds, mission: c.mission, preset: c.preset });
  }
  return out;
}

/** Every ship of a campaign sortie in progress (#138): the main fleet and its 支援艦隊 (#84). */
export function sailingIds(sortie: { shipIds: string[]; support?: Array<{ shipIds: string[] }> } | null | undefined): string[] {
  return sortie ? [...sortie.shipIds, ...(sortie.support ?? []).flatMap((g) => g.shipIds)] : [];
}

/** The mission an AI fleet fights by when it has none given: carriers stand off and send planes, the rest strike. */
export function defaultMission(ships: readonly Pick<IShipData, 'shipClass'>[]): FleetMission {
  return ships.length > 0 && ships.every((s) => s.shipClass === ShipClass.Carrier) ? 'air' : 'strike';
}

/** Enemy ships an AI fleet goes after: submarines first on an ASW sweep (all of them when none is left). */
export function missionFoes<T extends { shipClass: ShipClass; alive: boolean }>(mission: FleetMission, foes: readonly T[]): T[] {
  if (mission !== 'asw') return [...foes];
  const subs = foes.filter((f) => f.shipClass === ShipClass.Submarine && f.alive);
  return subs.length > 0 ? subs : [...foes];
}

/** 友軍艦隊 (#64) of a campaign area: who, and when it arrives (seconds into the battle). */
export interface IAllyFleet {
  nation: string;
  ships: string[];
  /** Seconds into the battle; 0 = from the start */
  arriveSec?: number;
  /** Shown as it arrives: "米護衛空母群" */
  name?: string;
}

/** Whether an ally fleet has arrived by `elapsedSec`. */
export function allyArrived(ally: Pick<IAllyFleet, 'arriveSec'>, elapsedSec: number): boolean {
  return elapsedSec >= (ally.arriveSec ?? 0);
}
