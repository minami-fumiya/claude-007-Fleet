import { describe, it, expect } from 'vitest';
import {
  aiConsumable, canUse, CLASS_CONSUMABLES, CONSUMABLES, hiddenBySmoke, IConsumableSituation, isActive, repairPerSec, REPAIR_SHARE, shipConsumables, slotLabel, SMOKE_RADIUS, SMOKE_SPOT, useConsumable,
} from '@/systems/ConsumableSystem';
import { ShipClass } from '@/types/ShipClass';
import techTree from '@/data/tech-tree.json';

const calm: IConsumableSituation = { hpFraction: 1, seen: true, raidNear: false, hiddenFoes: false, foesNear: true, burning: false };

describe('消耗品 (#47)', () => {
  it('two slots per class, each opened by research that exists', () => {
    const ids = new Set(techTree.tech.map((n) => n.id));
    for (const c of Object.values(ShipClass)) expect(CLASS_CONSUMABLES[c]).toHaveLength(2);
    for (const def of Object.values(CONSUMABLES)) {
      expect(ids.has(def.requires), def.kind).toBe(true);
      expect(ids.has(def.extraChargeAt), def.kind).toBe(true);
    }
    expect(shipConsumables(ShipClass.Destroyer, [])).toEqual([]);
    const dd = shipConsumables(ShipClass.Destroyer, ['night_2', 'engine_2', 'engine_6']);
    expect(dd.map((s) => [s.kind, s.left])).toEqual([['smoke', 2], ['boost', 3]]);
    expect(shipConsumables(ShipClass.Battleship, 'enemy').map((s) => s.left)).toEqual([1, 1]);
  });

  it('a charge runs its effect, then cools down', () => {
    const [slot] = shipConsumables(ShipClass.Destroyer, ['night_2']);
    const used = useConsumable(slot, 1000)!;
    expect(used.left).toBe(1);
    expect(isActive([used], 'smoke', 1000 + CONSUMABLES.smoke.durationMs - 1)).toBe(true);
    expect(isActive([used], 'smoke', 1000 + CONSUMABLES.smoke.durationMs)).toBe(false);
    expect(useConsumable(used, 2000)).toBeNull();
    expect(canUse(used, 1000 + CONSUMABLES.smoke.durationMs + CONSUMABLES.smoke.cooldownMs)).toBe(true);
    expect(slotLabel(slot, 0)).toBe('煙幕 2');
    expect(slotLabel(used, 2000)).toBe('煙幕 中 19');
    expect(slotLabel(used, 1000 + CONSUMABLES.smoke.durationMs)).toBe('煙幕 待 50');
    expect(slotLabel({ ...used, left: 0, readyAt: 0, activeUntil: 0 }, 0)).toBe('煙幕 —');
    expect(repairPerSec(1000) * (CONSUMABLES.repair.durationMs / 1000)).toBeCloseTo(1000 * REPAIR_SHARE);
  });

  it('AI ships use them when the moment calls for it', () => {
    const bb = shipConsumables(ShipClass.Battleship, 'enemy');
    expect(aiConsumable(bb, calm, 0)).toBeNull();
    expect(aiConsumable(bb, { ...calm, hpFraction: 0.4 }, 0)).toBe('repair');
    const dd = shipConsumables(ShipClass.Destroyer, 'enemy');
    expect(aiConsumable(dd, { ...calm, hpFraction: 0.5 }, 0)).toBe('smoke');
    const cv = shipConsumables(ShipClass.Carrier, 'enemy');
    expect(aiConsumable(cv, { ...calm, raidNear: true }, 0)).toBe('aa');
    const ca = shipConsumables(ShipClass.Cruiser, 'enemy');
    expect(aiConsumable(ca, { ...calm, hiddenFoes: true }, 0)).toBe('radar');
  });

  it('smoke hides a ship from all but the closest enemy', () => {
    const clouds = [{ x: 0, y: 0, until: 100 }];
    expect(hiddenBySmoke(10, 10, clouds, [{ x: 600, y: 0 }], 50)).toBe(true);
    expect(hiddenBySmoke(10, 10, clouds, [{ x: SMOKE_SPOT - 20, y: 10 }], 50)).toBe(false);
    expect(hiddenBySmoke(SMOKE_RADIUS + 50, 0, clouds, [{ x: 900, y: 0 }], 50)).toBe(false);
    expect(hiddenBySmoke(10, 10, clouds, [{ x: 600, y: 0 }], 100)).toBe(false);
  });
});
