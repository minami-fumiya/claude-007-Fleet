import { describe, expect, it } from 'vitest';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { ShipClass } from '@/types/ShipClass';
import {
  afterBattle, BATTLE_SUPPLY, dangerAt, emptyWorld, endVoyage, HOME, MAX_DANGER, mustReturn, parseWorld, reachProblem, RING, sailTo,
  startVoyage, SUPPLY_MAX, voyageShipIds, worldEnemyClasses, worldEnemyFleet, worldEnemyScale, worldReward, worldSpots,
} from '@/systems/WorldSystem';

const NOW = Date.UTC(2026, 10, 4, 3);
const ALL = [Nation.IJN, Nation.USN, Nation.KM, Nation.RN, Nation.FR, Nation.SU, Nation.RM];

describe('0.0.65 外洋 (#65)', () => {
  it('the water grows more dangerous ring by ring from the port', () => {
    expect(dangerAt(HOME)).toBe(1);
    expect(dangerAt({ x: HOME.x, y: HOME.y - RING * 4.5 })).toBe(5);
    expect(dangerAt({ x: HOME.x, y: -5000 })).toBe(MAX_DANGER);
  });

  it('one enemy group in each ring, the same all hour, of another navy', () => {
    const spots = worldSpots(NOW, Nation.IJN, ALL);
    expect(spots.map((s) => s.danger)).toEqual(Array.from({ length: MAX_DANGER }, (_, i) => i + 1));
    expect(spots.every((s) => s.enemyNation !== Nation.IJN)).toBe(true);
    expect(worldSpots(NOW + 60_000, Nation.IJN, ALL)).toEqual(spots);
    expect(worldSpots(NOW + 3_600_000, Nation.IJN, ALL)[0].id).not.toBe(spots[0].id);
  });

  it('the fleet never sails where it could not come home from', () => {
    const v = startVoyage(['a'], [null], Formation.LineAhead, NOW);
    expect(v.supply).toBe(SUPPLY_MAX);
    const far = worldSpots(NOW, Nation.IJN, ALL)[MAX_DANGER - 1];
    expect(reachProblem(v, far)).toBeNull();
    const there = afterBattle({ ...emptyWorld(), voyage: sailTo(v, far) }, far.id, far.danger, true).voyage!;
    // From the far ring, the next far fight can't be reached and still sail home.
    expect(reachProblem(there, { x: 30, y: 30 })).not.toBeNull();
    expect(there.supply).toBeLessThan(SUPPLY_MAX - BATTLE_SUPPLY);
  });

  it('a won battle is marked and counted; a lost one or a fleet in ruins comes home', () => {
    const w = { ...emptyWorld(), voyage: startVoyage(['a'], [null], Formation.LineAhead, NOW) };
    const won = afterBattle(w, 'h:3', 4, true);
    expect(won.voyage?.cleared).toEqual(['h:3']);
    expect(won).toMatchObject({ best: 4, wins: 1 });
    expect(afterBattle(won, 'h:4', 9, false)).toMatchObject({ best: 4, wins: 1 });
    expect(mustReturn(false, [1], 0.25)).toBe(true);
    expect(mustReturn(true, [0.2, 0.1], 0.25)).toBe(true);
    expect(mustReturn(true, [0.2, 0.9], 0.25)).toBe(false);
    expect(endVoyage(won).voyage).toBeNull();
    expect(voyageShipIds(won)).toEqual(['a']);
  });

  it('far out the enemy is stronger, bigger and pays more', () => {
    expect(worldEnemyScale(10)).toBeGreaterThan(worldEnemyScale(1));
    expect(worldEnemyClasses(1).every((c) => c === ShipClass.Destroyer || c === ShipClass.Submarine)).toBe(true);
    expect(worldEnemyClasses(10)).toContain(ShipClass.Battleship);
    expect(worldEnemyClasses(10).length).toBeGreaterThan(worldEnemyClasses(1).length);
    expect(worldReward(10).steel).toBe(worldReward(1).steel * 10);
    const roster = [
      { id: 'dd1', shipClass: ShipClass.Destroyer, hp: 100, year: 1930 }, { id: 'dd2', shipClass: ShipClass.Destroyer, hp: 120, year: 1942 },
      { id: 'bb1', shipClass: ShipClass.Battleship, hp: 600, year: 1925 },
    ] as never;
    const fleet = worldEnemyFleet(roster, { id: 'x:9', danger: 9 });
    expect(fleet.some((s) => s.id === 'bb1')).toBe(true);
    // A class the navy lacks is made up from its destroyers.
    expect(fleet.length).toBe(worldEnemyClasses(9).length);
  });

  it('old saves read in port; odd voyages are dropped', async () => {
    expect(parseWorld(undefined)).toEqual(emptyWorld());
    expect(parseWorld({ voyage: { shipIds: [] }, best: 99 })).toEqual({ voyage: null, best: MAX_DANGER, wins: 0 });
    const v = parseWorld({ voyage: { shipIds: ['a'], x: 5, y: 6, supply: 500, formation: 'nope' } }).voyage!;
    expect(v).toMatchObject({ x: 5, y: 6, supply: SUPPLY_MAX, formation: Formation.LineAhead, cleared: [] });
    const { parseSave, emptySave, emptyNationProgress } = await import('@/utils/ProgressStore');
    expect(parseSave(JSON.stringify({ ...emptySave(), nations: { IJN: { ...emptyNationProgress(), world: undefined } } })).nations.IJN!.world).toEqual(emptyWorld());
  });

  it('ships at sea can\'t sail elsewhere; the open sea has its medals and a menu button', async () => {
    const { sortieBlockers } = await import('@/systems/ProgressionSystem');
    const { emptyProgress } = await import('@/utils/ProgressStore');
    const p = { ...emptyProgress(), world: { ...emptyWorld(), voyage: startVoyage(['yamato'], [null], Formation.LineAhead, NOW) } };
    const ship = { id: 'yamato', name: '大和', shipClass: ShipClass.Battleship, hp: 1, armor: 1, speed: 1, weapons: [], spriteKey: '', nation: Nation.IJN } as never;
    expect(sortieBlockers(p, [ship], NOW, { exercise: true }).some((r) => r.includes('外洋'))).toBe(true);
    const { MEDALS } = await import('@/systems/RecordSystem');
    expect(MEDALS.filter((m) => m.id.startsWith('world_')).length).toBe(6);
    const { HOME_MENU } = await import('@/systems/HomeMenu');
    expect(HOME_MENU.flatMap((t) => t.items).some((i) => i.label === '外洋')).toBe(true);
  });
});
