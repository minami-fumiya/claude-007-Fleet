import { describe, it, expect } from 'vitest';
import { classKey, className, hullNumber, shipClasses, shipOrder } from '@/systems/ShipOrder';
import { buildNameShown, HIDDEN_NAME, hiddenShipName } from '@/systems/RevealSystem';
import { filterEntries } from '@/systems/EncyclopediaSystem';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { BuildState } from '@/systems/ShipyardSystem';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';

const ROSTERS: Record<string, IShipData[]> = { ijn: ijn.ships, usn: usn.ships, km: km.ships, rn: rn.ships, fr: fr.ships, su: su.ships, rm: rm.ships } as unknown as Record<string, IShipData[]>;
const byId = (roster: IShipData[], id: string): IShipData => roster.find((s) => s.id === id)!;

describe('ship classes and hull order (#246)', () => {
  it('every ship has a year, and every class points at a ship of the same kind in the roster', () => {
    for (const [n, roster] of Object.entries(ROSTERS)) {
      for (const s of roster) {
        expect(s.year, `${n} ${s.id}`).toBeTypeOf('number');
        const lead = roster.find((x) => x.id === classKey(s));
        expect(lead, `${n} ${s.id} → ${classKey(s)}`).toBeDefined();
        expect(lead!.shipClass, `${n} ${s.id}`).toBe(s.shipClass);
        expect(lead!.classOf ?? lead!.sisterOf, `${n} lead ${lead!.id} is no sister`).toBeUndefined();
      }
    }
  });

  it('lists run class by class, oldest class first; the lead first inside each, every ship once', () => {
    for (const [n, roster] of Object.entries(ROSTERS)) {
      for (const c of Object.values(ShipClass)) {
        const ships = roster.filter((s) => s.shipClass === c);
        const groups = shipClasses(ships);
        for (let i = 1; i < groups.length; i++) expect(groups[i].year, `${n} ${groups[i].key}`).toBeGreaterThanOrEqual(groups[i - 1].year);
        for (const g of groups) expect(g.ships[0].id, `${n} ${g.key}`).toBe(g.key);
        const order = shipOrder(ships);
        expect(order.map((s) => s.id).sort()).toEqual(ships.map((s) => s.id).sort());
        // A class is never split across the list.
        const keys = order.map(classKey).filter((k, i, a) => i === 0 || a[i - 1] !== k);
        expect(new Set(keys).size, `${n} ${c}`).toBe(keys.length);
      }
    }
  });

  it('hull numbers: 長門 1 / 陸奥 2, ビスマルク 1 / ティルピッツ 2, the Iowas in order', () => {
    const j = ROSTERS.ijn;
    expect(hullNumber(j, byId(j, 'nagato'))).toEqual({ className: '長門型', number: 1, of: 2 });
    expect(hullNumber(j, byId(j, 'mutsu')).number).toBe(2);
    expect(hullNumber(j, byId(j, 'kongo'))).toMatchObject({ className: '金剛型', number: 1, of: 4 });
    expect(hullNumber(j, byId(j, 'kirishima')).number).toBe(4);
    const k = ROSTERS.km;
    expect(hullNumber(k, byId(k, 'tirpitz'))).toEqual({ className: 'ビスマルク級', number: 2, of: 2 });
    const u = ROSTERS.usn;
    expect(hullNumber(u, byId(u, 'iowa')).number).toBe(1);
    expect(hullNumber(u, byId(u, 'missouri')).number).toBeGreaterThan(hullNumber(u, byId(u, 'new_jersey')).number);
    expect(className({ name: 'U ボート VIIC 型 (Type VIIC)', nation: 'KM' } as IShipData)).toBe('U ボート VIIC 型');
  });

  it('the 図鑑 lists by kind, then in class order', () => {
    const j = ROSTERS.ijn;
    const battleships = filterEntries(j, ShipClass.Battleship).map((s) => s.id);
    expect(battleships.indexOf('kongo')).toBeLessThan(battleships.indexOf('nagato'));
    expect(battleships.indexOf('nagato')).toBe(battleships.indexOf('mutsu') - 1);
    expect(battleships.indexOf('yamato')).toBe(battleships.indexOf('musashi') - 1);
  });
});

describe('what is out of reach stays nameless (#245)', () => {
  it('the shipyard hides ships locked by research, rank, medal, or kept for a reward', () => {
    const hidden: BuildState[] = ['reward', 'research', 'fictional', 'rank', 'medal'];
    const shown: BuildState[] = ['owned', 'building', 'ready', 'resources', 'dock'];
    for (const s of hidden) expect(buildNameShown(s), s).toBe(false);
    for (const s of shown) expect(buildNameShown(s), s).toBe(true);
  });

  it('a hidden ship is ？？？, or "長門型 ？番艦" once a ship of its class is owned', () => {
    const j = ROSTERS.ijn;
    expect(hiddenShipName(j, byId(j, 'mutsu'), [])).toBe(HIDDEN_NAME);
    expect(hiddenShipName(j, byId(j, 'mutsu'), ['nagato'])).toBe('長門型 ？番艦');
    expect(hiddenShipName(j, byId(j, 'mutsu'), ['mutsu'])).toBe(HIDDEN_NAME);
  });
});
