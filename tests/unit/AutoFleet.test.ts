import { describe, it, expect } from 'vitest';
import { autoFleet, AUTO_AHEAD, IAutoCandidate } from '@/systems/AutoFleet';
import { filterAndSort, KindFilter, ShipSort } from '@/systems/ShipKind';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import ijn from '@/data/ships/ijn.json';

const IJN = ijn.ships as IShipData[];
const byId = (id: string): IShipData => IJN.find((s) => s.id === id)!;
const cand = (id: string, cost: number, power: number): IAutoCandidate => ({ ship: byId(id), cost, power });

describe('自動編成 (#357)', () => {
  const pool = [cand('yamato', 10, 2000), cand('nagato', 8, 1500), cand('takao', 5, 700), cand('fubuki', 2, 200), cand('yukikaze', 2, 220), cand('i19', 3, 150)];

  it('takes the strongest ships within the cost cap, the biggest at the head', () => {
    const fleet = autoFleet(pool, 3, 20);
    expect(fleet[0].id).toBe('yamato');
    expect(fleet.length).toBe(3);
    expect(fleet.reduce((s, x) => s + pool.find((c) => c.ship.id === x.id)!.cost, 0)).toBeLessThanOrEqual(20);
  });

  it('keeps a destroyer among the escorts from three slots up', () => {
    const fleet = autoFleet(pool, 3, 24);
    expect(fleet.some((s) => s.shipClass === ShipClass.Destroyer)).toBe(true);
    // Two slots: no destroyer is held back for.
    expect(autoFleet(pool, 2, 24).map((s) => s.id)).toEqual(['yamato', 'nagato']);
  });

  it('stops adding ships once comfortably ahead of the enemy', () => {
    const fleet = autoFleet(pool, 6, 48, 1000);
    const power = fleet.reduce((s, x) => s + pool.find((c) => c.ship.id === x.id)!.power, 0);
    expect(power).toBeGreaterThanOrEqual(1000 * AUTO_AHEAD);
    expect(fleet.length).toBeLessThan(6);
  });

  it('never puts a submarine at the head while a surface ship sails', () => {
    const fleet = autoFleet([cand('i19', 3, 5000), cand('fubuki', 2, 200)], 2, 10);
    expect(fleet[0].id).toBe('fubuki');
  });

  it('gives nothing when nothing can sail', () => {
    expect(autoFleet([], 3, 20)).toEqual([]);
  });
});

describe('士気順 (#357)', () => {
  it('sorts the highest morale first', () => {
    const morale: Record<string, number> = { yamato: 30, nagato: 80, fubuki: 55 };
    const sorted = filterAndSort([byId('yamato'), byId('nagato'), byId('fubuki')], KindFilter.All, ShipSort.Morale, (id) => morale[id]);
    expect(sorted.map((s) => s.id)).toEqual(['nagato', 'fubuki', 'yamato']);
  });
});
