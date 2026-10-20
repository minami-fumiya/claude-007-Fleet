import { describe, it, expect } from 'vitest';
import { emptyRecord, medalProgress, parseRecord, recordBattle, scenarioWins, unsortedRecord } from '@/systems/RecordSystem';
import { ShipClass } from '@/types/ShipClass';
import { IBattleRecordInput } from '@/types/Record';

const win: IBattleRecordInput = { victory: true, sunkClasses: [ShipClass.Destroyer, ShipClass.Cruiser], damageDealt: 1200, shipsLost: 0 };
const loss: IBattleRecordInput = { victory: false, sunkClasses: [], damageDealt: 300, shipsLost: 2 };

describe('service record by kind of battle (#177)', () => {
  it('campaign battles and exercises count in the totals and in their own figures', () => {
    let r = recordBattle(emptyRecord(), win, 'campaign');
    r = recordBattle(r, loss, 'exercise');
    expect(r.sorties).toBe(2);
    expect(r.victories).toBe(1);
    expect(r.byMode?.campaign).toEqual(expect.objectContaining({ sorties: 1, victories: 1, damageDealt: 1200 }));
    expect(r.byMode?.campaign?.sunk).toEqual({ [ShipClass.Destroyer]: 1, [ShipClass.Cruiser]: 1 });
    expect(r.byMode?.exercise).toEqual(expect.objectContaining({ sorties: 1, victories: 0, shipsLost: 2 }));
  });

  it('historical scenarios stay out of the totals and keep wins and losses by side', () => {
    let r = recordBattle(emptyRecord(), win, 'scenario', { id: 'midway', force: 'A' });
    r = recordBattle(r, loss, 'scenario', { id: 'midway', force: 'B' });
    r = recordBattle(r, win, 'scenario', { id: 'midway', force: 'B' });
    r = recordBattle(r, win, 'scenario', { id: 'matapan', force: 'A' });
    expect(r.sorties).toBe(0);
    expect(r.sunk).toEqual({});
    expect(r.byMode?.scenario?.victories).toBe(3);
    expect(r.scenarios?.midway).toEqual(expect.objectContaining({ wins: { A: 1, B: 1 }, losses: { B: 1 } }));
    expect(scenarioWins(r)).toEqual({ won: 2, bothSides: 1 });
    expect(medalProgress('both_sides', r, { clearedTheaters: [] })).toEqual([1, 1]);
    expect(medalProgress('historian', r, { clearedTheaters: [] })).toEqual([2, 3]);
  });

  it('battles from before the split show as 区分なし and are never lost', () => {
    const old = parseRecord({ sorties: 10, victories: 7, perfectVictories: 3, sunk: { [ShipClass.Battleship]: 2 }, damageDealt: 9000, bestDamage: 2500, shipsLost: 4, medals: ['first_victory'] });
    expect(old.byMode).toEqual({});
    expect(old.scenarios).toEqual({});
    expect(unsortedRecord(old)).toEqual(expect.objectContaining({ sorties: 10, victories: 7, damageDealt: 9000, bestDamage: 2500 }));
    const after = recordBattle(old, win, 'campaign');
    expect(after.sorties).toBe(11);
    expect(after.medals).toEqual(['first_victory']);
    expect(unsortedRecord(after)).toEqual(expect.objectContaining({ sorties: 10, victories: 7, sunk: { [ShipClass.Battleship]: 2 } }));
    // A stored split survives a save round trip.
    expect(parseRecord(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });
});
