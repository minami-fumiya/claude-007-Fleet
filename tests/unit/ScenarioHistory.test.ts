import { describe, it, expect } from 'vitest';
import { ALL_SCENARIOS } from '@/data/scenarios';
import { historicalLoser, historyComparison } from '@/systems/ScenarioSystem';
import { bothSidesPlayed, emptyRecord, medalProgress, overturnedCount, parseRecord, recordBattle } from '@/systems/RecordSystem';
import { ShipClass } from '@/types/ShipClass';
import { IBattleRecordInput } from '@/types/Record';

const byId = (id: string) => ALL_SCENARIOS.find((s) => s.id === id)!;
const win = (sunk: number, lost = 0): IBattleRecordInput => ({ victory: true, sunkClasses: Array(sunk).fill(ShipClass.Destroyer), damageDealt: 100, shipsLost: lost });
const loss: IBattleRecordInput = { victory: false, sunkClasses: [], damageDealt: 10, shipsLost: 3 };

describe('史実との比較 (#200)', () => {
  it('every scenario has its real result, losses within its own forces', () => {
    for (const sc of ALL_SCENARIOS) {
      expect(sc.history, sc.id).toBeDefined();
      expect(sc.history!.lost.A).toBeLessThanOrEqual(sc.forces.A.ships.length);
      expect(sc.history!.lost.B).toBeLessThanOrEqual(sc.forces.B.ships.length);
      expect(sc.history!.text.length).toBeGreaterThan(10);
    }
  });

  it('compares a battle with history from the side played', () => {
    const midway = byId('midway');
    expect(historicalLoser(midway)).toBe('A');
    // Japan (A) wins: history overturned.
    expect(historyComparison(midway, 'A', { victory: true, sunk: 3, lost: 1 })).toEqual({ better: true, text: expect.stringContaining('史実を覆した') });
    // America (B) sinks more and loses less than history.
    expect(historyComparison(midway, 'B', { victory: true, sunk: 6, lost: 0 })?.text).toContain('史実を上回る戦果');
    expect(historyComparison(midway, 'B', { victory: true, sunk: 5, lost: 2 })?.text).toContain('史実どおり');
    expect(historyComparison(midway, 'B', { victory: false, sunk: 1, lost: 4 })).toEqual({ better: false, text: expect.stringContaining('史実に及ばず') });
    expect(historicalLoser(byId('coral-sea'))).toBeNull();
  });

  it("keeps each side's best battle: a win first, then more sunk, then fewer lost", () => {
    let r = recordBattle(emptyRecord(), loss, 'scenario', { id: 'midway', force: 'A' });
    expect(r.scenarios?.midway.best?.A).toEqual({ victory: false, sunk: 0, lost: 3 });
    r = recordBattle(r, win(2, 1), 'scenario', { id: 'midway', force: 'A' });
    r = recordBattle(r, loss, 'scenario', { id: 'midway', force: 'A' });
    r = recordBattle(r, win(2, 0), 'scenario', { id: 'midway', force: 'A' });
    expect(r.scenarios?.midway.best?.A).toEqual({ victory: true, sunk: 2, lost: 0 });
    expect(parseRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it("medals: winning from history's losing side, both sides played, a sea area all won", () => {
    let r = emptyRecord();
    for (const id of ['midway', 'savo-island', 'matapan']) {
      const loser = historicalLoser(byId(id))!;
      r = recordBattle(r, win(3), 'scenario', { id, force: loser });
    }
    expect(overturnedCount(r)).toBe(3);
    expect(medalProgress('overturn', r, { clearedTheaters: [] })).toEqual([3, 3]);
    r = recordBattle(r, loss, 'scenario', { id: 'midway', force: 'B' });
    expect(bothSidesPlayed(r)).toBe(1);
    expect(medalProgress('chronicler', r, { clearedTheaters: [] })).toEqual([1, ALL_SCENARIOS.length]);
    expect(medalProgress('history_arctic', r, { clearedTheaters: [] })).toEqual([0, 1]);
    r = recordBattle(r, win(1), 'scenario', { id: 'north-cape', force: 'B' });
    expect(medalProgress('history_arctic', r, { clearedTheaters: [] })).toEqual([1, 1]);
  });
});
