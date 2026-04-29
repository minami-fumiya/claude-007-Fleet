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
