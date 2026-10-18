import { describe, it, expect } from 'vitest';
import { areaMode, areasOf, enemyShips, isCleared, isUnlocked, recordClear, theaterProgress } from '@/systems/CampaignSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { BattleMode } from '@/types/Battle';
import campaign from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import openSea from '@/data/maps/open-sea.json';
import archipelago from '@/data/maps/archipelago.json';
import strait from '@/data/maps/strait.json';
import atoll from '@/data/maps/atoll.json';
import convoy from '@/data/maps/convoy-route.json';

const data = campaign as ICampaignData;
const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[]);
const area = (id: string) => data.areas.find((a) => a.id === id)!;

describe('CampaignSystem', () => {
  it('opens the first area of each theater and gates the rest', () => {
    expect(isUnlocked(area('p1'), [])).toBe(true);
    expect(isUnlocked(area('a1'), [])).toBe(true);
    expect(isUnlocked(area('m1'), [])).toBe(true);
    expect(isUnlocked(area('m2'), ['p1', 'a1'])).toBe(false);
    expect(isUnlocked(area('p2'), [])).toBe(false);
    expect(isUnlocked(area('p2'), ['p1'])).toBe(true);
  });

  it('records the first clear only once', () => {
    const a = recordClear([], 'p1');
    expect(a).toEqual({ cleared: ['p1'], firstClear: true });
    expect(recordClear(a.cleared, 'p1').firstClear).toBe(false);
    expect(isCleared(area('p1'), a.cleared)).toBe(true);
  });

  it('builds enemy fleets and picks the battle mode', () => {
    expect(enemyShips(area('p1'), registry).map((s) => s.id)).toEqual(['fletcher']);
    expect(areaMode(enemyShips(area('a1'), registry))).toBe(BattleMode.ASW);
    expect(areaMode(enemyShips(area('p5'), registry))).toBe(BattleMode.CarrierStrike);
    expect(areaMode(enemyShips(area('p1'), registry))).toBe(BattleMode.Surface);
  });

  it('measures theater progress', () => {
    expect(theaterProgress(data, 'pacific', [])).toBe(0);
    expect(theaterProgress(data, 'pacific', ['p1', 'p2', 'a1'])).toBeCloseTo(2 / areasOf(data, 'pacific').length);
  });

  it('data: every area has known ships, maps, theaters and prerequisites, and is reachable', () => {
    const maps = new Set([openSea, archipelago, strait, atoll, convoy].map((m) => m.id));
    const ids = new Set(data.areas.map((a) => a.id));
    const theaters = new Set(data.theaters.map((t) => t.id));
    for (const a of data.areas) {
      expect(enemyShips(a, registry), a.id).toHaveLength(a.enemy.ships.length);
      expect(enemyShips(a, registry).some((sh) => sh.fictional), `${a.id} fields a fictional ship`).toBe(false);
      expect(maps.has(a.map), a.id).toBe(true);
      expect(theaters.has(a.theater), a.id).toBe(true);
      for (const r of a.requires) expect(ids.has(r), `${a.id} -> ${r}`).toBe(true);
    }
    // Clearing areas in order unlocks every one of them.
    let cleared: string[] = [];
    for (let pass = 0; pass < data.areas.length; pass++) {
      for (const a of data.areas) if (isUnlocked(a, cleared)) cleared = recordClear(cleared, a.id).cleared;
    }
    expect(cleared.length).toBe(data.areas.length);
  });
});
