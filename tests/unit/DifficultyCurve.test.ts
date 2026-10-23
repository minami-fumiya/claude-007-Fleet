import { describe, it, expect } from 'vitest';
import { allowedAtDepth, areaDepth, curveText, enemyScale, scaleModifiers, theaterStep, EARLY_DEPTH, EARLY_HIGH, fleetPower, recommendedRank, targetPower, withinCurve } from '@/systems/DifficultyCurve';
import { enemyShips, lockText, sevenSeasText, theatersFor } from '@/systems/CampaignSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { SEVEN_SEAS } from '@/systems/RecordSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { RANK_MISSIONS, RANKS } from '@/systems/RankSystem';
import campaign from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';

const data = campaign as unknown as ICampaignData;
const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships, ...fr.ships, ...su.ships, ...rm.ships] as IShipData[]);
const area = (id: string) => data.areas.find((a) => a.id === id)!;

describe('the difficulty curve (#254)', () => {
  it('the target starts at 250 and grows half again each step; the rank follows the depth', () => {
    expect(targetPower(1)).toBe(250);
    expect(targetPower(2)).toBe(375);
    expect(targetPower(9)).toBe(Math.round(250 * 1.5 ** 8));
    expect(recommendedRank(1).name).toBe('准尉');
    expect(recommendedRank(2).name).toBe('少尉');
    // Two ranks above the step from the third on (#293).
    expect(recommendedRank(3).name).toBe('大尉');
    expect(recommendedRank(7).name).toBe('大佐');
    expect(recommendedRank(20).name).toBe('元帥');
    expect(fleetPower([{ hp: 100, armor: 50 }, { hp: 200, armor: 0 }])).toBe(350);
    expect(curveText(1560, 4)).toBe('1,560 (目安 844)  ·  推奨 准佐 (コスト 15)');
  });

  it('depth: the chain inside the theater; the seas of 0.0.35 start a step in (#250)', () => {
    expect(areaDepth(data, area('p1'))).toBe(1);
    expect(areaDepth(data, area('p2'))).toBe(2);
    expect(areaDepth(data, area('p6'))).toBe(8);
    // 支線 (#343): a side sea is a step past the area it opens from.
    expect(areaDepth(data, area('a9'))).toBe(areaDepth(data, area('a3')) + 1);
    // np1 opens from another theater's third area, but its depth counts from its own sea.
    expect(areaDepth(data, area('np1'))).toBe(2);
    expect(areaDepth(data, area('np5'))).toBe(8);
  });

  it('every area\'s enemy sits inside the band, for the navy it was written for and for every navy that fights there', () => {
    const out: string[] = [];
    for (const a of data.areas.filter((x) => !x.training)) {
      const depth = areaDepth(data, a);
      const written = fleetPower(enemyShips(a, registry));
      if (!withinCurve(written, depth)) out.push(`${a.id} d${depth}: ${written} vs ${targetPower(depth)}`);
      // The fleet swapped for another navy (#76) stays within twice the band's ends.
      const theater = data.theaters.find((t) => t.id === a.theater)!;
      for (const n of new Set(Object.values(theater.opponents))) {
        const p = fleetPower(enemyShips(a, registry, n!));
        if (p < targetPower(depth) * 0.2 || p > targetPower(depth) * 5) out.push(`${a.id} as ${n}: ${p}`);
      }
    }
    expect(out).toEqual([]);
  });
});

describe('the further the sea, the harder (#293)', () => {
  it('a theater\'s step is its place in the navy\'s order; for Japan the Mediterranean is the deepest', () => {
    expect(['pacific', 'north_pacific', 'indian', 'mediterranean'].map((t) => theaterStep('IJN', t))).toEqual([0, 1, 2, 3]);
    expect(theaterStep('IJN', 'arctic')).toBeUndefined();
    const last = (t: string) => data.areas.filter((a) => a.theater === t && !a.training).pop()!;
    const depths = ['pacific', 'north_pacific', 'indian', 'mediterranean'].map((t) => areaDepth(data, area(data.areas.find((a) => a.theater === t)!.id), 'IJN'));
    expect(depths).toEqual([1, 2, 3, 4]);
    expect(areaDepth(data, last('mediterranean'), 'IJN')).toBeGreaterThan(areaDepth(data, last('pacific'), 'IJN'));
    // Italy and France meet the Mediterranean first: as written.
    expect(areaDepth(data, area('m1'), 'RM')).toBe(areaDepth(data, area('m1')));
  });

  it('the enemy grows by the curve for each step further than written; hit points and firepower share it', () => {
    expect(enemyScale(data, area('m1'), 'RM')).toBe(1);
    expect(enemyScale(data, area('m1'), 'IJN')).toBeCloseTo(1.5 ** 3);
    expect(enemyScale(data, area('m1'))).toBe(1);
    const k = scaleModifiers(enemyScale(data, area('m1'), 'IJN'));
    expect(k.hpMul! * k.gunPowerMul!).toBeCloseTo(1.5 ** 3);
    expect(k.airPowerMul).toBeUndefined();
    expect(scaleModifiers(1)).toEqual({});
    // Every navy meets a sea no easier than written, and every area stays inside the band at its depth for that navy.
    const out: string[] = [];
    for (const a of data.areas.filter((x) => !x.training)) {
      const theater = data.theaters.find((t) => t.id === a.theater)!;
      for (const n of Object.keys(theater.opponents)) {
        const scale = enemyScale(data, a, n);
        if (scale < 1) out.push(`${a.id} ${n}: ${scale}`);
        const power = fleetPower(enemyShips(a, registry)) * scale;
        if (!withinCurve(power, areaDepth(data, a, n)) && withinCurve(fleetPower(enemyShips(a, registry)), areaDepth(data, a))) out.push(`${a.id} ${n}: ${Math.round(power)}`);
      }
    }
    expect(out).toEqual([]);
  });
});

describe('the opening (#268)', () => {
  it('up to depth 3 the band tops out at 1.6×; up to depth 2 no heavy cruiser, battleship or carrier, for every navy', () => {
    expect(withinCurve(targetPower(2) * 1.7, 2)).toBe(false);
    expect(withinCurve(targetPower(4) * 2.4, 4)).toBe(true);
    const out: string[] = [];
    for (const a of data.areas.filter((x) => !x.training)) {
      const depth = areaDepth(data, a);
      if (depth > EARLY_DEPTH) continue;
      const theater = data.theaters.find((t) => t.id === a.theater)!;
      for (const n of new Set([a.enemy.nation, ...Object.values(theater.opponents)])) {
        const ships = enemyShips(a, registry, n!);
        if (!withinCurve(fleetPower(ships), depth)) out.push(`${a.id} as ${n}: ${fleetPower(ships)}`);
        for (const s of ships) if (!allowedAtDepth(s, depth)) out.push(`${a.id} as ${n}: ${s.id}`);
      }
    }
    expect(out).toEqual([]);
  });

  it('a starting navy of three destroyers faces at most twice its strength in the first three steps', () => {
    for (const roster of [ijn, usn, km, rn, fr, su, rm].map((f) => f.ships as unknown as IShipData[])) {
      const destroyers = roster.filter((s) => s.shipClass === 'Destroyer' && !s.subtype).sort((x, y) => x.hp - y.hp).slice(0, 3);
      const own = fleetPower(destroyers);
      expect(targetPower(EARLY_DEPTH) * EARLY_HIGH, roster[0].nation).toBeLessThanOrEqual(own * 2);
    }
  });
});

describe('七つの海 (#250)', () => {
  it('seven seas, the Baltic and the Black Sea beside them as inland seas', () => {
    expect(SEVEN_SEAS).toEqual(['pacific', 'atlantic', 'mediterranean', 'north_pacific', 'south_atlantic', 'indian', 'arctic']);
    expect(data.theaters.filter((t) => t.inland).map((t) => t.id)).toEqual(['baltic', 'blacksea']);
    expect(data.theaters.find((t) => t.id === 'pacific')!.name).toBe('南太平洋');
  });

  it('every navy fights in at least two of the seven seas', () => {
    for (const n of PLAYABLE_NATIONS) expect(theatersFor(data, n).filter((t) => SEVEN_SEAS.includes(t.id)).length, n).toBeGreaterThanOrEqual(2);
  });

  it('a locked area says what opens it', () => {
    expect(lockText(data, area('p1'), [])).toBe('');
    expect(lockText(data, area('p2'), [])).toBe('「南洋前哨」を攻略すると開きます');
    expect(lockText(data, area('p5'), ['p1', 'p2', 'p3'])).toBe('「海峡夜戦」か「ソロモン鼠輸送」を攻略すると開きます');
    expect(lockText(data, area('np1'), [])).toBe('');
  });
});

describe('七つの海の進み具合 (#250)', () => {
  it('counts a sea once any navy has won all of it', () => {
    const all = (t: string): string[] => data.areas.filter((a) => a.theater === t && !a.training).map((a) => a.id);
    expect(sevenSeasText(data, {})).toBe('七つの海 0 / 7 制覇');
    expect(sevenSeasText(data, { IJN: { campaign: all('pacific') }, RN: { campaign: [...all('atlantic'), ...all('baltic')] } })).toBe('七つの海 2 / 7 制覇');
  });
});

describe('promotion missions and the curve (#339)', () => {
  it('no rank asks for a fight its recommended areas do not have', () => {
    // A mission that needs a kind of area (night, a carrier, a submarine, a battleship, an objective) belongs to a
    // rank at or past the recommended rank of the shallowest such area, for every nation: 中尉 asked for a night
    // battle whose first area was a 大尉 one.
    const cls = (a: ICampaignData['areas'][number]) => a.enemy.ships.map((id) => registry.byId(id)?.shipClass);
    const needs: Record<string, (a: ICampaignData['areas'][number]) => boolean> = {
      nightWin: (a) => (a as { time?: string }).time === 'Night',
      sinkCarrier: (a) => cls(a).includes(ShipClass.Carrier),
      sinkSubmarine: (a) => cls(a).includes(ShipClass.Submarine),
      sinkBattleship: (a) => cls(a).includes(ShipClass.Battleship),
      objectiveWin: (a) => String(a.objective) !== 'Annihilate',
    };
    for (const nation of PLAYABLE_NATIONS) {
      const areas = data.areas.filter((a) => !a.training);
      for (const [stat, has] of Object.entries(needs)) {
        const first = Math.min(...areas.filter(has).map((a) => areaDepth(data, a, nation)));
        const asked = Object.entries(RANK_MISSIONS).filter(([, list]) => list?.some((m) => m.stat === stat)).map(([i]) => Number(i));
        for (const rank of asked) expect(rank, `${nation} ${stat}: ${RANKS[rank].name} < ${recommendedRank(first).name}`).toBeGreaterThanOrEqual(recommendedRank(first).index);
      }
    }
  });
});
