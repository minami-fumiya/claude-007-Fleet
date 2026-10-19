import { describe, it, expect } from 'vitest';
import {
  applyToAirWing,
  applyToStats,
  applyToWeapons,
  combineModifiers,
  customizeShips,
  describeModifiers,
  MAX_UPGRADE_SLOTS,
  toggleUpgrade,
  upgradeModifiers,
  upgradeSlots,
  UPGRADE_SLOTS,
} from '@/systems/CustomizationSystem';
import { IUpgradeData, NO_MODIFIERS } from '@/types/Modifiers';
import { IShipData, IShipStats } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IWeaponData, WeaponType } from '@/types/Weapon';
import { emptyProgress, parseProgress } from '@/utils/ProgressStore';
import { LEGACY_STARTING_RESOURCES } from '@/systems/ResourceSystem';
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
    const m = upgradeModifiers(['extra_armor', 'nope', 'boiler'], catalog, 2);
    expect(m.armorAdd).toBe(8);
    expect(m.speedMul).toBeCloseTo(0.95);
    expect(upgradeModifiers(['boiler', 'damage_control', 'radar'], catalog, 2).visionMul).toBe(1);
  });

  it('toggles upgrades within the slot limit', () => {
    let fitted = toggleUpgrade([], 'boiler', 2);
    expect(fitted).toEqual(['boiler']);
    fitted = toggleUpgrade(fitted, 'radar', 2);
    expect(fitted).toHaveLength(2);
    expect(toggleUpgrade(fitted, 'aa_guns', 2)).toBe(fitted);
    expect(toggleUpgrade(fitted, 'boiler', 2)).toEqual(['radar']);
    // An unremodelled ship has one slot (#132).
    expect(toggleUpgrade([], 'boiler', UPGRADE_SLOTS)).toEqual(['boiler']);
    expect(toggleUpgrade(['boiler'], 'radar', UPGRADE_SLOTS)).toEqual(['boiler']);
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

  it('adds planes and armor, multiplies the new aviation / ASW / night modifiers', () => {
    const m = combineModifiers({ planesAdd: 1, sonarMul: 1.1, nightAimMul: 0.9 }, { planesAdd: 1, sonarMul: 1.2, nightAimMul: 0.9, rearmMul: 0.9 });
    expect(m.planesAdd).toBe(2);
    expect(m.sonarMul).toBeCloseTo(1.32);
    expect(m.nightAimMul).toBeCloseTo(0.81);
    expect(m.rearmMul).toBeCloseTo(0.9);
    expect(m.airPowerMul).toBe(1);
  });

  it('upgrade slots: 1 unremodelled, then 2 (改) → 3 (改二) → 4 (改三) (#72 #132)', () => {
    expect([0, 1, 2, 3, 9].map(upgradeSlots)).toEqual([1, 2, 3, 4, 4]);
    expect(upgradeSlots(-1)).toBe(UPGRADE_SLOTS);
    expect(MAX_UPGRADE_SLOTS).toBe(4);
    let fitted: string[] = [];
    for (const id of ['boiler', 'radar', 'aa_guns', 'damage_control', 'heavy_shells']) fitted = toggleUpgrade(fitted, id, upgradeSlots(3));
    expect(fitted).toEqual(['boiler', 'radar', 'aa_guns', 'damage_control']);
    expect(upgradeModifiers(fitted, catalog, 2).aaMul).toBe(1);
    expect(upgradeModifiers(fitted, catalog, upgradeSlots(0))).toEqual(upgradeModifiers(fitted.slice(0, 1), catalog, 4));
    expect(upgradeModifiers(fitted, catalog, 4).aaMul).toBeCloseTo(1.4);
    expect(upgradeModifiers(fitted, catalog, 4).hpMul).toBeCloseTo(1.1);
  });

  it('applies depth charge power and extra planes', () => {
    const [d] = applyToWeapons([dc], { ...NO_MODIFIERS, depthChargeMul: 1.25 });
    expect(d.firePower).toBeCloseTo(125);
    expect(applyToAirWing({ fighters: 4, diveBombers: 5, torpedoBombers: 0 }, { ...NO_MODIFIERS, planesAdd: 1 })).toEqual({ fighters: 5, diveBombers: 6, torpedoBombers: 0 });
    expect(applyToAirWing({ fighters: 1, diveBombers: 2, torpedoBombers: 3 }, NO_MODIFIERS)).toEqual({ fighters: 1, diveBombers: 2, torpedoBombers: 3 });
  });

  it('describes modifiers that change something', () => {
    expect(describeModifiers(NO_MODIFIERS)).toEqual([]);
    expect(describeModifiers({ gunPowerMul: 1.1, armorAdd: 6, planesAdd: 1 })).toEqual(['装甲 +6', '砲火力 ×1.10', '搭載機 +1']);
  });

  it('applies the ASW multiplier to depth charges and combines the new fields', () => {
    const m = combineModifiers({ depthChargeMul: 1.2, airPowerMul: 1.1 }, { depthChargeMul: 1.5 });
    expect(m.depthChargeMul).toBeCloseTo(1.8);
    expect(m.airPowerMul).toBeCloseTo(1.1);
    const [g, d] = applyToWeapons([gun, dc], m);
    expect(g).toEqual(gun);
    expect(d.firePower).toBeCloseTo(180);
    expect(d.reloadTime).toBe(dc.reloadTime);
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
    const p = parseProgress('{"captainXp":{"a":"x","b":120},"upgrades":{"s":["boiler",3],"t":"no"},"refits":{"s":1},"research":["engine_1"]}');
    expect(p.captainXp).toEqual({ b: 120 });
    expect(p.upgrades).toEqual({ s: ['boiler'] });
    // v1 saves from before Sprint 6 get the old starting resources and no damage.
    expect(p.resources).toEqual(LEGACY_STARTING_RESOURCES);
    expect(p.damage).toEqual({});
    const q = parseProgress('{"resources":{"fuel":5,"ammo":"x"},"damage":{"a":2,"b":0.5,"c":"x"},"docks":[{"shipId":"b","endsAt":10},{"shipId":3}],"research":["x",1]}');
    expect(q.resources).toEqual({ fuel: 5, ammo: 0, steel: 0, bauxite: 0 });
    expect(q.damage).toEqual({ a: 1, b: 0.5 });
    expect(q.docks).toEqual([{ shipId: 'b', endsAt: 10, base: 'ijn_home' }]);
    expect(q.research).toEqual(['x']);
  });
});

describe('customizeShips (#144)', () => {
  const ship = (id: string, shipClass: string) => ({ id, shipClass } as unknown as IShipData);
  const owned = [ship('dd', 'Destroyer'), ship('bb', 'Battleship'), ship('ca', 'Cruiser'), ship('cv', 'Carrier')];
  it('the fleet only, or the fleet first and every other ship by class', () => {
    expect(customizeShips(owned, ['ca', 'dd'], false).map((s) => s.id)).toEqual(['ca', 'dd']);
    expect(customizeShips(owned, ['ca', 'dd'], true).map((s) => s.id)).toEqual(['ca', 'dd', 'bb', 'cv']);
    expect(customizeShips(owned, [], true).map((s) => s.id)).toEqual(['bb', 'cv', 'ca', 'dd']);
    expect(customizeShips(owned, ['gone'], false)).toEqual([]);
  });
});
