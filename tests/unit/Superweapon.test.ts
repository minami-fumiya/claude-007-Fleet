import { describe, it, expect } from 'vitest';
import { brokenParts, newlyBroken, SUPERWEAPONS, superweaponOf } from '@/systems/SuperweaponSystem';
import { daySchedule, eventEffects, MAX_SUPERWEAPON } from '@/systems/EventSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { ShipClass } from '@/types/ShipClass';
import ijn from '@/data/ships/ijn.json';
import weaponData from '@/data/weapons/weapons.json';

describe('超兵器 (#148)', () => {
  it('every navy has one, three to five times its biggest battleship', () => {
    const yamato = (ijn.ships as Array<{ id: string; hp: number }>).find((s) => s.id === 'yamato')!;
    for (const n of PLAYABLE_NATIONS) {
      const sw = superweaponOf(n);
      expect(sw, n).toBeDefined();
      expect(sw!.hp).toBeGreaterThanOrEqual(yamato.hp * 3);
      expect(sw!.hp).toBeLessThanOrEqual(yamato.hp * 5);
      expect(sw!.scale).toBeGreaterThan(1);
    }
    expect(SUPERWEAPONS.find((s) => s.shipClass === ShipClass.Carrier)?.airWing).toBeDefined();
  });

  it('its weapons exist', () => {
    const ids = new Set((weaponData.weapons as Array<{ id: string }>).map((w) => w.id));
    for (const sw of SUPERWEAPONS) for (const w of sw.weapons) expect(ids.has(w), `${sw.id} ${w}`).toBe(true);
  });

  it('parts break at three quarters, half and a quarter of its HP, each once', () => {
    expect(brokenParts(0.9)).toEqual([]);
    expect(brokenParts(0.5)).toEqual(['turret', 'engine']);
    expect(newlyBroken(0.8, 0.45)).toEqual(['turret', 'engine']);
    expect(newlyBroken(0.45, 0.4)).toEqual([]);
    expect(newlyBroken(0.3, 0.2)).toEqual(['bridge']);
  });

  it('超兵器出現 comes at most once a day, in a theater', () => {
    let seen = 0;
    for (let d = 20_000; d < 20_120; d++) {
      const giants = daySchedule(d).filter((e) => e.kind === 'superweapon');
      expect(giants.length).toBeLessThanOrEqual(MAX_SUPERWEAPON);
      for (const g of giants) {
        expect(g.theater).toBeTruthy();
        expect(eventEffects(g).superweaponTheater).toBe(g.theater);
      }
      seen += giants.length;
    }
    expect(seen).toBeGreaterThan(10);
  });
});
