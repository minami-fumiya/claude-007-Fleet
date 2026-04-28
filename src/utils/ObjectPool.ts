export class ObjectPool<T> {
  private available: T[] = [];
  private active: Set<T> = new Set();
  private readonly factory: () => T;
  private readonly onGet: (item: T) => void;
  private readonly onRelease: (item: T) => void;

  constructor(
    factory: () => T,
    onGet: (item: T) => void = () => undefined,
    onRelease: (item: T) => void = () => undefined,
    initialSize = 0,
  ) {
    this.factory = factory;
    this.onGet = onGet;
    this.onRelease = onRelease;
    for (let i = 0; i < initialSize; i++) {
      this.available.push(factory());
    }
  }

  get(): T {
    const item = this.available.pop() ?? this.factory();
    this.active.add(item);
    this.onGet(item);
    return item;
  }

  release(item: T): void {
    if (this.active.delete(item)) {
      this.onRelease(item);
      this.available.push(item);
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  get availableCount(): number {
    return this.available.length;
  }
}
