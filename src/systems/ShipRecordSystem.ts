import { ShipClass } from '@/types/ShipClass';

/**
 * 艦ごとの戦歴 (#416 #387, pure): what each ship of the fleet has done, for the book and the refit screen, and each
 * superweapon's history against the admiral.
 */
export interface IShipRecord {
  /** Battles fought in (as part of any fleet of the player's) */
  battles: number;
  /** Enemies it gave the last blow to, by class */
  sunk: Partial<Record<ShipClass, number>>;
  /** Most enemies it sank in one battle */
  best: number;
  /** Battles it came out of heavily damaged or sunk */
  heavy: number;
}

export interface IGiantRecord {
  fought: number;
  sunk: number;
  /** Fastest battle (seconds) in which it was sunk */
  bestSec?: number;
}

export function emptyShipRecord(): IShipRecord {
  return { battles: 0, sunk: {}, best: 0, heavy: 0 };
}

export function sunkTotal(r: Pick<IShipRecord, 'sunk'> | undefined): number {
  return Object.values(r?.sunk ?? {}).reduce((s, n) => s + (n ?? 0), 0);
}

/** One battle's part for one ship: the classes it sank and whether it came out badly hurt. */
export function addBattle(r: IShipRecord | undefined, sank: readonly ShipClass[], heavy: boolean): IShipRecord {
  const base = r ?? emptyShipRecord();
  const sunk = { ...base.sunk };
  for (const c of sank) sunk[c] = (sunk[c] ?? 0) + 1;
  return { battles: base.battles + 1, sunk, best: Math.max(base.best, sank.length), heavy: base.heavy + (heavy ? 1 : 0) };
}

export function addGiantBattle(r: IGiantRecord | undefined, sunk: boolean, seconds: number): IGiantRecord {
  const base = r ?? { fought: 0, sunk: 0 };
  const bestSec = sunk ? Math.min(base.bestSec ?? Infinity, Math.round(seconds)) : base.bestSec;
  return { fought: base.fought + 1, sunk: base.sunk + (sunk ? 1 : 0), ...(bestSec !== undefined && Number.isFinite(bestSec) ? { bestSec } : {}) };
}

const CLASS_SHORT: Record<ShipClass, string> = {
  [ShipClass.Battleship]: '戦',
  [ShipClass.Carrier]: '空',
  [ShipClass.Cruiser]: '巡',
  [ShipClass.Destroyer]: '駆',
  [ShipClass.Submarine]: '潜',
};

/** "出撃 12・撃沈 8 (駆 5・巡 3)・最多 3 隻・大破 2" — '' before the first battle. */
export function shipRecordText(r: IShipRecord | undefined): string {
  if (!r || r.battles === 0) return '';
  const total = sunkTotal(r);
  const by = (Object.keys(CLASS_SHORT) as ShipClass[]).filter((c) => (r.sunk[c] ?? 0) > 0).map((c) => `${CLASS_SHORT[c]} ${r.sunk[c]}`);
  return `出撃 ${r.battles}・撃沈 ${total}${by.length > 0 ? ` (${by.join('・')})` : ''}${r.best > 1 ? `・最多 ${r.best} 隻` : ''}${r.heavy > 0 ? `・大破 ${r.heavy}` : ''}`;
}

/** "戦った 4 回・撃沈 2 回・最短 3:12" */
export function giantRecordText(r: IGiantRecord | undefined): string {
  if (!r || r.fought === 0) return '';
  const best = r.bestSec !== undefined ? `・最短 ${Math.floor(r.bestSec / 60)}:${String(r.bestSec % 60).padStart(2, '0')}` : '';
  return `戦った ${r.fought} 回・撃沈 ${r.sunk} 回${best}`;
}

/** Totals of several navies' records of the same superweapon (the book shows them together). */
export function mergeGiantRecords(list: ReadonlyArray<IGiantRecord | undefined>): IGiantRecord | undefined {
  const real = list.filter((r): r is IGiantRecord => r !== undefined);
  if (real.length === 0) return undefined;
  const best = real.map((r) => r.bestSec).filter((v): v is number => v !== undefined);
  return { fought: real.reduce((s, r) => s + r.fought, 0), sunk: real.reduce((s, r) => s + r.sunk, 0), ...(best.length > 0 ? { bestSec: Math.min(...best) } : {}) };
}

/** Read from a save: anything missing or odd is dropped. */
export function parseShipRecords(raw: unknown): Record<string, IShipRecord> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, IShipRecord> = {};
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const sunk: Partial<Record<ShipClass, number>> = {};
    for (const c of Object.values(ShipClass)) if (num((o.sunk as Record<string, unknown> | undefined)?.[c]) > 0) sunk[c] = num((o.sunk as Record<string, unknown>)[c]);
    out[id] = { battles: num(o.battles), sunk, best: num(o.best), heavy: num(o.heavy) };
  }
  return out;
}

export function parseGiantRecords(raw: unknown): Record<string, IGiantRecord> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, IGiantRecord> = {};
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    out[id] = { fought: num(o.fought), sunk: num(o.sunk), ...(typeof o.bestSec === 'number' && o.bestSec > 0 ? { bestSec: o.bestSec } : {}) };
  }
  return out;
}
