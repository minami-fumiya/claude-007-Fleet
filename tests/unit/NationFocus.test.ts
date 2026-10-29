import { describe, it, expect } from 'vitest';
import focusData from '@/data/focus.json';
import {
  EMPTY_FOCUS, FOCUS_RESET_COST, focusBuildMul, focusModifiers, focusStatus, focusTree, focusUnlocks, IFocusNode, IFocusState,
  parseFocus, resetFocus, settleFocus, startFocus, unlockingFocus,
} from '@/systems/NationFocusSystem';
import { resources } from '@/systems/ResourceSystem';
import { ShipClass } from '@/types/ShipClass';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { IShipData } from '@/types/Ship';

const SHIPS = Object.values(import.meta.glob('@/data/ships/*.json', { eager: true }) as Record<string, { ships: IShipData[] }>).flatMap((m) => m.ships);
const rich = resources({ fuel: 99999, ammo: 99999, steel: 99999, bauxite: 99999 });
const done = (...ids: string[]): IFocusState => ({ done: ids, current: null });

describe('国家方針 (#49)', () => {
  it('every playable navy has a tree of 10–15 focuses whose links point inside it', () => {
    const nations = (focusData as unknown as { nations: Record<string, IFocusNode[]> }).nations;
    for (const n of PLAYABLE_NATIONS) {
      const tree = focusTree(n);
      expect(tree.length, n).toBeGreaterThanOrEqual(10);
      expect(tree.length, n).toBeLessThanOrEqual(15);
      const ids = new Set(tree.map((x) => x.id));
      expect(ids.size).toBe(tree.length);
      for (const x of tree) {
        for (const r of [...(x.requires ?? []), ...(x.requiresAny ?? []), ...(x.exclusive ?? [])]) expect(ids.has(r), `${x.id} → ${r}`).toBe(true);
        // A pair closes both ways.
        for (const e of x.exclusive ?? []) expect(tree.find((y) => y.id === e)!.exclusive, `${e} ↔ ${x.id}`).toContain(x.id);
        expect(x.minutes).toBeGreaterThan(0);
      }
      expect(Object.keys(nations)).toContain(n);
    }
  });

  it('opens every planned ship (架空艦) through exactly one focus of its own navy (#309)', () => {
    for (const s of SHIPS.filter((x) => x.fictional)) {
      const by = focusTree(s.nation).filter((n) => n.unlocks?.includes(s.id));
      expect(by.length, s.id).toBe(1);
    }
    for (const n of PLAYABLE_NATIONS) for (const x of focusTree(n)) for (const id of x.unlocks ?? []) expect(SHIPS.find((s) => s.id === id)?.fictional, id).toBe(true);
  });

  it('starts one focus at a time, after its requirements and rank, and pays for it', () => {
    expect(focusStatus('IJN', EMPTY_FOCUS, 'ijn_expand', 0, rich)).toBe('rank');
    expect(focusStatus('IJN', EMPTY_FOCUS, 'ijn_bigGun', 13, rich)).toBe('locked');
    expect(focusStatus('IJN', EMPTY_FOCUS, 'ijn_expand', 13, resources())).toBe('resources');
    const started = startFocus('IJN', EMPTY_FOCUS, 'ijn_expand', 13, rich, 1000)!;
    expect(started.state.current).toEqual({ id: 'ijn_expand', endsAt: 1000 + 20 * 60_000 });
    expect(started.resources.fuel).toBe(rich.fuel - 300);
    expect(focusStatus('IJN', started.state, 'ijn_expand', 13, rich)).toBe('active');
    expect(startFocus('IJN', started.state, 'ijn_expand', 13, rich, 1000)).toBeNull();
    expect(settleFocus(started.state, 2000).finished).toBeUndefined();
    const after = settleFocus(started.state, 1000 + 20 * 60_000);
    expect(after.finished).toBe('ijn_expand');
    expect(after.state).toEqual({ done: ['ijn_expand'], current: null });
    expect(focusStatus('IJN', after.state, 'ijn_bigGun', 13, rich)).toBe('ready');
    // Busy while another runs.
    const busy = startFocus('IJN', after.state, 'ijn_escort', 13, rich, 0)!.state;
    expect(focusStatus('IJN', busy, 'ijn_bigGun', 13, rich)).toBe('busy');
  });

  it('a pair takes one side only, and the other side\'s followers close with it', () => {
    const s = done('ijn_expand', 'ijn_bigGun');
    expect(focusStatus('IJN', s, 'ijn_air', 13, rich)).toBe('closed');
    expect(focusStatus('IJN', s, 'ijn_air2', 13, rich)).toBe('closed');
    expect(focusStatus('IJN', s, 'ijn_bigGun2', 13, rich)).toBe('ready');
    // Either side's end opens the last focus.
    expect(focusStatus('IJN', done('ijn_expand', 'ijn_air', 'ijn_air2', 'ijn_air3'), 'ijn_total', 13, rich)).toBe('ready');
  });

  it('見直し takes back a side and what came after it, for resources', () => {
    const s = done('ijn_expand', 'ijn_bigGun', 'ijn_bigGun2', 'ijn_bigGun3', 'ijn_total', 'ijn_escort');
    expect(resetFocus('IJN', s, 'ijn_bigGun', resources())).toBeNull();
    expect(resetFocus('IJN', s, 'ijn_expand', rich)).toBeNull();
    const r = resetFocus('IJN', s, 'ijn_bigGun', rich)!;
    expect(r.state.done).toEqual(['ijn_expand', 'ijn_escort']);
    expect(r.resources.steel).toBe(rich.steel - FOCUS_RESET_COST.steel);
    expect(focusStatus('IJN', r.state, 'ijn_air', 13, rich)).toBe('ready');
  });

  it('adds up its bonuses by class and its build discount', () => {
    const s = done('ijn_expand', 'ijn_bigGun', 'ijn_bigGun2', 'ijn_bigGun3', 'ijn_total');
    const bb = focusModifiers('IJN', s, ShipClass.Battleship);
    expect(bb.gunPowerMul).toBeCloseTo(1.05);
    expect(bb.armorAdd).toBe(2);
    expect(bb.hpMul).toBeCloseTo(1.05 * 1.03);
    expect(focusModifiers('IJN', s, ShipClass.Destroyer).gunPowerMul).toBe(1);
    expect(focusBuildMul('IJN', s)).toBeCloseTo(0.95 * 0.95);
    expect(focusBuildMul('IJN', EMPTY_FOCUS)).toBe(1);
  });

  it('opens a planned ship once its focus is done', () => {
    expect(unlockingFocus('IJN', 'a150')?.id).toBe('ijn_bigGun3');
    expect(focusUnlocks('IJN', done('ijn_bigGun3'), 'a150')).toBe(true);
    expect(focusUnlocks('IJN', done('ijn_bigGun2'), 'a150')).toBe(false);
    expect(focusUnlocks('IJN', done('ijn_bigGun3'), 'yamato')).toBe(false);
  });

  it('reads a stored state tolerantly', () => {
    expect(parseFocus(undefined)).toEqual(EMPTY_FOCUS);
    expect(parseFocus({ done: ['a', 'a', 3], current: { id: 'b', endsAt: 5 } })).toEqual({ done: ['a'], current: { id: 'b', endsAt: 5 } });
    expect(parseFocus({ done: 'x', current: { id: 1 } })).toEqual(EMPTY_FOCUS);
  });
});
