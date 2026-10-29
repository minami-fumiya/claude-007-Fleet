import { describe, expect, it } from 'vitest';
import { addCareer, emptyCareer, emptyRecord, hitRate, MEDALS, parseRecord, recordBattle } from '@/systems/RecordSystem';
import { earnedTitles, TITLES, wornTitle } from '@/systems/AdmiralTitles';
import { ShipClass } from '@/types/ShipClass';

const battle = (victory: boolean, sec: number, sunk = 0) => ({
  victory, sunkClasses: Array<ShipClass>(sunk).fill(ShipClass.Destroyer), damageDealt: 100, shipsLost: 0,
  career: { distanceNm: 30.4, shellsFired: 40, shellHits: 10, torpedoesFired: 4, torpedoHits: 1, battleSec: sec },
});

describe('通算の記録 (#92)', () => {
  it('adds up a battle and keeps the longest, the quickest win and the most sunk', () => {
    let c = addCareer(emptyCareer(), battle(true, 90, 3));
    c = addCareer(c, battle(false, 200, 1));
    c = addCareer(c, battle(true, 60, 2));
    expect(c.distanceNm).toBe(90);
    expect(c.shellsFired).toBe(120);
    expect(c.shellHits).toBe(30);
    expect(c.battleSec).toBe(350);
    expect(c.longestSec).toBe(200);
    expect(c.fastestWinSec).toBe(60);
    expect(c.mostSunk).toBe(3);
  });

  it('a loss never sets the quickest win', () => {
    expect(addCareer(emptyCareer(), battle(false, 30)).fastestWinSec).toBe(0);
  });

  it('counts campaign and exercise battles, not historical scenarios', () => {
    const r = recordBattle(emptyRecord(), battle(true, 60), 'campaign');
    expect(r.career?.shellsFired).toBe(40);
    const s = recordBattle(r, battle(true, 60), 'scenario', { id: 'x', force: 'A' });
    expect(s.career?.shellsFired).toBe(40);
  });

  it('hit rate in percent, none before the first shot', () => {
    expect(hitRate(1, 3)).toBe(33.3);
    expect(hitRate(0, 0)).toBeUndefined();
    expect(hitRate(5, 4)).toBe(100);
  });

  it('an old record reads with an empty career, a bad one without failing', () => {
    expect(parseRecord({ sorties: 3 }).career).toEqual(emptyCareer());
    expect(parseRecord({ career: { shellsFired: 'x', shellHits: -1, distanceNm: 12 } }).career?.distanceNm).toBe(12);
    expect(parseRecord({ career: null }).career?.shellsFired).toBe(0);
  });
});

describe('称号 (#92)', () => {
  it('every title names a medal that exists, and ids and names are unique', () => {
    for (const t of TITLES) expect(MEDALS.some((m) => m.id === t.medal), t.id).toBe(true);
    expect(new Set(TITLES.map((t) => t.id)).size).toBe(TITLES.length);
    expect(new Set(TITLES.map((t) => t.name)).size).toBe(TITLES.length);
  });

  it('a title is earned with its medal and shown only once earned', () => {
    expect(earnedTitles(['first_victory']).map((t) => t.id)).toEqual(['t_first']);
    expect(wornTitle({ title: 't_first', medals: ['first_victory'] })).toBe('新任提督');
    expect(wornTitle({ title: 't_first', medals: [] })).toBeUndefined();
    expect(wornTitle({ title: 'nope', medals: ['first_victory'] })).toBeUndefined();
  });

  it('the title survives a save round trip', () => {
    expect(parseRecord({ title: 't_first', medals: ['first_victory'] }).title).toBe('t_first');
    expect(parseRecord({ title: 3 }).title).toBeUndefined();
  });
});
