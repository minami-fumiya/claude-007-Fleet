import { describe, it, expect } from 'vitest';
import { applyToStats, applyToWeapons, combineModifiers, toggleUpgrade, upgradeModifiers, UPGRADE_SLOTS } from '@/systems/CustomizationSystem';
import { IUpgradeData, NO_MODIFIERS } from '@/types/Modifiers';
import { IShipStats } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { emptyProgress, parseProgress } from '@/utils/ProgressStore';
import upgrades from '@/data/upgrades.json';

const catalog = upgrades.upgrades as IUpgradeData[];
const stats: IShipStats = { name: 's', maxHp: 400, currentHp: 400, armor: 50, speed: 100, firePower: 10, shipClass: ShipClass.Battleship };
const gun: IWeaponData = { id: 'g', name: 'g', type: WeaponType.ShellAP, firePower: 100, range: 500, reloadTime: 1000, projectileSpeed: 500 };
const torp: IWeaponData = { ...gun, id: 't', type: WeaponType.Torpedo };
const dc: IWeaponData = { ...gun, id: 'd', type: WeaponType.DepthCharge };

describe('CustomizationSystem', () => {
  it('combines multipliers and additions', () => {
    const m = combineModifiers({ speedMul: 1.1, armorAdd: 5 }, { speedMul: 0.5, armorAdd: 3 });
    expect(m.speedMul).toBeCloseTo(0.55);
    expect(m.armorAdd).toBe(8);
    expect(m.hpMul).toBe(1);
    expect(combineModifiers()).toEqual(NO_MODIFIERS);
  });

  it('builds modifiers from fitted upgrades, ignoring unknown ids and extra slots', () => {
    const m = upgradeModifiers(['extra_armor', 'nope', 'boiler'], catalog);
    expect(m.armorAdd).toBe(8);
    expect(m.speedMul).toBeCloseTo(0.95);
    expect(upgradeModifiers(['boiler', 'damage_control', 'radar'], catalog).visionMul).toBe(1);
  });

  it('toggles upgrades within the slot limit', () => {
    let fitted = toggleUpgrade([], 'boiler');
    expect(fitted).toEqual(['boiler']);
    fitted = toggleUpgrade(fitted, 'radar');
    expect(fitted).toHaveLength(UPGRADE_SLOTS);
    expect(toggleUpgrade(fitted, 'aa_guns')).toBe(fitted);
    expect(toggleUpgrade(fitted, 'boiler')).toEqual(['radar']);
  });

  it('applies modifiers to stats', () => {
    const s = applyToStats(stats, { ...NO_MODIFIERS, hpMul: 1.1, armorAdd: -60, speedMul: 1.08 });
    expect(s.maxHp).toBe(440);
    expect(s.currentHp).toBe(440);
    expect(s.armor).toBe(0);
    expect(s.speed).toBe(108);
  });

  it('applies gun and torpedo modifiers to weapons only', () => {
    const [g, t, d] = applyToWeapons([gun, torp, dc], { ...NO_MODIFIERS, gunPowerMul: 1.2, gunReloadMul: 0.9, torpedoPowerMul: 1.5 });
    expect(g.firePower).toBeCloseTo(120);
    expect(g.reloadTime).toBe(900);
    expect(t.firePower).toBeCloseTo(150);
    expect(t.reloadTime).toBe(1000);
    expect(d).toBe(dc);
  });

  it('every upgrade in the catalog has a unique id and an effect', () => {
    expect(new Set(catalog.map((u) => u.id)).size).toBe(catalog.length);
    for (const u of catalog) expect(Object.keys(u.effects).length).toBeGreaterThan(0);
  });
});

describe('ProgressStore.parseProgress', () => {
  it('tolerates missing or malformed data', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('not json')).toEqual(emptyProgress());
    const p = parseProgress('{"captainXp":{"a":"x","b":120},"upgrades":{"s":["boiler",3],"t":"no"}}');
    expect(p.captainXp).toEqual({ b: 120 });
    expect(p.upgrades).toEqual({ s: ['boiler'] });
    // Saves from before Sprint 6 get starting resources and no damage.
    expect(p.resources).toEqual(emptyProgress().resources);
    expect(p.damage).toEqual({});
    const q = parseProgress('{"resources":{"fuel":5,"ammo":"x"},"damage":{"a":2,"b":0.5,"c":"x"},"docks":[{"shipId":"b","endsAt":10},{"shipId":3}],"research":["x",1]}');
    expect(q.resources).toEqual({ fuel: 5, ammo: 0, steel: 0, bauxite: 0 });
    expect(q.damage).toEqual({ a: 1, b: 0.5 });
    expect(q.docks).toEqual([{ shipId: 'b', endsAt: 10 }]);
    expect(q.research).toEqual(['x']);
  });
});
