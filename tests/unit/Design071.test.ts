import { describe, expect, it } from 'vitest';
import weaponsData from '@/data/weapons/weapons.json';
import {
  DESIGN_NEW, designLoadout, designProblem, designShip, designStageIds, designWeapons, designWeight, hull, HULLS, hullCapacity, mainGunsOf,
  MAX_TIER, newDesignStages, SECOND_MAIN_WEIGHT, stageGains, weaponRole,
} from '@/systems/DesignSystem';
import { shipDps } from '@/systems/BalanceModel';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IWeaponData } from '@/types/Weapon';

const SHIPS = Object.values(import.meta.glob('@/data/ships/*.json', { eager: true }) as Record<string, { ships: IShipData[] }>).flatMap((m) => m.ships);
const WEAPONS = (weaponsData as { weapons: IWeaponData[] }).weapons;
const loadout = (ids: readonly string[]): IWeaponData[] => ids.map((id) => WEAPONS.find((w) => w.id === id)!).filter(Boolean);
const draft = (hullId: string, modules: string[]) => ({ name: '試作戦艦', hull: hullId, modules });

describe('0.0.71 設計艦の主砲 2 基 (#416)', () => {
  it('lets the battleship and the large battleship hull take two main guns of different calibres, no other hull', () => {
    expect(HULLS.filter((h) => mainGunsOf(h) > 1).map((h) => h.id).sort()).toEqual(['hull_bb', 'hull_bb_large']);
    expect(designProblem(draft('hull_bb', ['41cm_main_gun', '36cm_main_gun']), SHIPS, 'IJN', MAX_TIER)).toBeNull();
    expect(designProblem(draft('hull_bb', ['41cm_main_gun', '41cm_main_gun']), SHIPS, 'IJN', MAX_TIER)).toBe('同じ装備は 1 つまでです');
    expect(designProblem(draft('hull_bb_large', ['51cm_main_gun', '46cm_main_gun', '41cm_main_gun']), SHIPS, 'IJN', MAX_TIER)).toBe('主砲 は 2 つまでです');
    expect(designProblem(draft('hull_bc', ['41cm_main_gun', '36cm_main_gun']), SHIPS, 'IJN', MAX_TIER)).toBe('主砲 は 1 つまでです');
    expect(designProblem(draft('hull_ca', ['20cm_twin_gun', '12cm_gun', '15_5cm_triple']), SHIPS, 'IJN', MAX_TIER)).toBe('副砲・両用砲 は 1 つまでです');
  });

  it('weighs the second turret on top of the gun', () => {
    expect(designWeight(['41cm_main_gun', '36cm_main_gun'])).toBe(designWeight(['41cm_main_gun']) + designWeight(['36cm_main_gun']) + SECOND_MAIN_WEIGHT);
    expect(designWeight(['41cm_main_gun', '12cm_gun'])).toBe(designWeight(['41cm_main_gun']) + designWeight(['12cm_gun']));
  });

  it('splits the turrets in battle: two guns reload slower, one gun and the historical ships are as they were', () => {
    const two = designShip({ id: 'd', name: 'x', shipClass: ShipClass.Battleship, hull: 'hull_bb', modules: ['41cm_main_gun', '36cm_main_gun'] }, 'IJN');
    const out = designLoadout(two, loadout(two.weapons));
    expect(out.every((w, i) => w.reloadTime > loadout(two.weapons)[i].reloadTime)).toBe(true);
    const one = designShip({ id: 'd', name: 'x', shipClass: ShipClass.Battleship, hull: 'hull_bb', modules: ['41cm_main_gun', '12cm_gun'] }, 'IJN');
    expect(designLoadout(one, loadout(one.weapons))).toEqual(loadout(one.weapons));
    const yamato = SHIPS.find((s) => s.id === 'yamato')!;
    expect(designLoadout(yamato, loadout(yamato.weapons))).toEqual(loadout(yamato.weapons));
  });

  it("keeps every navy's strongest legal two-gun design within 1.4 times its strongest battleship's fire (historical or planned)", () => {
    const target = { shipClass: ShipClass.Battleship, armor: 50 };
    for (const n of ['IJN', 'USN', 'KM', 'RN', 'FR', 'RM', 'SU']) {
      const best = Math.max(...SHIPS.filter((s) => s.nation === n && !s.designed && !s.foreign && s.shipClass === ShipClass.Battleship).map((s) => shipDps(loadout(s.weapons), target)));
      for (const h of HULLS.filter((x) => mainGunsOf(x) > 1)) {
        const usable = designWeapons(SHIPS, n, h);
        const mains = usable.filter((w) => weaponRole(w) === 'main');
        const seconds = usable.filter((w) => weaponRole(w) === 'secondary');
        for (const a of mains) for (const b of mains) for (const c of [undefined, ...seconds]) {
          if (a.id >= b.id) continue;
          const modules = [a.id, b.id, ...(c ? [c.id] : [])];
          if (designProblem(draft(h.id, modules), SHIPS, n, MAX_TIER) !== null) continue;
          expect(designWeight(modules), `${n} ${modules.join('+')}`).toBeLessThanOrEqual(hullCapacity(h, MAX_TIER));
          const dps = shipDps(designLoadout({ designed: true }, loadout(modules)), target);
          expect(dps / best, `${n} ${h.id} ${modules.join('+')}`).toBeLessThanOrEqual(1.4);
        }
      }
    }
  });
});

describe('0.0.71 設計段階のお知らせ (#416)', () => {
  it('tells each stage reached once, an old save included', () => {
    expect(designStageIds(0)).toEqual([]);
    expect(designStageIds(5)).toEqual(['stage1', 'stage2', 'stage3']);
    expect(newDesignStages(undefined, 0)).toBe(0);
    expect(newDesignStages(undefined, 2)).toBe(2);
    expect(newDesignStages({ [DESIGN_NEW]: ['stage1'] }, 2)).toBe(1);
    expect(newDesignStages({ [DESIGN_NEW]: ['stage1', 'stage2'] }, 2)).toBe(0);
  });

  it('names what the stage brings', () => {
    expect(stageGains(1)).toContain(hull('hull_bb')!.name);
    expect(stageGains(3)).toContain(hull('hull_bb_large')!.name);
    expect(stageGains(2)).toContain('設計 4 つまで');
  });
});
