import { describe, it, expect } from 'vitest';
import { allowedAtDepth, areaDepth, areaRankIndex, NAVY_ENEMY_SCALE, curveText, enemyScale, scaleModifiers, theaterStep, EARLY_DEPTH, EARLY_HIGH, fleetPower, recommendedRank, targetPower, withinCurve, writtenDepth } from '@/systems/DifficultyCurve';
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
    // Past 少将 the curve grows slower (#358): fleets stop growing about there.
    expect(targetPower(10)).toBe(Math.round(250 * 1.5 ** 8 * 1.15));
    expect(recommendedRank(1).name).toBe('准尉');
    expect(recommendedRank(2).name).toBe('少尉');
    // 中尉 has its own step (#358: no area was meant for it).
    expect(recommendedRank(2.5).name).toBe('中尉');
    // Two ranks above the step from the third on (#293).
    expect(recommendedRank(3).name).toBe('大尉');
    expect(recommendedRank(7).name).toBe('大佐');
    expect(recommendedRank(20).name).toBe('元帥');
    expect(fleetPower([{ hp: 100, armor: 50 }, { hp: 200, armor: 0 }])).toBe(350);
    expect(curveText(1560, 4)).toBe('1,560 (目安 844)  ·  推奨 准佐 (コスト 15・総戦力 1,560)');
  });

  it('written depth: the chain inside the theater; the seas of 0.0.35 start a step in (#250)', () => {
    expect(writtenDepth(data, area('p1'))).toBe(1);
    expect(writtenDepth(data, area('p2'))).toBe(2);
    expect(writtenDepth(data, area('p6'))).toBe(8);
    // 支線 (#343): a side sea is a step past the area it opens from.
    expect(writtenDepth(data, area('a9'))).toBe(writtenDepth(data, area('a3')) + 1);
    // np1 opens from another theater's third area, but its depth counts from its own sea.
    expect(writtenDepth(data, area('np1'))).toBe(2);
    expect(writtenDepth(data, area('np5'))).toBe(8);
  });

  it('a theater\'s ten areas take ten ranks in a row, never two the same, for every navy (#358 案 A)', () => {
    const out: string[] = [];
    for (const nation of PLAYABLE_NATIONS) {
      for (const t of theatersFor(data, nation)) {
        const ranks = data.areas.filter((a) => a.theater === t.id && !a.training).map((a) => areaRankIndex(data, a, nation)).sort((x, y) => x - y);
        const start = Math.min(1 + (theaterStep(nation, t.id) ?? 0), 4);
        const want = ranks.map((_, i) => start + i);
        if (ranks.join() !== want.join()) out.push(`${nation} ${t.id}: ${ranks.join(' ')}`);
      }
    }
    expect(out).toEqual([]);
    // Japan's first sea runs 准尉 to 少将, its farthest 大尉 to 元帥; 中尉 is somebody's recommended rank now.
    const names = (t: string) => data.areas.filter((a) => a.theater === t).map((a) => areaRankIndex(data, a, 'IJN')).sort((x, y) => x - y).map((i) => RANKS[i].name);
    expect(names('pacific')).toEqual(['准尉', '少尉', '中尉', '大尉', '准佐', '少佐', '中佐', '大佐', '准将', '少将']);
    expect(names('mediterranean')[0]).toBe('大尉');
    expect(names('mediterranean')[9]).toBe('元帥');
  });

  it('every area\'s enemy sits inside the band, for the navy it was written for and for every navy that fights there', () => {
    const out: string[] = [];
    for (const a of data.areas.filter((x) => !x.training)) {
      const depth = writtenDepth(data, a);
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
    const ranks = ['pacific', 'north_pacific', 'indian', 'mediterranean'].map((t) => areaRankIndex(data, area(data.areas.find((a) => a.theater === t)!.id), 'IJN'));
    // 准尉, 少尉, 中尉, 大尉: a far sea starts higher, but never above 大尉 (#358).
    expect(ranks).toEqual([1, 2, 3, 4]);
    expect(areaDepth(data, last('mediterranean'), 'IJN')).toBeGreaterThan(areaDepth(data, last('pacific'), 'IJN'));
    // Italy and France meet the Mediterranean first: as written.
    expect(areaDepth(data, area('m1'), 'RM')).toBe(areaDepth(data, area('m1')));
  });

  it('the enemy keeps its share of the target at the depth of its recommended rank; hit points and firepower share it', () => {
    expect(enemyScale(data, area('m1'), 'RM')).toBe(1);
    // Japan meets m1 at 大尉 (depth 3), two steps past where it was written.
    expect(enemyScale(data, area('m1'), 'IJN')).toBeCloseTo(targetPower(3) / targetPower(1));
    expect(enemyScale(data, area('m1'))).toBe(1);
    const k = scaleModifiers(enemyScale(data, area('m1'), 'IJN'));
    expect(k.hpMul! * k.gunPowerMul!).toBeCloseTo(targetPower(3) / targetPower(1));
    expect(k.airPowerMul).toBeUndefined();
    expect(scaleModifiers(1)).toEqual({});
    // Every area stays inside the band at its depth for every navy that fights there.
    const out: string[] = [];
    for (const a of data.areas.filter((x) => !x.training)) {
      const theater = data.theaters.find((t) => t.id === a.theater)!;
      for (const n of Object.keys(theater.opponents)) {
        const power = fleetPower(enemyShips(a, registry)) * enemyScale(data, a, n);
        if (!withinCurve(power, areaDepth(data, a, n))) out.push(`${a.id} ${n}: ${Math.round(power)} vs ${targetPower(areaDepth(data, a, n))}`);
      }
    }
    expect(out).toEqual([]);
  });

  it('no area is suddenly much harder than the one before it in its theater (#358: 南太平洋 4 was 1.9× its target after 1.0×)', () => {
    const out: string[] = [];
    for (const t of data.theaters) {
      const ratios = data.areas.filter((a) => a.theater === t.id && !a.training)
        .sort((x, y) => areaRankIndex(data, x) - areaRankIndex(data, y))
        .map((a) => ({ id: a.id, r: fleetPower(enemyShips(a, registry)) / targetPower(writtenDepth(data, a)) }));
      // The opening area is one ship by design (#25), so the step after it is not counted.
      ratios.forEach((x, i) => { if (i > 1 && x.r - ratios[i - 1].r > 0.6) out.push(`${x.id} ${x.r.toFixed(2)} after ${ratios[i - 1].id} ${ratios[i - 1].r.toFixed(2)}`); });
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
      const depth = writtenDepth(data, a);
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

describe('a weaker navy meets weaker seas (#352)', () => {
  it('the Soviet navy meets its enemies at 0.6 of the curve; the others as the curve says', () => {
    expect(NAVY_ENEMY_SCALE.SU).toBe(0.6);
    // b1 is written for the Soviet navy's first sea: only the navy's share changes it.
    expect(enemyScale(data, area('b1'), 'SU')).toBeCloseTo(0.6);
    expect(enemyScale(data, area('b1'), 'KM')).toBeCloseTo(enemyScale(data, area('b1')));
  });
});
