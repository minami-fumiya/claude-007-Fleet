import { describe, it, expect } from 'vitest';
import { COST_CAP, COST_CAPS_COVER_RANKS, costCap, costOverText, costText, fitsCost, fleetCost, shipCost } from '@/systems/FleetCost';
import { sortieBlockers } from '@/systems/ProgressionSystem';
import { ALL_MISSION_MEDALS, ALL_MISSIONS_DONE, RANKS } from '@/systems/RankSystem';
import { resources } from '@/systems/ResourceSystem';
import { emptyProgress, IProgress } from '@/utils/ProgressStore';
import { MEDALS } from '@/systems/RecordSystem';
import { IShipData } from '@/types/Ship';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';

const ALL = [ijn, usn, km, rn, fr, su, rm].flatMap((d) => d.ships as IShipData[]);
const byId = (id: string): IShipData => ALL.find((s) => s.id === id)!;

describe('出撃コスト (#306)', () => {
  it('weighs ships by size: escorts and destroyers light, the biggest battleships and fictional designs heavy', () => {
    expect(shipCost(byId('etorofu'))).toBe(1);
    expect(shipCost(byId('fubuki'))).toBe(2);
    expect(shipCost(byId('sendai'))).toBe(3);
    expect(shipCost(byId('takao'))).toBe(4);
    expect(shipCost(byId('kongo'))).toBeGreaterThanOrEqual(5);
    expect(shipCost(byId('yamato'))).toBeGreaterThan(shipCost(byId('kongo')));
    expect(shipCost(byId('a150'))).toBeGreaterThan(shipCost(byId('yamato')));
    // Each remodel stage adds one.
    expect(shipCost(byId('fubuki'), 3)).toBe(5);
    expect(fleetCost([byId('fubuki'), byId('takao')], { takao: 1 })).toBe(7);
  });

  it('every ship costs 1〜10, and within a navy a battleship never costs less than a destroyer', () => {
    for (const s of ALL) {
      expect(shipCost(s), s.id).toBeGreaterThanOrEqual(1);
      expect(shipCost(s), s.id).toBeLessThanOrEqual(10);
    }
  });

  it('the cap rises with the rank, from a destroyer and more at 准尉 to 48 at 元帥', () => {
    expect(COST_CAPS_COVER_RANKS).toBe(true);
    for (let i = 1; i < COST_CAP.length; i++) expect(COST_CAP[i], RANKS[i].name).toBeGreaterThanOrEqual(COST_CAP[i - 1]);
    expect(costCap(1)).toBe(6);
    expect(costCap(13)).toBe(48);
    expect(costCap(99)).toBe(48);
    // Every rank's slots can be filled with destroyers, but not with its biggest battleships.
    for (const r of RANKS) expect(r.slots * 2, r.name).toBeLessThanOrEqual(costCap(r.index));
    expect(RANKS[8].slots * shipCost(byId('nagato'))).toBeGreaterThan(costCap(8));
  });

  it('says how much a fleet is over, and whether a ship still fits', () => {
    expect(costText(14, 16)).toBe('コスト 14 / 16');
    expect(costOverText(16, 16)).toBeNull();
    expect(costOverText(18, 16)).toBe('コストが超過: 18 / 16 (2 超過)');
    const fleet = [byId('fubuki'), byId('takao')];
    expect(fitsCost(byId('sendai'), fleet, 9)).toBe(true);
    expect(fitsCost(byId('sendai'), fleet, 8)).toBe(false);
    // In place of the cruiser it fits.
    expect(fitsCost(byId('sendai'), fleet, 8, {}, byId('takao'))).toBe(true);
  });

  it('a fleet over its cap cannot sortie', () => {
    const p: IProgress = { ...emptyProgress(), resources: resources({ fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 }), rankStats: ALL_MISSIONS_DONE };
    const at = (rankFloor: number): IProgress => ({ ...p, rankFloor, record: { ...p.record, medals: ALL_MISSION_MEDALS } });
    const fleet = [byId('nagato'), byId('mutsu'), byId('takao')];
    expect(sortieBlockers(at(5), fleet, 0, { exercise: true }).some((r) => r.startsWith('コストが超過'))).toBe(true);
    expect(sortieBlockers(at(6), fleet, 0, { exercise: true }).some((r) => r.startsWith('コストが超過'))).toBe(false);
  });

  it('brings medals for a fleet at its cap and a light one', () => {
    for (const id of ['full_cost', 'full_cost_3', 'light_cost', 'light_cost_3']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
  });
});
