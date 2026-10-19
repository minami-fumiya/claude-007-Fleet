import { describe, it, expect } from 'vitest';
import { hourOf, LEDGER_HOURS, ledgerText, ledgerTotals, recordLedger, resourceDelta } from '@/systems/LedgerSystem';
import { emptySave, noteLedger, progressView, switchNation, withProgress } from '@/utils/ProgressStore';
import { resources } from '@/systems/ResourceSystem';
import { Nation } from '@/types/Nation';

const H = 3_600_000;
const T0 = 1_700_000_000_000;

describe('resource ledger (#137)', () => {
  it('adds up by hour and category and drops what is older than 24 hours', () => {
    let l = recordLedger({}, 'battle', { fuel: 100, steel: 50 }, T0);
    l = recordLedger(l, 'battle', { fuel: 20 }, T0 + 1000);
    l = recordLedger(l, 'repair', { fuel: 30 }, T0 + 2 * H);
    expect(ledgerTotals(l, T0 + 2 * H)).toEqual({ battle: resources({ fuel: 120, steel: 50 }), repair: resources({ fuel: 30 }) });
    // A day later the first hour is gone, both from the totals and from the stored ledger.
    const later = recordLedger(l, 'regen', { fuel: 6 }, T0 + LEDGER_HOURS * H);
    expect(Object.keys(later).some((k) => k.startsWith(`${hourOf(T0)}:`))).toBe(false);
    expect(ledgerTotals(later, T0 + LEDGER_HOURS * H).battle).toBeUndefined();
    expect(recordLedger(l, 'build', {}, T0)).toBe(l);
  });

  it('splits a change into gains and costs, and records the right side for the category', () => {
    expect(resourceDelta(resources({ fuel: 100, ammo: 50 }), resources({ fuel: 60, ammo: 80 }))).toEqual({ gained: resources({ ammo: 30 }), spent: resources({ fuel: 40 }) });
    const spent = noteLedger({ resources: resources({ steel: 70 }), ledger: {} }, 'build', resources({ steel: 200 }), T0);
    expect(ledgerTotals(spent.ledger, T0).build).toEqual(resources({ steel: 130 }));
    const gained = noteLedger({ resources: resources({ fuel: 300 }), ledger: {} }, 'quest', resources({ fuel: 150 }), T0);
    expect(ledgerTotals(gained.ledger, T0).quest).toEqual(resources({ fuel: 150 }));
  });

  it('natural regeneration is recorded as it happens', () => {
    const save = switchNation(emptySave(), Nation.IJN, 'fubuki', T0);
    const view = progressView(save, T0 + 10 * 60_000);
    expect(ledgerTotals(view.ledger, T0 + 10 * 60_000).regen?.fuel).toBeGreaterThan(0);
    expect(progressView(withProgress(save, view), T0 + 10 * 60_000).ledger).toEqual(view.ledger);
  });

  it('writes a table for 設定 → 資源の収支をコピー', () => {
    const l = recordLedger(recordLedger({}, 'battle', { fuel: 10 }, T0), 'sortie', { fuel: 4 }, T0);
    expect(ledgerText(l, T0).split('\n')).toEqual(['収支 (直近 24 時間)\t燃料\t弾薬\t鋼材\tボーキ', '+戦闘\t10\t0\t0\t0', '-出撃\t4\t0\t0\t0']);
  });
});
