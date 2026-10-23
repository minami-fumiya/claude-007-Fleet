import { describe, it, expect } from 'vitest';
import { allyArrived, defaultMission, missionFoes, MISSION_LABEL, MISSIONS, resolveSupport, sailingIds, supportSlots } from '@/systems/FleetGroups';
import { sortieBlockers } from '@/systems/ProgressionSystem';
import { resources } from '@/systems/ResourceSystem';
import { emptyProgress, parseSave } from '@/utils/ProgressStore';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Formation } from '@/types/Formation';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import campaign from '@/data/campaign.json';

const IJN = ijn.ships as IShipData[];
const ALL = [ijn, usn, km, rn, fr, su, rm].flatMap((d) => d.ships as IShipData[]);
const preset = (ids: string[]) => ({ slotIds: ids, captainIds: ids.map(() => null), formation: Formation.LineAhead });

describe('支援艦隊 (#84)', () => {
  it('opens with the rank: one at 少佐, two at 准将, three at 大将', () => {
    expect(supportSlots(5)).toBe(0);
    expect(supportSlots(6)).toBe(1);
    expect(supportSlots(9)).toBe(2);
    expect(supportSlots(12)).toBe(3);
    expect(MISSIONS.every((m) => MISSION_LABEL[m])).toBe(true);
  });

  it('takes the saved setups ships, none twice, none from the main fleet or unavailable', () => {
    const presets = [preset(['nagato', 'fubuki']), preset(['fubuki', 'yukikaze', 'mutsuki']), null];
    const out = resolveSupport([{ preset: 0, mission: 'strike' }, { preset: 1, mission: 'asw' }, { preset: 2, mission: 'air' }], presets, IJN, ['nagato'], 3, (id) => id === 'mutsuki');
    expect(out.map((g) => g.ships.map((s) => s.id))).toEqual([['fubuki'], ['yukikaze']]);
    expect(out[1].mission).toBe('asw');
    // The rank allows only one.
    expect(resolveSupport([{ preset: 0, mission: 'strike' }, { preset: 1, mission: 'asw' }], presets, IJN, [], 1)).toHaveLength(1);
  });

  it('a sortie with support fleets keeps each fleet under the cost cap and blocks their ships while out', () => {
    const fleet = (ids: string[]) => ids.map((id) => IJN.find((s) => s.id === id)!);
    const p = { ...emptyProgress(), resources: resources({ fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 }), rankFloor: 1 };
    const main = fleet(['fubuki', 'yukikaze']);
    const support = fleet(['mutsuki', 'akatsuki']);
    // Each fleet is 4 against a cap of 6: fine apart, 8 together would not be.
    expect(sortieBlockers(p, [...main, ...support], 0, { exercise: true, fleets: [main, support] }).filter((r) => r.includes('コスト'))).toEqual([]);
    expect(sortieBlockers(p, [...main, ...support], 0, { exercise: true }).some((r) => r.includes('コスト'))).toBe(true);
    const sortie = { shipIds: ['fubuki'], support: [{ shipIds: ['mutsuki'], captainIds: [null], mission: 'strike' as const }] };
    expect(sailingIds(sortie)).toEqual(['fubuki', 'mutsuki']);
  });

  it('missions: ASW sweeps go for submarines first, carrier-only fleets support from the air', () => {
    const foes = [{ shipClass: ShipClass.Battleship, alive: true }, { shipClass: ShipClass.Submarine, alive: true }];
    expect(missionFoes('asw', foes)).toEqual([foes[1]]);
    expect(missionFoes('strike', foes)).toEqual(foes);
    expect(missionFoes('asw', [foes[0]])).toEqual([foes[0]]);
    expect(defaultMission([{ shipClass: ShipClass.Carrier }])).toBe('air');
    expect(defaultMission([{ shipClass: ShipClass.Carrier }, { shipClass: ShipClass.Destroyer }])).toBe('strike');
  });

  it('a save without them reads empty', () => {
    const np = parseSave(JSON.stringify({ version: 1, nations: { IJN: { ships: ['fubuki'], support: [{ preset: 1, mission: 'escort' }, { preset: 9 }] } } })).nations.IJN!;
    expect(np.support).toEqual([{ preset: 1, mission: 'escort' }]);
  });
});

describe('友軍艦隊 (#64)', () => {
  it('arrive on time, and every ally in the campaign data is a real ship of its nation', () => {
    expect(allyArrived({}, 0)).toBe(true);
    expect(allyArrived({ arriveSec: 60 }, 59)).toBe(false);
    expect(allyArrived({ arriveSec: 60 }, 60)).toBe(true);
    const areas = campaign.areas as Array<{ id: string; allies?: Array<{ nation: string; ships: string[]; for?: string[] }> }>;
    const withAllies = areas.filter((a) => a.allies && a.allies.length > 0);
    expect(withAllies.length).toBeGreaterThanOrEqual(3);
    for (const a of withAllies) {
      for (const ally of a.allies ?? []) {
        for (const id of ally.ships) expect(ALL.find((s) => s.id === id)?.nation, `${a.id} ${id}`).toBe(ally.nation);
        expect(ally.for?.length ?? 1, a.id).toBeGreaterThan(0);
      }
    }
  });
});
