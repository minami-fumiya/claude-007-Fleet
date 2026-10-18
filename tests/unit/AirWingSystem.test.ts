import { describe, it, expect } from 'vitest';
import { createAirWing, land, launch, lose, REARM_MS, SQUADRON_SIZE, tickAirWing, totalPlanes } from '@/systems/AirWingSystem';
import { AircraftType } from '@/types/Aircraft';

const wing = (): ReturnType<typeof createAirWing> => createAirWing({ fighters: 4, diveBombers: 5, torpedoBombers: 2 });

describe('AirWingSystem', () => {
  it('starts with every plane ready', () => {
    const s = wing();
    expect(s.ready[AircraftType.DiveBomber]).toBe(5);
    expect(totalPlanes(s)).toBe(11);
  });

  it('launches at most a squadron and never more than are ready', () => {
    const a = launch(wing(), AircraftType.DiveBomber);
    expect(a.count).toBe(SQUADRON_SIZE);
    expect(a.state.ready[AircraftType.DiveBomber]).toBe(2);
    expect(a.state.aloft[AircraftType.DiveBomber]).toBe(3);
    const b = launch(wing(), AircraftType.TorpedoBomber);
    expect(b.count).toBe(2);
    const c = launch(b.state, AircraftType.TorpedoBomber);
    expect(c.count).toBe(0);
    expect(c.state).toBe(b.state);
  });

  it('lands survivors for re-arming and counts losses', () => {
    const { state } = launch(wing(), AircraftType.DiveBomber);
    const landed = land(state, AircraftType.DiveBomber, 3, 2, 1000);
    expect(landed.aloft[AircraftType.DiveBomber]).toBe(0);
    expect(landed.lost).toBe(1);
    expect(landed.rearming).toEqual([{ type: AircraftType.DiveBomber, count: 2, readyAt: 1000 + REARM_MS }]);
    expect(totalPlanes(landed)).toBe(10);
  });

  it('returns re-armed planes to the ready pool when their time comes', () => {
    const { state } = launch(wing(), AircraftType.DiveBomber);
    const landed = land(state, AircraftType.DiveBomber, 3, 3, 0);
    expect(tickAirWing(landed, REARM_MS - 1)).toBe(landed);
    const ready = tickAirWing(landed, REARM_MS);
    expect(ready.ready[AircraftType.DiveBomber]).toBe(5);
    expect(ready.rearming).toEqual([]);
  });

  it('re-arms faster with a shorter re-arm time (aviation research)', () => {
    const fast = createAirWing({ fighters: 4, diveBombers: 5, torpedoBombers: 2 }, REARM_MS * 0.8);
    const { state } = launch(fast, AircraftType.DiveBomber);
    const landed = land(state, AircraftType.DiveBomber, 3, 3, 0);
    expect(tickAirWing(landed, REARM_MS * 0.8).ready[AircraftType.DiveBomber]).toBe(5);
  });

  it('loses a whole squadron', () => {
    const { state } = launch(wing(), AircraftType.Fighter);
    const s = lose(state, AircraftType.Fighter, 3);
    expect(s.lost).toBe(3);
    expect(totalPlanes(s)).toBe(8);
  });
});
