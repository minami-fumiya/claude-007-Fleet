/**
 * Reload timers per owner (a ship) and slot (one of its weapons). The slot defaults to a single
 * shared timer so callers with one weapon can ignore it.
 */
export class ReloadState {
  private lastFiredAt = new WeakMap<object, Map<string, number>>();

  private last(owner: object, slot: string): number | undefined {
    return this.lastFiredAt.get(owner)?.get(slot);
  }

  isReady(owner: object, reloadMs: number, now: number, slot = 'default'): boolean {
    return now - (this.last(owner, slot) ?? -Infinity) >= reloadMs;
  }

  /** Reload progress in [0, 1]; 1 means ready to fire. */
  progress(owner: object, reloadMs: number, now: number, slot = 'default'): number {
    if (reloadMs <= 0) return 1;
    const last = this.last(owner, slot);
    if (last === undefined) return 1;
    return Math.min(1, Math.max(0, (now - last) / reloadMs));
  }

  markFired(owner: object, now: number, slot = 'default'): void {
    const slots = this.lastFiredAt.get(owner) ?? new Map<string, number>();
    slots.set(slot, now);
    this.lastFiredAt.set(owner, slots);
  }
}
