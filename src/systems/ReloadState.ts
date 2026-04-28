export class ReloadState {
  private lastFiredAt = new WeakMap<object, number>();

  isReady(owner: object, reloadMs: number, now: number): boolean {
    return now - (this.lastFiredAt.get(owner) ?? 0) >= reloadMs;
  }

  markFired(owner: object, now: number): void {
    this.lastFiredAt.set(owner, now);
  }
}
