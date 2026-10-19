import { describe, expect, it } from 'vitest';
import { ALL_CAPTAINS, CAPTAIN_DROP_CHANCE, CAPTAIN_SOURCES, captainsLeft, nationCaptains, nextCaptain, OUTSIDER_EVERY, recruitCaptains } from '@/systems/CaptainRoster';
import { QUESTS } from '@/systems/QuestSystem';
import { aptitudeFor, findCaptains } from '@/systems/CaptainSystem';
import { CaptainSkill } from '@/types/Captain';
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

  it('lists the ways in: S ranks and promotions (#215), and some quests since there are 30 captains (#209)', () => {
    expect(CAPTAIN_SOURCES).toHaveLength(4);
    expect(CAPTAIN_SOURCES.join('')).toContain('S 評価');
    expect(CAPTAIN_DROP_CHANCE).toBe(0.08);
    expect(CAPTAIN_SOURCES[2]).toContain('8%');
    expect(CAPTAIN_SOURCES[3]).toContain('任務');
  });
});

describe('aptitude (#188)', () => {
  it('every captain of every nation suits at least one ship class at S', () => {
    const none = ALL_CAPTAINS.filter((c) => !Object.values(ShipClass).some((k) => aptitudeFor(c, k) === 'S')).map((c) => c.id);
    expect(none).toEqual([]);
  });
});

describe('recruits from quests and battles (#209)', () => {
  const IJN = nationCaptains('IJN');
  it('recruitCaptains adds captains, then 艦長教本 once everyone has joined', () => {
    const items = { fastRepair: 0, fastBuild: 0, captainBook: 0 };
    const start = { nation: 'IJN', captains: [IJN[0].id], items };
    const two = recruitCaptains(start, 2, [ShipClass.Destroyer]);
    expect(two.joined).toHaveLength(2);
    expect(two.progress.captains).toHaveLength(3);
    const full = recruitCaptains({ ...start, captains: IJN.map((c) => c.id) }, 2, [ShipClass.Destroyer]);
    expect(full.joined).toEqual([]);
    expect(full.books).toBe(2);
    expect(full.progress.items.captainBook).toBe(2);
  });

  it('a few weekly and one-time quests bring a captain', () => {
    const withCaptain = QUESTS.filter((q) => (q.captains ?? 0) > 0);
    expect(withCaptain.length).toBeGreaterThanOrEqual(4);
    expect(withCaptain.every((q) => q.kind === 'weekly' || q.kind === 'once')).toBe(true);
  });
});

describe('finding a captain among 30 (#209)', () => {
  const list = nationCaptains('IJN').map((c, i) => ({ ...c, level: (i * 7) % 23 + 1 }));

  it('filters by speciality or by S aptitude for a class, and sorts by level or speciality', () => {
    expect(findCaptains(list, 'all', 'join')).toEqual(list);
    const gun = findCaptains(list, CaptainSkill.Gunnery, 'join');
    expect(gun.length).toBeGreaterThanOrEqual(3);
    expect(gun.every((c) => c.skill === CaptainSkill.Gunnery)).toBe(true);
    const ss = findCaptains(list, 'apt:Submarine', 'join');
    expect(ss.length).toBeGreaterThan(0);
    expect(ss.every((c) => aptitudeFor(c, ShipClass.Submarine) === 'S')).toBe(true);
    const byLevel = findCaptains(list, 'all', 'level').map((c) => c.level);
    expect(byLevel).toEqual([...byLevel].sort((a, b) => b - a));
    const bySkill = findCaptains(list, 'all', 'skill').map((c) => c.skill);
    expect(bySkill[0]).toBe(CaptainSkill.Gunnery);
  });
});
