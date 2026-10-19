import { describe, expect, it } from 'vitest';
import { ALL_CAPTAINS, CAPTAIN_DROP_CHANCE, CAPTAIN_SOURCES, captainsLeft, nationCaptains, nextCaptain, OUTSIDER_EVERY } from '@/systems/CaptainRoster';
import { aptitudeFor } from '@/systems/CaptainSystem';
import { ShipClass } from '@/types/ShipClass';

describe('when captains join (#179 #215) and who comes (#210)', () => {
  const S = (c: { skill: string } & Parameters<typeof aptitudeFor>[0], k: ShipClass): boolean => aptitudeFor(c, k) === 'S';
  const IJN = nationCaptains('IJN');

  it('a destroyer fleet draws destroyer captains; a battleship brings a battleship captain next', () => {
    const owned = [IJN[0].id];
    const dd = nextCaptain('IJN', owned, [ShipClass.Destroyer, ShipClass.Destroyer])!;
    expect(S(dd, ShipClass.Destroyer)).toBe(true);
    // Four destroyers, one battleship, destroyer captains already aboard: the battleship is shortest of captains.
    const ddCaptains = IJN.filter((c) => S(c, ShipClass.Destroyer)).slice(0, 2).map((c) => c.id);
    const bb = nextCaptain('IJN', ddCaptains, [ShipClass.Destroyer, ShipClass.Destroyer, ShipClass.Destroyer, ShipClass.Destroyer, ShipClass.Battleship])!;
    expect(S(bb, ShipClass.Battleship)).toBe(true);
  });

  it('never the same speciality twice in a row when another fits, and every fourth suits a class not owned', () => {
    let owned = [IJN[0].id];
    const skills: string[] = [IJN[0].skill];
    for (let i = 0; i < 6; i++) {
      const next = nextCaptain('IJN', owned, [ShipClass.Destroyer, ShipClass.Destroyer, ShipClass.Cruiser])!;
      if (owned.length % OUTSIDER_EVERY === OUTSIDER_EVERY - 1) {
        expect([ShipClass.Destroyer, ShipClass.Cruiser].some((k) => S(next, k)), `recruit ${owned.length + 1}`).toBe(false);
      }
      skills.push(next.skill);
      owned = [...owned, next.id];
    }
    for (let i = 2; i < skills.length; i++) expect(skills[i] === skills[i - 1] && skills[i] === skills[i - 2]).toBe(false);
  });

  it('says nobody is left once every captain has joined', () => {
    const all = IJN.map((c) => c.id);
    expect(nextCaptain('IJN', all, [ShipClass.Destroyer])).toBeUndefined();
    expect(captainsLeft('IJN', all)).toBe(0);
    expect(captainsLeft('IJN', [])).toBe(IJN.length);
  });

  it('lists the three ways in: S ranks and promotions only (#215)', () => {
    expect(CAPTAIN_SOURCES).toHaveLength(3);
    expect(CAPTAIN_SOURCES.join('')).toContain('S 評価');
    expect(CAPTAIN_SOURCES[2]).toContain(`${Math.round(CAPTAIN_DROP_CHANCE * 100)}%`);
  });
});

describe('aptitude (#188)', () => {
  it('every captain of every nation suits at least one ship class at S', () => {
    const none = ALL_CAPTAINS.filter((c) => !Object.values(ShipClass).some((k) => aptitudeFor(c, k) === 'S')).map((c) => c.id);
    expect(none).toEqual([]);
  });
});
