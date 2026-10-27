import { describe, it, expect } from 'vitest';
import { applyDrops, DROP_CHANCE, dropLine, dropTable, MAX_DROPS, rollDrops, SUPERWEAPON_PART } from '@/systems/DropSystem';
import { BLUEPRINT_NEED, BLUEPRINT_PER_GIANT, BLUEPRINT_PER_GIANT_AREA, ownSuperweapon, ownSuperweapons, partDurability, partsLine, superweaponOf, superweaponSeaOpen, SUPERWEAPONS } from '@/systems/SuperweaponSystem';
import { buildState, buildStateLabel } from '@/systems/ShipyardSystem';
import { theaterFinalArea } from '@/systems/CampaignSystem';
import { emptyProgress } from '@/utils/ProgressStore';
import { ALL_MISSION_MEDALS, ALL_MISSIONS_DONE } from '@/systems/RankSystem';
import { IUpgradeData } from '@/types/Modifiers';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import { IShipData } from '@/types/Ship';
import upgradesData from '@/data/upgrades.json';
import campaignData from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';

const CATALOG = upgradesData.upgrades as IUpgradeData[];
const seq = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('部品と設計図の回収 (#150)', () => {
  it('an enemy leaves a part of its kind or its navy’s own gear', () => {
    const sub = dropTable(CATALOG, { shipClass: ShipClass.Submarine, nation: Nation.USN }).map((u) => u.id);
    expect(sub).toContain('hydrophone');
    expect(sub).toContain('vt_fuze');
    expect(sub).not.toContain('oxygen_torpedo');
    expect(sub).not.toContain('big_gun_sight');
    // Every kind of ship has a part of its own.
    for (const c of Object.values(ShipClass)) expect(dropTable(CATALOG, { shipClass: c, nation: Nation.SU }).some((u) => u.dropFrom), c).toBe(true);
  });

  it('rolls by rank, at most a few a battle; a loss leaves nothing', () => {
    const sunk = Array.from({ length: 6 }, () => ({ shipClass: ShipClass.Destroyer, nation: Nation.IJN }));
    const all = rollDrops(CATALOG, sunk, 'S', true, {}, seq([0]));
    expect(all.parts.length).toBe(MAX_DROPS);
    expect(rollDrops(CATALOG, sunk, 'D', true, {}, seq([0])).parts).toEqual([]);
    expect(rollDrops(CATALOG, sunk, 'S', false, {}, seq([0])).parts).toEqual([]);
    // Just over the chance: nothing.
    expect(rollDrops(CATALOG, sunk, 'B', true, {}, seq([DROP_CHANCE.B + 0.01])).parts).toEqual([]);
    expect(DROP_CHANCE.S).toBeGreaterThan(DROP_CHANCE.A);
  });

  it('a superweapon always leaves its engine and blueprint fragments, more in its own sea', () => {
    const event = rollDrops(CATALOG, [], 'C', true, { giantSunk: true }, seq([0.99]));
    expect(event.parts).toEqual([SUPERWEAPON_PART]);
    expect(event.blueprints).toBe(BLUEPRINT_PER_GIANT);
    expect(rollDrops(CATALOG, [], 'C', true, { giantSunk: true, giantArea: true }, seq([0.99])).blueprints).toBe(BLUEPRINT_PER_GIANT_AREA);
    const p = applyDrops({ equipment: {}, blueprints: 4 }, event);
    expect(p).toEqual({ equipment: { [SUPERWEAPON_PART]: 1 }, blueprints: 5 });
    expect(dropLine(CATALOG, event, 5)).toBe('回収: 超兵器の機関 (改装で付けられます)  ·  設計図の断片 +1 (5 / 5・自国の超兵器を建造できます)');
    expect(dropLine(CATALOG, { parts: [], blueprints: 0 }, 0)).toBe('');
  });
});

describe('超兵器海域と自国の超兵器 (#148)', () => {
  it('the sea opens on the theater’s final area once it is won', () => {
    const data = campaignData as { areas: Array<{ id: string; theater: string; training?: boolean }> };
    const final = data.areas.find((a) => a.id === theaterFinalArea(data, 'pacific'))!;
    expect(superweaponSeaOpen(data, final, [])).toBe(false);
    expect(superweaponSeaOpen(data, final, [final.id])).toBe(true);
    const first = data.areas.find((a) => a.theater === 'pacific')!;
    expect(superweaponSeaOpen(data, first, [first.id])).toBe(false);
  });

  it('every navy has its own superweapon, a smaller copy of its giant, built from blueprints', () => {
    expect(ownSuperweapons().length).toBe(SUPERWEAPONS.length);
    const own = ownSuperweapon(Nation.IJN)!;
    const giant = superweaponOf(Nation.IJN)!;
    expect(own.blueprint).toBe(true);
    expect(own.hp).toBeLessThan(giant.hp / 2);
    expect(own.hp).toBeGreaterThan(Math.max(...(ijn.ships as IShipData[]).map((s) => s.hp)));
    expect(own.no).toBe(giant.no! + 1);
    const roster = [...(ijn.ships as IShipData[]), own];
    const p = { ...emptyProgress(), ships: ['fubuki'], merit: 1e9, rankStats: ALL_MISSIONS_DONE, record: { ...emptyProgress().record, medals: ALL_MISSION_MEDALS } };
    expect(buildState(p, roster, own)).toBe('blueprint');
    expect(buildStateLabel('blueprint', own, {}, {}, undefined, [], 3)).toBe(`要設計図: 3 / ${BLUEPRINT_NEED}`);
    expect(buildState({ ...p, blueprints: BLUEPRINT_NEED }, roster, own)).not.toBe('blueprint');
  });

  it('the HUD shows what is left of each part', () => {
    expect(partDurability(1)).toEqual({ turret: 1, engine: 1, bridge: 1 });
    expect(partsLine(0.875)).toBe('主砲塔 50%  機関 75%  艦橋 83%');
    expect(partsLine(0.5)).toBe('主砲塔 破壊  機関 破壊  艦橋 33%');
  });
});
