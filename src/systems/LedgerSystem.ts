import { IResources } from '@/types/Progression';
import { RESOURCE_KEYS, resources } from './ResourceSystem';

/**
 * Resource ledger (収支, #137, pure): what came in and went out, by category, hour by hour for the last 24 hours.
 * Kept so players (and balance work, #132) can see where a resource runs short. Old hours are dropped, so the save
 * stays small.
 */

export type LedgerCategory =
  | 'regen' | 'battle' | 'firstClear' | 'quest' | 'sweep'
  /** Resources bought with gold, and sold for it (#183) */
  | 'shop' | 'shopSell'
  | 'sortie' | 'aircraft' | 'repair' | 'build' | 'research' | 'refit' | 'dock' | 'facility' | 'captain'
  /** Income lost to the holding cap (#221): neither in nor out, shown on its own line */
  | 'overflow';

export const LEDGER_LABEL: Record<LedgerCategory, string> = {
  regen: '自然回復', battle: '戦闘', firstClear: '初回報酬', quest: '任務', sweep: '掃討', shop: 'ショップ (購入)', shopSell: 'ショップ (売却)',
  sortie: '出撃', aircraft: '艦載機補充', repair: '修理', build: '建造', research: '研究', refit: '改造', dock: 'ドック増設', facility: '軍港の施設', captain: '艦長',
  overflow: '上限で受け取れず',
};

export const INCOME: LedgerCategory[] = ['regen', 'battle', 'firstClear', 'quest', 'sweep', 'shop'];
export const SPENDING: LedgerCategory[] = ['shopSell', 'sortie', 'aircraft', 'repair', 'build', 'research', 'refit', 'dock', 'facility', 'captain'];

/** "hour:category" → resources (always positive; the category says which way they went). */
export type Ledger = Record<string, IResources>;

export const LEDGER_HOURS = 24;
const HOUR_MS = 3_600_000;

export function hourOf(now: number): number {
  return Math.floor(now / HOUR_MS);
}

/** Adds `amount` to the category's current hour and drops hours older than LEDGER_HOURS. Zero amounts are ignored. */
export function recordLedger(ledger: Ledger, category: LedgerCategory, amount: Partial<IResources>, now: number): Ledger {
  const add = resources(amount);
  if (RESOURCE_KEYS.every((k) => add[k] <= 0)) return ledger;
  const hour = hourOf(now);
  const out: Ledger = {};
  for (const [key, v] of Object.entries(ledger)) if (Number(key.split(':')[0]) > hour - LEDGER_HOURS) out[key] = v;
  const key = `${hour}:${category}`;
  const have = out[key] ?? resources();
  const sum = resources();
  for (const k of RESOURCE_KEYS) sum[k] = have[k] + Math.max(0, add[k]);
  out[key] = sum;
  return out;
}

/** What `after` gained (positive) or spent (negative turned positive) against `before`. */
export function resourceDelta(before: IResources, after: IResources): { gained: IResources; spent: IResources } {
  const gained = resources();
  const spent = resources();
  for (const k of RESOURCE_KEYS) {
    const d = after[k] - before[k];
    if (d > 0) gained[k] = d;
    else if (d < 0) spent[k] = -d;
  }
  return { gained, spent };
}

/** Totals by category over the last LEDGER_HOURS hours. */
export function ledgerTotals(ledger: Ledger, now: number): Partial<Record<LedgerCategory, IResources>> {
  const hour = hourOf(now);
  const out: Partial<Record<LedgerCategory, IResources>> = {};
  for (const [key, v] of Object.entries(ledger)) {
    const [h, c] = key.split(':');
    if (Number(h) <= hour - LEDGER_HOURS || !(c in LEDGER_LABEL)) continue;
    const cat = c as LedgerCategory;
    const have = out[cat] ?? resources();
    const sum = resources();
    for (const k of RESOURCE_KEYS) sum[k] = have[k] + v[k];
    out[cat] = sum;
  }
  return out;
}

/** Hours of the last LEDGER_HOURS that have any entry (at least 1): what per-hour figures divide by (#222). */
export function ledgerHours(ledger: Ledger, now: number): number {
  const hour = hourOf(now);
  const hours = new Set(Object.keys(ledger).map((key) => Number(key.split(':')[0])).filter((h) => h > hour - LEDGER_HOURS));
  return Math.max(1, hours.size);
}

/** The ledger as text, one line per category, for 設定 → 収支を書き出す (bug reports and balance work). */
export function ledgerText(ledger: Ledger, now: number): string {
  const totals = ledgerTotals(ledger, now);
  const line = (c: LedgerCategory, sign: string): string | null => {
    const r = totals[c];
    return r ? `${sign}${LEDGER_LABEL[c]}\t${RESOURCE_KEYS.map((k) => r[k]).join('\t')}` : null;
  };
  return [`収支 (直近 ${LEDGER_HOURS} 時間)\t燃料\t弾薬\t鋼材\tボーキ`, ...INCOME.map((c) => line(c, '+')), ...SPENDING.map((c) => line(c, '-')), line('overflow', '×')]
    .filter((l): l is string => l !== null)
    .join('\n');
}
