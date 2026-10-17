import { describe, it, expect } from 'vitest';
import { awardMedals, emptyRecord, MEDALS, newMedals, parseRecord, recordBattle, totalSunk } from '@/systems/RecordSystem';
import { ShipClass } from '@/types/ShipClass';
import campaign from '@/data/campaign.json';

const NO_CTX = { clearedTheaters: [] };

describe('RecordSystem', () => {
  it('accumulates battles', () => {
    let r = recordBattle(emptyRecord(), { victory: true, sunkClasses: [ShipClass.Battleship, ShipClass.Destroyer], damageDealt: 1200.4, shipsLost: 0 });
    r = recordBattle(r, { victory: false, sunkClasses: [ShipClass.Destroyer], damageDealt: 800, shipsLost: 2 });
    expect(r).toMatchObject({ sorties: 2, victories: 1, perfectVictories: 1, damageDealt: 2000, bestDamage: 1200, shipsLost: 2 });
    expect(r.sunk).toEqual({ [ShipClass.Battleship]: 1, [ShipClass.Destroyer]: 2 });
    expect(totalSunk(r)).toBe(3);
  });

  it('awards each medal once', () => {
    const r = recordBattle(emptyRecord(), { victory: true, sunkClasses: [], damageDealt: 3500, shipsLost: 1 });
    const earned = newMedals(r, NO_CTX).map((m) => m.id);
    expect(earned).toEqual(['first_victory', 'big_gun']);
    const awarded = awardMedals(r, newMedals(r, NO_CTX));
    expect(awarded.medals).toEqual(['first_victory', 'big_gun']);
    expect(newMedals(awarded, NO_CTX)).toEqual([]);
  });

  it('awards class and theater medals', () => {
    let r = emptyRecord();
    for (let i = 0; i < 5; i++) r = recordBattle(r, { victory: true, sunkClasses: [ShipClass.Battleship, ShipClass.Submarine], damageDealt: 100, shipsLost: 0 });
    const ids = newMedals(r, { clearedTheaters: ['atlantic'] }).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['perfect', 'battleship_slayer', 'sub_hunter', 'atlantic']));
    expect(ids).not.toContain('pacific');
  });

  it('has a theater medal for every campaign theater and unique ids', () => {
    const ids = MEDALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of campaign.theaters) expect(ids, t.id).toContain(t.id);
  });

  it('parses stored records tolerantly', () => {
    expect(parseRecord(undefined)).toEqual(emptyRecord());
    expect(parseRecord({ sorties: 3, sunk: { Battleship: 2, Bogus: 5, Cruiser: -1 }, medals: ['ace', 4], bestDamage: 'x' })).toEqual({
      ...emptyRecord(), sorties: 3, sunk: { Battleship: 2 }, medals: ['ace'],
    });
  });
});
