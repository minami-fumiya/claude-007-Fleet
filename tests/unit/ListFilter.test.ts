import { describe, it, expect } from 'vitest';
import { filterShips, kindsOf, nextIn, NO_FILTER, normalizeQuery } from '@/systems/ListFilter';
import { IShipData } from '@/types/Ship';
import ijn from '@/data/ships/ijn.json';

const roster = ijn.ships as unknown as IShipData[];
const ids = (list: IShipData[]): string[] => list.map((s) => s.id);

describe('一覧の絞り込み (#263)', () => {
  it('folds width, case and katakana, so a name matches however it is typed', () => {
    expect(normalizeQuery('ナガト')).toBe('ながと');
    expect(normalizeQuery('ｶﾞﾝﾄ Ａ')).toBe('がんとa');
  });

  it('by state: what can be built now, owned, not owned', () => {
    const owned = ['nagato'];
    expect(ids(filterShips(roster, { ...NO_FILTER, state: 'owned' }, { owned }))).toEqual(['nagato']);
    expect(filterShips(roster, { ...NO_FILTER, state: 'unowned' }, { owned })).toHaveLength(roster.length - 1);
    expect(ids(filterShips(roster, { ...NO_FILTER, state: 'buildable' }, { owned, buildable: (s) => s.id === 'fubuki' }))).toEqual(['fubuki']);
  });

  it('by kind and by name, the ship\'s own or its class\'s; a hidden ship never matches a name', () => {
    const heavy = filterShips(roster, { ...NO_FILTER, kind: '重巡洋艦' }, { owned: [] });
    expect(heavy.length).toBeGreaterThan(5);
    expect(heavy.every((s) => s.subtype === 'HeavyCruiser')).toBe(true);
    // 長門型: 長門 and 陸奥 by the class name; Kongo by its romaji.
    expect(ids(filterShips(roster, { ...NO_FILTER, query: '長門型' }, { owned: [], roster }))).toEqual(expect.arrayContaining(['nagato', 'mutsu']));
    expect(ids(filterShips(roster, { ...NO_FILTER, query: 'kongo' }, { owned: [], roster }))).toContain('kongo');
    expect(filterShips(roster, { ...NO_FILTER, query: '長門' }, { owned: [], roster, nameKnown: () => false })).toEqual([]);
  });

  it('the kind button steps through the kinds present, then back to every kind', () => {
    const kinds = kindsOf(roster.filter((s) => s.shipClass === 'Battleship'));
    expect(kinds).toEqual(expect.arrayContaining(['戦艦', '巡洋戦艦', '航空戦艦']));
    expect(nextIn([null, 'a', 'b'], 'b')).toBeNull();
    expect(nextIn([null, 'a', 'b'], null)).toBe('a');
  });
});
