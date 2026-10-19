import { describe, it, expect } from 'vitest';
import { emptySave, parseSave, progressView, switchNation, withProgress } from '@/utils/ProgressStore';
import { sortieBlockers } from '@/systems/ProgressionSystem';
import { resources } from '@/systems/ResourceSystem';
import { Formation } from '@/types/Formation';
import { Nation } from '@/types/Nation';
import { ISortieState } from '@/types/Sortie';
import { IShipData } from '@/types/Ship';

const T0 = 1_700_000_000_000;
const sortie: ISortieState = {
  areaId: 'p4', route: [{ kind: 'battle', ships: ['fletcher'] }, { kind: 'boss', ships: ['fletcher', 'fletcher'] }], at: 0,
  nation: Nation.IJN, enemyNation: Nation.USN, shipIds: ['fubuki'], captainIds: [null], formation: Formation.LineAhead, fought: true,
};

describe('a sortie survives closing the game (#138)', () => {
  it('is saved and read back with the nation', () => {
    const save = switchNation(emptySave(), Nation.IJN, 'fubuki', T0);
    const p = { ...progressView(save), sortie };
    const back = progressView(parseSave(JSON.stringify(withProgress(save, p))));
    expect(back.sortie).toEqual(sortie);
    // A new nation, or a malformed entry, has none.
    expect(progressView(save).sortie).toBeNull();
    const broken = JSON.parse(JSON.stringify(withProgress(save, p)));
    broken.nations.IJN.sortie = { areaId: 'p4' };
    expect(progressView(parseSave(JSON.stringify(broken))).sortie).toBeNull();
  });

  it('its ships can not go out again until it is continued or withdrawn', () => {
    const save = switchNation(emptySave(), Nation.IJN, 'fubuki', T0);
    const p = { ...progressView(save), resources: resources({ fuel: 999, ammo: 999 }), sortie };
    const fubuki = { id: 'fubuki', name: '吹雪', shipClass: 'Destroyer', hp: 210 } as unknown as IShipData;
    expect(sortieBlockers(p, [fubuki], T0, { exercise: true })[0]).toContain('出撃中');
    expect(sortieBlockers({ ...p, sortie: null }, [fubuki], T0, { exercise: true })).toEqual([]);
  });
});
