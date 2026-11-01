import { describe, it, expect } from 'vitest';
import upgradesData from '@/data/upgrades.json';
import { COPY_FROM, improve, improveCost, improvedCatalog, improvedEffects, improveState, MAX_STARS } from '@/systems/ImprovementSystem';
import { swapCost, swapGun, swappableGuns, swapOptions, swappedWeapons } from '@/systems/GunSwapSystem';
import { foreignId, foreignShips, FOREIGN_OFFERS, fragmentNeed, rollFragment } from '@/systems/ForeignShipSystem';
import { resources } from '@/systems/ResourceSystem';
import { IUpgradeData } from '@/types/Modifiers';
import { IShipData, isHistorical, shipOrigin } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

const CATALOG = (upgradesData as { upgrades: IUpgradeData[] }).upgrades;
const SHIPS = Object.values(import.meta.glob('@/data/ships/*.json', { eager: true }) as Record<string, { ships: IShipData[] }>).flatMap((m) => m.ships);
const rich = resources({ fuel: 99999, ammo: 99999, steel: 99999, bauxite: 99999 });
const byId = (id: string): IShipData => SHIPS.find((s) => s.id === id)!;

describe('装備改修 (#368)', () => {
  const fd = CATALOG.find((u) => u.id === 'fire_director')!;
  it('makes each bonus stronger a ★ at a time', () => {
    expect(improvedEffects({ gunReloadMul: 0.9 }, 0)).toEqual({ gunReloadMul: 0.9 });
    expect(improvedEffects({ gunReloadMul: 0.9 }, 10).gunReloadMul).toBeCloseTo(0.84);
    expect(improvedEffects({ armorAdd: 5 }, 10).armorAdd).toBeCloseTo(8);
    expect(improvedCatalog(CATALOG, { fire_director: 5 }).find((u) => u.id === 'fire_director')!.effects.gunReloadMul).toBeCloseTo(0.87);
  });

  it('needs the equipment held, resources, and from ★6 a spare copy', () => {
    const h = { equipment: { fire_director: 1 }, upgrades: {}, research: [], resources: rich, equipStars: {} as Record<string, number> };
    expect(improveState({ ...h, equipment: {} }, fd)).toBe('none');
    expect(improveState({ ...h, resources: resources() }, fd)).toBe('resources');
    let x = h;
    for (let i = 0; i < COPY_FROM - 1; i++) x = improve(x, fd)!;
    expect(x.equipStars.fire_director).toBe(COPY_FROM - 1);
    expect(x.equipment.fire_director).toBe(1);
    // The spare is used up at ★6; the last one fitted to a ship then can't go further without another.
    x = improve(x, fd)!;
    expect(x.equipment.fire_director).toBeUndefined();
    expect(improveState({ ...x, upgrades: { yamato: ['fire_director'] } }, fd)).toBe('copy');
    expect(improveState({ ...x, equipStars: { fire_director: MAX_STARS } }, fd)).toBe('max');
    expect(improveCost(fd, 4).steel).toBeGreaterThan(improveCost(fd, 0).steel);
  });
});

describe('型の載せ替え (#368)', () => {
  it('offers the navy\'s guns of about the same size, and swaps back for free', () => {
    const nagato = byId('nagato');
    const gun = swappableGuns(nagato)[0];
    expect(gun.id).toBe('41cm_main_gun');
    const options = swapOptions(nagato, gun.id, SHIPS).map((w) => w.id);
    expect(options).toContain('46cm_main_gun');
    expect(options).not.toContain('16in_mk7');
    const h = { resources: rich, gunSwaps: {} as Record<string, Record<string, string>> };
    const swapped = swapGun(h, nagato, gun.id, '46cm_main_gun', SHIPS)!;
    expect(swapped.gunSwaps.nagato).toEqual({ '41cm_main_gun': '46cm_main_gun' });
    expect(swapped.resources.steel).toBe(rich.steel - swapCost('46cm_main_gun').steel);
    expect(swappedWeapons(nagato.weapons, swapped.gunSwaps.nagato)[0]).toBe('46cm_main_gun');
    const back = swapGun(swapped, nagato, gun.id, gun.id, SHIPS)!;
    expect(back.gunSwaps.nagato).toEqual({});
    expect(back.resources).toEqual(swapped.resources);
    expect(swapGun(h, nagato, gun.id, '16in_mk7', SHIPS)).toBeNull();
    expect(swapGun({ ...h, resources: resources() }, nagato, gun.id, '46cm_main_gun', SHIPS)).toBeNull();
  });
});

describe('他国の設計図 (#368)', () => {
  it('every offered ship exists in its navy, and each navy can build the others\'', () => {
    for (const [n, ids] of Object.entries(FOREIGN_OFFERS)) for (const id of ids) expect(SHIPS.find((s) => s.id === id)?.nation, id).toBe(n);
    const ijn = foreignShips(SHIPS, Nation.IJN);
    expect(ijn.length).toBe(17);
    const f = ijn.find((s) => s.id === foreignId('fletcher', Nation.IJN))!;
    expect(f.nation).toBe(Nation.IJN);
    expect(f.foreign).toBe(Nation.USN);
    expect(isHistorical(f)).toBe(false);
    expect(shipOrigin(f)).toBe('他国艦');
    expect(ijn.some((s) => s.foreign === Nation.IJN)).toBe(false);
    expect(fragmentNeed({ shipClass: ShipClass.Cruiser })).toBeGreaterThan(fragmentNeed({ shipClass: ShipClass.Destroyer }));
  });

  it('a won battle may leave one fragment; a lost one none', () => {
    const dd = [{ id: 'x', shipClass: ShipClass.Destroyer }];
    expect(rollFragment(SHIPS, Nation.USN, dd, 'S', false, () => 0)).toBeNull();
    expect(rollFragment(SHIPS, Nation.USN, dd, 'S', true, () => 0)?.id).toBe('fletcher');
    expect(rollFragment(SHIPS, Nation.USN, dd, 'D', true, () => 0)).toBeNull();
    expect(rollFragment(SHIPS, Nation.USN, [], 'S', true, () => 0)).toBeNull();
  });
});
