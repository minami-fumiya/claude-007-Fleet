import { describe, it, expect } from 'vitest';
import { ReloadState } from '@/systems/ReloadState';

describe('ReloadState', () => {
  it('is ready when never fired', () => {
    const state = new ReloadState();
    const owner = {};
    expect(state.isReady(owner, 1000, 5000)).toBe(true);
  });

  it('is not ready before reload completes', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 1000);
    expect(state.isReady(owner, 1500, 2000)).toBe(false); // 1000ms elapsed < 1500ms
  });

  it('is ready exactly at reload boundary', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 1000);
    expect(state.isReady(owner, 1500, 2500)).toBe(true); // exactly 1500ms
  });

  it('is not ready 1ms before boundary', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 1000);
    expect(state.isReady(owner, 1500, 2499)).toBe(false);
  });

  it('is ready long after reload completes', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 0);
    expect(state.isReady(owner, 500, 9999)).toBe(true);
  });

  it('two owners have independent state', () => {
    const state = new ReloadState();
    const owner1 = {};
    const owner2 = {};
    state.markFired(owner1, 1000);
    expect(state.isReady(owner1, 1500, 2000)).toBe(false);
    expect(state.isReady(owner2, 1500, 2000)).toBe(true);
  });

  it('tracks multiple fires for same owner', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 0);
    expect(state.isReady(owner, 1000, 800)).toBe(false);
    state.markFired(owner, 1000);
    expect(state.isReady(owner, 1000, 1500)).toBe(false);
    expect(state.isReady(owner, 1000, 2000)).toBe(true);
  });
});

describe('ReloadState.progress', () => {
  it('is 1 when never fired', () => {
    expect(new ReloadState().progress({}, 1000, 0)).toBe(1);
  });

  it('is 0 right after firing', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 1000);
    expect(state.progress(owner, 1000, 1000)).toBe(0);
  });

  it('is halfway at half the reload time', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 1000);
    expect(state.progress(owner, 1000, 1500)).toBeCloseTo(0.5);
  });

  it('clamps to 1 after reload completes', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 1000);
    expect(state.progress(owner, 1000, 9000)).toBe(1);
  });

  it('is 1 for zero reload time', () => {
    const state = new ReloadState();
    const owner = {};
    state.markFired(owner, 1000);
    expect(state.progress(owner, 0, 1000)).toBe(1);
  });
});

describe('ReloadState slots', () => {
  it('keeps one timer per weapon slot', () => {
    const state = new ReloadState();
    const ship = {};
    state.markFired(ship, 1000, 'gun');
    expect(state.isReady(ship, 1500, 2000, 'gun')).toBe(false);
    expect(state.isReady(ship, 1500, 2000, 'torpedo')).toBe(true);
    expect(state.progress(ship, 1000, 1500, 'gun')).toBeCloseTo(0.5);
    expect(state.progress(ship, 1000, 1500, 'torpedo')).toBe(1);
  });

  it('is ready at time 0 when never fired', () => {
    expect(new ReloadState().isReady({}, 1500, 0)).toBe(true);
  });
});
