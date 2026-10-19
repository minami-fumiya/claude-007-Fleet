import { describe, it, expect } from 'vitest';
import { battleNodes, HEAVY_DAMAGE, nextBattleIndex, nodesBetween, shipsForNextNode, sortieRoute } from '@/systems/SortieMapSystem';
import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import campaign from '@/data/campaign.json';

const data = campaign as unknown as ICampaignData;
const area = (id: string): ICampaignArea => data.areas.find((a) => a.id === id)!;
const ship = (id: string, hp: number): IShipData => ({ id, hp } as IShipData);

describe('sortie routes (#53)', () => {
  it('a free first area and small fleets stay one battle', () => {
    expect(sortieRoute(area('p1'), [ship('a', 200)]).map((n) => n.kind)).toEqual(['boss']);
    expect(sortieRoute(area('p2'), [ship('a', 400), ship('b', 200)]).map((n) => n.kind)).toEqual(['boss']);
  });

  it('larger fleets: the lighter escorts first, then the whole fleet as the boss', () => {
    const enemy = [ship('bb', 700), ship('ca', 400), ship('dd1', 200), ship('dd2', 210)];
    const route = sortieRoute(area('p4'), enemy);
    expect(route[0]).toEqual({ kind: 'battle', ships: ['dd1', 'dd2'] });
    expect(route[route.length - 1]).toEqual({ kind: 'boss', ships: ['bb', 'ca', 'dd1', 'dd2'] });
    expect(battleNodes(route)).toHaveLength(2);
    expect(route.length).toBeLessThanOrEqual(3);
    // The same area always has the same route.
    expect(sortieRoute(area('p4'), enemy)).toEqual(route);
  });

  it('every kind of in-between node appears somewhere, and moving on skips to the next battle', () => {
    const enemy = [ship('a', 700), ship('b', 400), ship('c', 200), ship('d', 210), ship('e', 220)];
    const kinds = new Set(data.areas.flatMap((a) => sortieRoute(a, enemy).map((n) => n.kind)));
    expect(kinds).toEqual(new Set(['battle', 'resource', 'whirlpool', 'boss']));
    const withCache = data.areas.map((a) => sortieRoute(a, enemy)).find((r) => r.length === 3)!;
    expect(nextBattleIndex(withCache, 1)).toBe(2);
    expect(nodesBetween(withCache, 0)).toEqual([withCache[1]]);
    expect(nodesBetween(withCache, 2)).toEqual([]);
  });

  it('大破 ships drop out before the next battle', () => {
    const hp: Record<string, number> = { a: 1, b: HEAVY_DAMAGE, c: 0.6, d: 0.1 };
    expect(shipsForNextNode(['a', 'b', 'c', 'd'], (id) => hp[id])).toEqual(['a', 'c']);
  });
});
