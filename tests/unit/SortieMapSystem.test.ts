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

  it('larger fleets: one node on the way, the escorts on some areas, then the whole fleet as the boss (#307)', () => {
    const enemy = [ship('bb', 700), ship('ca', 400), ship('dd1', 200), ship('dd2', 210)];
    const routes = data.areas.filter((a) => a.requires.length > 0).map((a) => sortieRoute(a, enemy));
    for (const route of routes) {
      expect(route).toHaveLength(2);
      expect(route[1]).toEqual({ kind: 'boss', ships: ['bb', 'ca', 'dd1', 'dd2'] });
      expect(battleNodes(route).length).toBeLessThanOrEqual(2);
    }
    const fought = routes.find((r) => r[0].kind === 'battle')!;
    expect(fought[0]).toEqual({ kind: 'battle', ships: ['dd1', 'dd2'] });
    // The same area always has the same route.
    expect(sortieRoute(area('p4'), enemy)).toEqual(sortieRoute(area('p4'), enemy));
  });

  it('every kind of in-between node appears somewhere, and moving on skips to the next battle', () => {
    const enemy = [ship('a', 700), ship('b', 400), ship('c', 200), ship('d', 210), ship('e', 220)];
    const kinds = new Set(data.areas.flatMap((a) => sortieRoute(a, enemy).map((n) => n.kind)));
    expect(kinds).toEqual(new Set(['battle', 'resource', 'whirlpool', 'boss']));
    const withCache = data.areas.map((a) => sortieRoute(a, enemy)).find((r) => r[0].kind === 'resource')!;
    expect(nextBattleIndex(withCache, 0)).toBe(1);
    const fought = data.areas.map((a) => sortieRoute(a, enemy)).find((r) => r[0].kind === 'battle')!;
    expect(nodesBetween(fought, 0)).toEqual([]);
  });

  it('大破 ships drop out before the next battle', () => {
    const hp: Record<string, number> = { a: 1, b: HEAVY_DAMAGE, c: 0.6, d: 0.1 };
    expect(shipsForNextNode(['a', 'b', 'c', 'd'], (id) => hp[id])).toEqual(['a', 'c']);
  });
});
