import { IShipData } from '@/types/Ship';
import { IServiceRecord } from '@/types/Record';
import { ShipClass } from '@/types/ShipClass';
import { BASES } from './BaseSystem';
import type { FacilityId } from './FacilitySystem';
import { IMedalContext, medalProgress, MEDALS } from './RecordSystem';

/**
 * Medals as prerequisites (#169, pure): some research, the biggest ships and the upper facility levels need a medal
 * on top of their usual conditions. Nothing a 少尉〜少佐 touches (destroyers, light cruisers, level 1〜2 facilities,
 * the first research levels) asks for one, so the opening never stalls. What is already built or researched stays.
 */

/** Research id → medal id: every branch asks for a medal of its field at level 5 and 10 (#298). */
export const RESEARCH_MEDALS: Readonly<Record<string, string>> = {
  gunnery_5: 'big_gun',
  gunnery_10: 'battleship_slayer_2',
  torpedo_5: 'destroyer_slayer',
  torpedo_10: 'night_fighter_2',
  armor_5: 'perfect',
  armor_10: 'perfect_2',
  damage_control_5: 'veteran',
  damage_control_10: 'spotless_2',
  engine_5: 'veteran',
  engine_10: 'veteran_3',
  radar_5: 'explorer',
  radar_10: 'explorer_3',
  aa_5: 'anti_air',
  aa_10: 'anti_air_2',
  aviation_5: 'carrier_slayer',
  aviation_10: 'carrier_slayer_2',
  asw_5: 'sub_hunter',
  asw_10: 'sub_hunter_2',
  night_5: 'night_fighter',
  night_10: 'night_fighter_2',
  logistics_5: 'shipwright_2',
  logistics_10: 'build_done_2',
  build_cruiser: 'cruiser_slayer',
  build_fast_battleship: 'battleship_slayer',
  build_light_carrier: 'carrier_slayer',
  fictional_ships: 'ace',
};

/** Ship grade from which battleships and carriers need their class's sinking medal. */
export const BIG_SHIP_GRADE = 4;

export function researchMedal(id: string): string | undefined {
  return RESEARCH_MEDALS[id];
}

/** The medal a ship's build needs (`grade` from ShipyardSystem.shipGrade): the biggest battleships and carriers, and the fictional designs. */
export function shipMedal(ship: Pick<IShipData, 'shipClass' | 'fictional'>, grade: number): string | undefined {
  if (ship.fictional) return 'ace';
  if (grade < BIG_SHIP_GRADE) return undefined;
  if (ship.shipClass === ShipClass.Battleship) return 'battleship_slayer';
  if (ship.shipClass === ShipClass.Carrier) return 'carrier_slayer';
  return undefined;
}

/**
 * The medal raising a facility to `level` needs: the base's own facility at Lv3 asks for one of its theaters'
 * 制覇章, the common ones from Lv4 a medal of their field.
 */
export function facilityMedal(base: string, id: FacilityId, level: number): string | undefined {
  if (id === 'unique') return level >= 3 ? BASES.find((b) => b.id === base)?.theaters?.[0] ?? 'explorer' : undefined;
  if (level < 4) return undefined;
  return ({ fuelTank: 'builder', ammoDepot: 'builder', steelMill: 'shipwright', airBase: 'carrier_slayer', workshop: 'veteran' } as Record<string, string>)[id];
}

export function hasMedal(record: Pick<IServiceRecord, 'medals'>, id: string | undefined): boolean {
  return !id || record.medals.includes(id);
}

export function medalName(id: string): string {
  return MEDALS.find((m) => m.id === id)?.name ?? id;
}

/** "要勲章: 戦艦撃沈章 三等 (戦艦を 5 隻撃沈する — 3 / 5)" */
export function medalNeedText(id: string, record?: IServiceRecord, ctx?: IMedalContext): string {
  const m = MEDALS.find((x) => x.id === id);
  if (!m) return `要勲章: ${id}`;
  const progress = record && ctx ? medalProgress(id, record, ctx) : null;
  return `要勲章: ${m.name} (${m.description}${progress ? ` — ${progress[0].toLocaleString()} / ${progress[1].toLocaleString()}` : ''})`;
}

/** What a medal opens (#169), for the medal case: research ids, and words for the ships and facilities. */
export function unlocksOf(medalId: string): { research: string[]; other: string[] } {
  const research = Object.keys(RESEARCH_MEDALS).filter((id) => RESEARCH_MEDALS[id] === medalId);
  const other: string[] = [];
  if (medalId === 'battleship_slayer') other.push(`戦艦 (格 ${BIG_SHIP_GRADE} 以上) の建造`);
  if (medalId === 'carrier_slayer') other.push(`空母 (格 ${BIG_SHIP_GRADE} 以上) の建造`, '航空基地 Lv4〜');
  if (medalId === 'ace') other.push('架空艦の建造');
  if (medalId === 'builder') other.push('燃料タンク・弾薬庫 Lv4〜');
  if (medalId === 'shipwright') other.push('製鋼所 Lv4〜');
  if (medalId === 'veteran') other.push('工作部 Lv4〜');
  if (['pacific', 'atlantic', 'mediterranean', 'baltic', 'blacksea'].includes(medalId)) other.push('その戦域の軍港の固有施設 Lv3');
  return { research, other };
}
