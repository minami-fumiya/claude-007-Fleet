import { IBattleRecordInput, IMedal, IServiceRecord } from '@/types/Record';
import { ShipClass } from '@/types/ShipClass';

/** Service record and medals (pure): career totals from every battle, and the medals they earn. */

export function emptyRecord(): IServiceRecord {
  return { sorties: 0, victories: 0, perfectVictories: 0, sunk: {}, damageDealt: 0, bestDamage: 0, shipsLost: 0, medals: [] };
}

export function totalSunk(r: IServiceRecord): number {
  return Object.values(r.sunk).reduce((a, n) => a + (n ?? 0), 0);
}

export function recordBattle(r: IServiceRecord, b: IBattleRecordInput): IServiceRecord {
  const sunk = { ...r.sunk };
  for (const c of b.sunkClasses) sunk[c] = (sunk[c] ?? 0) + 1;
  const damage = Math.max(0, Math.round(b.damageDealt));
  return {
    ...r,
    sorties: r.sorties + 1,
    victories: r.victories + (b.victory ? 1 : 0),
    perfectVictories: r.perfectVictories + (b.victory && b.shipsLost === 0 ? 1 : 0),
    sunk,
    damageDealt: r.damageDealt + damage,
    bestDamage: Math.max(r.bestDamage, damage),
    shipsLost: r.shipsLost + Math.max(0, b.shipsLost),
  };
}

/** Context medals may need beyond the record itself. */
export interface IMedalContext {
  /** Campaign theaters with every area cleared */
  clearedTheaters: string[];
}

interface IMedalRule extends IMedal {
  earned: (r: IServiceRecord, ctx: IMedalContext) => boolean;
}

const sunkOf = (r: IServiceRecord, c: ShipClass): number => r.sunk[c] ?? 0;

export const MEDALS: IMedalRule[] = [
  { id: 'first_victory', name: '初陣勝利章', description: '初めて勝利する', earned: (r) => r.victories >= 1 },
  { id: 'veteran', name: '歴戦章', description: '20 回出撃する', earned: (r) => r.sorties >= 20 },
  { id: 'perfect', name: '完全勝利章', description: '1 隻も失わずに 5 回勝利する', earned: (r) => r.perfectVictories >= 5 },
  { id: 'ace', name: '武功章', description: '累計 30 隻撃沈する', earned: (r) => totalSunk(r) >= 30 },
  { id: 'battleship_slayer', name: '戦艦撃沈章', description: '戦艦を 5 隻撃沈する', earned: (r) => sunkOf(r, ShipClass.Battleship) >= 5 },
  { id: 'carrier_slayer', name: '空母撃沈章', description: '空母を 3 隻撃沈する', earned: (r) => sunkOf(r, ShipClass.Carrier) >= 3 },
  { id: 'sub_hunter', name: '対潜章', description: '潜水艦を 5 隻撃沈する', earned: (r) => sunkOf(r, ShipClass.Submarine) >= 5 },
  { id: 'big_gun', name: '大火力章', description: '1 回の戦闘で 3000 ダメージを与える', earned: (r) => r.bestDamage >= 3000 },
  { id: 'pacific', name: '太平洋制覇章', description: '太平洋戦域の全海域を攻略する', earned: (_r, c) => c.clearedTheaters.includes('pacific') },
  { id: 'atlantic', name: '大西洋制覇章', description: '大西洋戦域の全海域を攻略する', earned: (_r, c) => c.clearedTheaters.includes('atlantic') },
  { id: 'baltic', name: 'バルト海制覇章', description: 'バルト海戦域の全海域を攻略する', earned: (_r, c) => c.clearedTheaters.includes('baltic') },
  { id: 'mediterranean', name: '地中海制覇章', description: '地中海戦域 (インド洋を含む) の全海域を攻略する', earned: (_r, c) => c.clearedTheaters.includes('mediterranean') },
];

/** Medals now earned that the record doesn't hold yet. */
export function newMedals(r: IServiceRecord, ctx: IMedalContext): IMedal[] {
  return MEDALS.filter((m) => !r.medals.includes(m.id) && m.earned(r, ctx)).map(({ id, name, description }) => ({ id, name, description }));
}

export function awardMedals(r: IServiceRecord, medals: IMedal[]): IServiceRecord {
  return { ...r, medals: [...r.medals, ...medals.map((m) => m.id).filter((id) => !r.medals.includes(id))] };
}

/** Tolerant parse of a stored record (older saves have none). */
export function parseRecord(raw: unknown): IServiceRecord {
  const r = (raw ?? {}) as Partial<IServiceRecord>;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const sunk: Partial<Record<ShipClass, number>> = {};
  for (const c of Object.values(ShipClass)) {
    const v = n((r.sunk as Record<string, unknown> | undefined)?.[c]);
    if (v > 0) sunk[c] = v;
  }
  return {
    sorties: n(r.sorties),
    victories: n(r.victories),
    perfectVictories: n(r.perfectVictories),
    sunk,
    damageDealt: n(r.damageDealt),
    bestDamage: n(r.bestDamage),
    shipsLost: n(r.shipsLost),
    medals: Array.isArray(r.medals) ? r.medals.filter((m): m is string => typeof m === 'string') : [],
  };
}
