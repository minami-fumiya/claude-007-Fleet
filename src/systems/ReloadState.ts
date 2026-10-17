export class ReloadState {
  private lastFiredAt = new WeakMap<object, number>();

  isReady(owner: object, reloadMs: number, now: number): boolean {
    return now - (this.lastFiredAt.get(owner) ?? 0) >= reloadMs;
  }

  /** Reload progress in [0, 1]; 1 means ready to fire. */
  progress(owner: object, reloadMs: number, now: number): number {
    if (reloadMs <= 0) return 1;
    const last = this.lastFiredAt.get(owner);
    if (last === undefined) return 1;
    return Math.min(1, Math.max(0, (now - last) / reloadMs));
  }

  markFired(owner: object, now: number): void {
    this.lastFiredAt.set(owner, now);
  }
}
