import { describe, it, expect } from 'vitest';
import {
  designLimit, designProblem, designShip, designTier, designWeapons, designWeight, FITTINGS, hull, HULLS, hullCapacity, MAX_TIER, newDesignId, parseDesigns,
} from '@/systems/DesignSystem';
import { IShipData, isHistorical, shipOrigin } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { shipGrade } from '@/systems/ShipyardSystem';
import { IShipDesign } from '@/types/Design';

const SHIPS = Object.values(import.meta.glob('@/data/ships/*.json', { eager: true }) as Record<string, { ships: IShipData[] }>).flatMap((m) => m.ships);
const design = (hullId: string, modules: string[], name = '試作艦'): IShipDesign => ({ id: 'design_ijn_1', name, shipClass: hull(hullId)!.shipClass, hull: hullId, modules });

describe('設計艦 (#51)', () => {
  it('every class has a hull at tier 0 or 1, and every hull a navy can arm', () => {
    for (const c of Object.values(ShipClass)) expect(HULLS.some((h) => h.shipClass === c && h.tier <= 1), c).toBe(true);
    for (const n of ['IJN', 'USN', 'KM', 'RN', 'FR', 'RM', 'SU']) {
      for (const h of HULLS) {
        if (h.shipClass === ShipClass.Carrier) continue;
        expect(designWeapons(SHIPS, n, h).length, `${n} ${h.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('a hull stays below the best real ship of its kind; with every fitting it reaches about the best', () => {
    for (const h of HULLS) {
      const kin = SHIPS.filter((s) => isHistorical(s) && s.shipClass === h.shipClass && (s.subtype ?? '') === (h.subtype ?? ''));
      const best = Math.max(...kin.map((s) => s.hp));
      expect(h.hp, h.id).toBeLessThanOrEqual(best);
      const full = designShip(design(h.id, FITTINGS.filter((f) => !f.classes || f.classes.includes(h.shipClass)).map((f) => f.id)), 'IJN', SHIPS);
      expect(full.hp, h.id).toBeLessThanOrEqual(best * 1.05);
    }
  });

  it('checks slots, roles, weight, name and tier', () => {
    expect(designProblem(design('hull_dd', ['12cm_gun', 'torpedo_type93', 'depth_charge']), SHIPS, 'IJN', 0)).toBeNull();
    expect(designProblem(design('hull_dd', ['12cm_gun', 'torpedo_type93'], ''), SHIPS, 'IJN', 0)).toBe('艦名を付けてください');
    expect(designProblem(design('hull_dd', ['12cm_gun', '10cm_type98']), SHIPS, 'IJN', 0)).toBe('副砲・両用砲 は 1 つまでです');
    expect(designProblem(design('hull_dd', ['46cm_main_gun']), SHIPS, 'IJN', 0)).toContain('載せられません');
    expect(designProblem(design('hull_dd', ['16in_mk7']), SHIPS, 'IJN', 0)).toContain('載せられません');
    expect(designProblem(design('hull_bb', ['46cm_main_gun']), SHIPS, 'IJN', 0)).toBe('設計段階 1 が必要です');
    expect(designProblem(design('hull_bb', ['46cm_main_gun', '15_5cm_triple', 'fit_armor', 'fit_engine', 'fit_bulge']), SHIPS, 'IJN', 1)).toBe('重量が上限 16 を超えています');
    expect(designProblem(design('hull_bb', ['46cm_main_gun', '15_5cm_triple', 'fit_armor', 'fit_engine', 'fit_bulge']), SHIPS, 'IJN', 3)).toBeNull();
    expect(designProblem(design('hull_ss', ['type95_torpedo', 'torpedo_type93']), SHIPS, 'IJN', 0)).toContain('載せられません');
    expect(designProblem(design('hull_cvl', ['fit_hangar']), SHIPS, 'IJN', 0)).toBeNull();
  });

  it('turns a design into a ship that is built and fought like any other, and kept out of enemy fleets', () => {
    const s = designShip(design('hull_bb', ['46cm_main_gun', '15_5cm_triple', 'fit_bulge']), 'IJN', SHIPS);
    expect(s.designed).toBe(true);
    expect(isHistorical(s)).toBe(false);
    expect(shipOrigin(s)).toBe('設計艦');
    expect(s.weapons).toEqual(['46cm_main_gun', '15_5cm_triple']);
    expect(s.hp).toBe(Math.round(660 * 1.06));
    expect(s.speed).toBeLessThan(125);
    expect(SHIPS.some((x) => x.spriteKey === s.spriteKey)).toBe(true);
    expect(shipGrade(s)).toBeGreaterThanOrEqual(3);
    const cv = designShip(design('hull_cv', ['5in_38', 'fit_hangar']), 'USN', SHIPS);
    expect(cv.airWing).toEqual({ fighters: 6, diveBombers: 5, torpedoBombers: 5 });
  });

  it('grows with the focuses and the 架空艦計画 research', () => {
    expect(designTier(0, [])).toBe(0);
    expect(designTier(3, [])).toBe(1);
    expect(designTier(9, ['fictional_ships'])).toBe(MAX_TIER);
    expect(hullCapacity(hull('hull_bb')!, 2)).toBe(17);
    expect(designLimit(0)).toBe(2);
    expect(designWeight(['46cm_main_gun', 'fit_armor'])).toBe(11);
  });

  it('numbers new designs and reads stored ones tolerantly', () => {
    expect(newDesignId('IJN', [])).toBe('design_ijn_1');
    expect(newDesignId('IJN', [design('hull_dd', [])])).toBe('design_ijn_2');
    expect(parseDesigns([{ id: 'd1', hull: 'hull_dd', name: '', modules: ['a', 1] }, { id: 'd1', hull: 'hull_dd' }, { id: 'd2', hull: 'nope' }, null]))
      .toEqual([{ id: 'd1', name: '設計艦', shipClass: ShipClass.Destroyer, hull: 'hull_dd', modules: ['a'] }]);
  });
});
