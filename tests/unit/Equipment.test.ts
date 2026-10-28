import { describe, it, expect } from 'vitest';
import { emptyProgress, IProgress, parseSave } from '@/utils/ProgressStore';
import { addStock, canDevelop, develop, developable, developCost, developRandom, heldCount, randomDevelopCost, stockOf, toggleFit, unfitAll } from '@/systems/EquipmentSystem';
import { SCRAP_SHARE, scrapBlock, scrapRefund, scrapShip } from '@/systems/ScrapSystem';
import { buildCost, isRewardOnly } from '@/systems/ShipyardSystem';
import { resources } from '@/systems/ResourceSystem';
import { IShipData } from '@/types/Ship';
import { IUpgradeData } from '@/types/Modifiers';
import { Nation } from '@/types/Nation';
import ijn from '@/data/ships/ijn.json';
import upgradesData from '@/data/upgrades.json';

const IJN = ijn.ships as IShipData[];
const CATALOG = upgradesData.upgrades as IUpgradeData[];
const byId = (id: string): IShipData => IJN.find((s) => s.id === id)!;
const rich = resources({ fuel: 9000, ammo: 9000, steel: 9000, bauxite: 9000 });
const player = (patch: Partial<IProgress> = {}): IProgress => ({ ...emptyProgress(), ships: ['fubuki', 'shiratsuyu', 'kongo'], resources: rich, ...patch });

describe('装備の所持と開発 (#55)', () => {
  it('fitting takes a copy from the stock; taking it off puts it back', () => {
    const p = { equipment: { radar: 1 }, upgrades: {} as Record<string, string[]> };
    const on = toggleFit(p, 'fubuki', 'radar', 2)!;
    expect(on.upgrades.fubuki).toEqual(['radar']);
    expect(stockOf(on, 'radar')).toBe(0);
    expect(heldCount(on, 'radar')).toBe(1);
    // No copy left for a second ship.
    expect(toggleFit(on, 'kongo', 'radar', 2)).toBeNull();
    const off = toggleFit(on, 'fubuki', 'radar', 2)!;
    expect(off.upgrades.fubuki).toEqual([]);
    expect(stockOf(off, 'radar')).toBe(1);
    // A full ship refuses another.
    expect(toggleFit({ equipment: { boiler: 1 }, upgrades: { fubuki: ['radar'] } }, 'fubuki', 'boiler', 1)).toBeNull();
    expect(unfitAll({ equipment: {}, upgrades: { fubuki: ['radar', 'boiler'] } }, 'fubuki')).toEqual({ equipment: { radar: 1, boiler: 1 }, upgrades: {} });
    expect(addStock({ a: 1 }, 'a', -5)).toEqual({});
  });

  it('develops what the research opened, the navy makes and is not a part taken from enemies', () => {
    const none = developable(CATALOG, [], Nation.IJN);
    expect(none.every((u) => !u.requires)).toBe(true);
    const done = ['torpedo_3', 'aa_4', 'asw_2', 'radar_2'];
    const ijnList = developable(CATALOG, done, Nation.IJN).map((u) => u.id);
    expect(ijnList).toContain('oxygen_torpedo');
    expect(ijnList).not.toContain('vt_fuze');
    expect(ijnList).not.toContain('hedgehog');
    expect(developable(CATALOG, done, Nation.USN).map((u) => u.id)).toEqual(expect.arrayContaining(['vt_fuze', 'hedgehog', 'sg_radar']));
    expect(developable(CATALOG, done, Nation.USN).some((u) => u.dropFrom)).toBe(false);
    const p = player({ research: ['torpedo_3'] });
    const made = develop(p, CATALOG, 'oxygen_torpedo', Nation.IJN)!;
    expect(stockOf(made, 'oxygen_torpedo')).toBe(1);
    expect(made.resources.ammo).toBe(rich.ammo - developCost(CATALOG.find((u) => u.id === 'oxygen_torpedo')!).ammo);
    expect(develop(p, CATALOG, 'vt_fuze', Nation.IJN)).toBeNull();
    expect(canDevelop({ ...p, resources: resources() }, CATALOG, 'oxygen_torpedo', Nation.IJN)).toBe(false);
  });

  it('「おまかせ」 gives a random developable one for less than the average price', () => {
    const p = player({ research: ['torpedo_1', 'armor_1'] });
    const pool = developable(CATALOG, p.research, Nation.IJN);
    const out = developRandom(p, CATALOG, Nation.IJN, 0.99)!;
    expect(pool.map((u) => u.id)).toContain(out.id);
    expect(heldCount(out.holder, out.id)).toBe(1);
    const avgSteel = pool.reduce((s, u) => s + developCost(u).steel, 0) / pool.length;
    expect(randomDevelopCost(pool).steel).toBeLessThan(avgSteel);
    expect(developRandom(player({ research: [] }), CATALOG.filter((u) => u.requires), Nation.IJN, 0)).toBeNull();
  });

  it('a save from before the stock keeps its fits and holds one copy of each researched upgrade', () => {
    const save = parseSave(JSON.stringify({ version: 30, current: 'IJN', nations: { IJN: { ships: ['fubuki'], research: ['radar_1', 'armor_1'], upgrades: { fubuki: ['radar'] } } } }));
    const np = save.nations.IJN!;
    expect(np.upgrades.fubuki).toEqual(['radar']);
    expect(np.equipment).toEqual({ radar: 1, extra_armor: 1 });
    expect(np.blueprints).toBe(0);
  });
});

describe('解体 (#42)', () => {
  it('returns a share of the build cost, mostly steel, and some of the remodels', () => {
    const ship = byId('kongo');
    const r = scrapRefund(ship);
    const cost = buildCost(ship);
    expect(r.steel).toBe(Math.round((cost.steel * SCRAP_SHARE.steel) / 10) * 10);
    expect(r.steel / cost.steel).toBeGreaterThan(r.fuel / Math.max(1, cost.fuel));
    expect(scrapRefund(ship, 2).steel).toBeGreaterThan(r.steel);
  });

  it('refuses the flagship, the last ship, reward ships and busy ships', () => {
    const p = player();
    expect(scrapBlock(p, IJN, byId('fubuki'), 'fubuki')).toBe('flagship');
    expect(scrapBlock(player({ ships: ['fubuki'] }), IJN, byId('fubuki'))).toBe('last');
    expect(scrapBlock(player({ docks: [{ shipId: 'kongo', endsAt: 1 }] }), IJN, byId('kongo'))).toBe('docked');
    expect(scrapBlock(player({ expeditions: [{ id: 'ex_drill', shipIds: ['kongo'], endsAt: 1 }] }), IJN, byId('kongo'))).toBe('expedition');
    expect(scrapBlock(player({ dorm: [{ kind: 'ship', id: 'kongo', since: 0 }] }), IJN, byId('kongo'))).toBe('dorm');
    expect(scrapBlock(p, IJN, byId('yamato'))).toBe('unowned');
    const reward = IJN.find((s) => isRewardOnly(s))!;
    expect(scrapBlock(player({ ships: ['fubuki', reward.id] }), IJN, reward)).toBe('reward');
    expect(scrapBlock(p, IJN, byId('kongo'))).toBeUndefined();
  });

  it('removes the ship, returns its equipment and clears what belonged to it', () => {
    const p = player({
      upgrades: { kongo: ['radar'] }, equipment: {}, refits: { kongo: 1 }, proficiency: { kongo: 60 }, damage: { kongo: 0.5 },
      presets: [{ slotIds: ['kongo', 'fubuki'], captainIds: ['c1', 'c2'], formation: emptyProgress().presets[0]?.formation ?? ('LineAhead' as never) }, null, null],
    });
    const out = scrapShip(p, IJN, byId('kongo'), 0)!;
    expect(out.progress.ships).not.toContain('kongo');
    expect(out.progress.upgrades.kongo).toBeUndefined();
    expect(stockOf(out.progress, 'radar')).toBe(1);
    expect(out.progress.refits.kongo).toBeUndefined();
    expect(out.progress.proficiency.kongo).toBeUndefined();
    expect(out.progress.damage.kongo).toBeUndefined();
    expect(out.progress.presets[0]?.slotIds).toEqual([null, 'fubuki']);
    expect(out.progress.presets[0]?.captainIds).toEqual([null, 'c2']);
    expect(out.progress.resources.steel).toBeGreaterThan(p.resources.steel);
    expect(out.refund).toEqual(scrapRefund(byId('kongo'), 1));
    expect(out.progress.quests.totals.scrap).toBe(1);
    expect(scrapShip(p, IJN, byId('kongo'), 0, 'kongo')).toBeNull();
  });
});
