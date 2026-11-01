import { describe, expect, it } from 'vitest';
import { favoriteMark, favoritesFirst, isFavorite, toggleFavorite } from '@/systems/FavoriteSystem';
import { filterAndSort, KIND_FILTERS, KindFilter, ShipSort } from '@/systems/ShipKind';
import { FOREIGN_NEED, FOREIGN_OFFERS, fragmentKey, fragmentNeed, fragmentNote, fragmentsOf, migrateFragments, offerFor, rollFragment } from '@/systems/ForeignShipSystem';
import { buildState } from '@/systems/ShipyardSystem';
import { SHOP_ENTRIES } from '@/systems/GoldSystem';
import { objectiveResult } from '@/systems/ObjectiveSystem';
import { battleRank, CONVOY_S_HP, rankShortfall } from '@/systems/BattleRank';
import { HELP_PAGE_CHARS, pagesOf, paginate, SCREEN_HELP } from '@/systems/ScreenHelp';
import { MEDALS } from '@/systems/RecordSystem';
import { QUEST_EVENTS } from '@/systems/QuestSystem';
import { emptyProgress, parseProgress } from '@/utils/ProgressStore';
import { Objective } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { RESOURCE_KEYS } from '@/systems/ResourceSystem';

const SHIPS = Object.values(import.meta.glob('@/data/ships/*.json', { eager: true }) as Record<string, { ships: IShipData[] }>).flatMap((m) => m.ships);

const ship = (id: string, hp: number, shipClass = ShipClass.Destroyer): { id: string; shipClass: ShipClass; hp: number; speed: number } => ({ id, shipClass, hp, speed: 30 });

describe('0.0.60 お気に入りと入れ替え候補 (#419)', () => {
  it('a star marks and unmarks a ship, and favourites come first under every sort', () => {
    let fav = toggleFavorite(undefined, 'b');
    expect(isFavorite(fav, 'b')).toBe(true);
    fav = toggleFavorite(fav, 'c');
    expect(favoriteMark(fav, 'c')).toBe('★ ');
    expect(favoritesFirst([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], fav).map((s) => s.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(toggleFavorite(fav, 'b')).toEqual(['c']);
    const list = [ship('a', 10), ship('b', 50), ship('c', 30), ship('d', 99)];
    expect(filterAndSort(list, KindFilter.All, ShipSort.Hp, () => 0, ['a', 'c']).map((s) => s.id)).toEqual(['c', 'a', 'd', 'b']);
    expect(filterAndSort(list, KindFilter.Favorite, ShipSort.Default, () => 0, ['c']).map((s) => s.id)).toEqual(['c']);
    expect(KIND_FILTERS.some((k) => k.id === KindFilter.Favorite)).toBe(true);
  });

  it('the save reads the favourites and the picker toggle with defaults', () => {
    const p = emptyProgress();
    expect(p.favorites).toEqual([]);
    expect(p.pickerShowAssigned).toBe(true);
    const back = parseProgress(JSON.stringify({ ...p, favorites: ['yamato', 'yamato', 3], pickerShowAssigned: false }));
    expect(back.favorites).toEqual(['yamato']);
    expect(back.pickerShowAssigned).toBe(false);
    const { favorites: _f, pickerShowAssigned: _s, ...old } = p;
    const legacy = parseProgress(JSON.stringify(old));
    expect(legacy.favorites).toEqual([]);
    expect(legacy.pickerShowAssigned).toBe(true);
  });

  it('a favourite flagship has its medal, counted by its own quest event', () => {
    expect(QUEST_EVENTS).toContain('favoriteFlagWin');
    const ids = MEDALS.map((m) => m.id);
    expect(ids.filter((id) => id.startsWith('favorite_flag')).length).toBe(2);
  });
});

describe('0.0.60 他国の設計図を艦ごとに (#420)', () => {
  it('each navy offers a destroyer, a light cruiser and (but the Soviets) a heavy cruiser; the need follows the size', () => {
    for (const [n, ids] of Object.entries(FOREIGN_OFFERS)) {
      const offers = ids.map((id) => SHIPS.find((s) => s.id === id && s.nation === n)!);
      expect(offers.every(Boolean), n).toBe(true);
      expect(offers.map(fragmentNeed).sort((a, b) => a - b), n).toEqual(n === Nation.SU ? [5, 8] : [5, 8, 12]);
    }
    expect(FOREIGN_NEED).toEqual({ destroyer: 5, light: 8, heavy: 12 });
  });

  it('a sunk ship leaves the plans of its own size; battleships and carriers leave none', () => {
    const always = (): number => 0;
    expect(rollFragment(SHIPS, Nation.USN, [{ id: 'x', shipClass: ShipClass.Cruiser, subtype: ShipSubtype.HeavyCruiser }], 'S', true, always)?.id).toBe('baltimore');
    expect(rollFragment(SHIPS, Nation.USN, [{ id: 'x', shipClass: ShipClass.Cruiser }], 'S', true, always)?.id).toBe('cleveland');
    expect(rollFragment(SHIPS, Nation.USN, [{ id: 'iowa', shipClass: ShipClass.Battleship }, { id: 'essex', shipClass: ShipClass.Carrier }], 'S', true, always)).toBeNull();
    // The Soviets have no heavy cruiser to offer: the light cruiser stands in.
    expect(offerFor(SHIPS, Nation.SU, { id: 'x', shipClass: ShipClass.Cruiser, subtype: ShipSubtype.HeavyCruiser })?.id).toBe('kirov');
    // A sunk offered ship leaves its own plans.
    expect(offerFor(SHIPS, Nation.USN, { id: 'fletcher', shipClass: ShipClass.Destroyer })?.id).toBe('fletcher');
  });

  it('the fragments count for that ship alone, under the builder\'s copy too', () => {
    expect(fragmentKey({ id: 'fletcher@IJN' })).toBe('fletcher');
    expect(fragmentsOf({ fletcher: 3 }, { id: 'fletcher@IJN' })).toBe(3);
    expect(fragmentsOf({ fletcher: 3 }, { id: 'cleveland@IJN' })).toBe(0);
    const fletcher = SHIPS.find((s) => s.id === 'fletcher')!;
    expect(fragmentNote(fletcher, 2, 3)).toBe('フレッチャーの設計図 +1 (3 / 5)');
    expect(fragmentNote(fletcher, 4, 5)).toContain('建造できるようになりました');
  });

  it('old per-navy counts carry over to each of that navy\'s ships (α 版の読み替え)', () => {
    expect(migrateFragments({ USN: 7 })).toEqual({ fletcher: 7, cleveland: 7, baltimore: 7 });
    expect(migrateFragments({ fletcher: 2, USN: 1 })).toEqual({ fletcher: 2, cleveland: 1, baltimore: 1 });
    expect(parseProgress(JSON.stringify({ ...emptyProgress(), foreignFragments: { KM: 4 } })).foreignFragments.z1).toBe(4);
  });

  it('a foreign ship waits for its own plans in the shipyard', () => {
    const copy = { ...SHIPS.find((s) => s.id === 'fletcher')!, id: 'fletcher@IJN', nation: Nation.IJN, foreign: Nation.USN };
    const p = { ...emptyProgress(), foreignFragments: { cleveland: 20 } };
    expect(buildState(p, [copy], copy)).toBe('foreign');
    expect(buildState({ ...p, foreignFragments: { fletcher: 5 } }, [copy], copy)).not.toBe('foreign');
  });
});

describe('0.0.60 ショップの大中小 (#420)', () => {
  it('every resource comes small, medium and large; the large is 2.5 times the medium and a tenth cheaper a unit', () => {
    for (const k of RESOURCE_KEYS) {
      const [s, m, l] = ['s', 'm', 'l'].map((size) => SHOP_ENTRIES.find((e) => e.id === `${k}_${size}`)!);
      expect(s && m && l, k).toBeTruthy();
      expect(l.give![k]).toBe(m.give![k]! * 2.5);
      const unitM = m.price / m.give![k]!;
      const unitL = l.price / l.give![k]!;
      expect(unitL / unitM, k).toBeGreaterThan(0.88);
      expect(unitL / unitM, k).toBeLessThan(0.92);
      expect(l.hourly).toBe(2);
      expect(m.name).toContain('(中)');
      expect(l.name).toContain('(大)');
    }
  });

  it('every item can be bought five at a time, a tenth cheaper', () => {
    const singles = SHOP_ENTRIES.filter((e) => e.items && !e.id.endsWith('_5'));
    expect(singles.length).toBe(5);
    for (const e of singles) {
      const bundle = SHOP_ENTRIES.find((x) => x.id === `${e.id}_5`)!;
      const [key, n] = Object.entries(e.items!)[0];
      expect(bundle.items).toEqual({ [key]: n * 5 });
      expect(bundle.price).toBeLessThan(e.price * 5);
      expect(bundle.price).toBeGreaterThanOrEqual(Math.floor(e.price * 5 * 0.9 / 10) * 10);
    }
  });
});

describe('0.0.60 作戦目標ごとの結果 (#421)', () => {
  const base = { flagshipAlive: true, enemiesAlive: 1, enemiesTotal: 4, elapsedSec: 200, timeLimitSec: 360 };
  it('every objective has three numbers of its own and an achievement line', () => {
    for (const o of Object.values(Objective)) {
      const r = objectiveResult(o, { ...base, convoyTotal: 4, convoyLost: 1, convoyHp: 300, convoyMaxHp: 400, landTargetsAlive: 1, landTargetsTotal: 5, targetsAlive: 0, targetsTotal: 1, flagshipInZone: true, escapeProgress: 0.4 }, { alive: 3, total: 4 });
      expect(r.stats.length, o).toBe(3);
      for (const s of r.stats) {
        expect(s.label.length, o).toBeGreaterThan(0);
        expect(s.value.length, o).toBeGreaterThan(0);
      }
      expect(r.achievement.length, o).toBeGreaterThan(4);
    }
    const convoy = objectiveResult(Objective.Convoy, { ...base, convoyTotal: 4, convoyLost: 1, convoyHp: 300, convoyMaxHp: 400 }, { alive: 3, total: 4 });
    expect(convoy.stats[0]).toEqual({ label: '船団の残り耐久', value: '75%' });
    expect(convoy.stats[1].value).toBe('3 / 4');
    const rush = objectiveResult(Objective.Breakthrough, { ...base, flagshipInZone: true }, { alive: 4, total: 4 });
    expect(rush.stats[0].value).toBe('3:20');
    expect(rush.stats[1].value).toBe('2:40');
    expect(objectiveResult(Objective.Bombard, { ...base, landTargetsAlive: 1, landTargetsTotal: 5 }, { alive: 4, total: 4 }).stats[0].value).toBe('4 / 5');
    expect(objectiveResult(Objective.Delay, base, { alive: 4, total: 4 }).stats[0].value).toBe('3:20 / 6:00');
  });

  it('a convoy escort needs most of the convoy kept for an S', () => {
    const win = { victory: true, fleetSize: 4, shipsLost: 0, hpRatio: 0.95, durationSec: 100, minShipHp: 0.9 };
    expect(battleRank({ ...win, convoyHp: CONVOY_S_HP })).toBe('S');
    expect(battleRank({ ...win, convoyHp: 0.6 })).toBe('A');
    expect(rankShortfall({ ...win, convoyHp: 0.6 })).toContain('船団の残り耐久 60%');
    expect(battleRank(win)).toBe('S');
  });
});

describe('0.0.60 ヘルプのページ (#421)', () => {
  it('every screen\'s help is in short, titled pages', () => {
    for (const h of SCREEN_HELP) {
      expect(h.pages.length, h.id).toBeGreaterThan(0);
      for (const pg of h.pages) {
        expect(pg.title.length, h.id).toBeGreaterThan(0);
        expect(pg.text.length, `${h.id} ${pg.title}`).toBeLessThanOrEqual(HELP_PAGE_CHARS);
      }
    }
    expect(SCREEN_HELP.find((h) => h.id === 'FleetBuilderScene')!.pages.length).toBeGreaterThanOrEqual(5);
  });

  it('old one-text help reads as a page a paragraph, and rows split into pages by height', () => {
    expect(pagesOf('編成', 'a\n\nb\nc')).toEqual([{ title: '編成 (1)', text: 'a' }, { title: '編成 (2)', text: 'b' }, { title: '編成 (3)', text: 'c' }]);
    expect(pagesOf('編成', 'a')).toEqual([{ title: '編成', text: 'a' }]);
    expect(paginate([40, 40, 40, 90, 10], (h) => h, 100)).toEqual([[40, 40], [40], [90, 10]]);
    expect(paginate([150], (h) => h, 100)).toEqual([[150]]);
  });
});
