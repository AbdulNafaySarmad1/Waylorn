import 'server-only';

/**
 * Server-side session storage (ADR 0009). Tokens never leave the server. The in-memory
 * implementation is single-instance; a shared (Valkey) implementation is required before
 * running more than one replica.
 */
export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStore<T> implements KeyValueStore<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): Promise<T | undefined> {
    this.sweep();
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(undefined);
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }

  get size(): number {
    return this.entries.size;
  }

  private sweep(): void {
    const now = this.now();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.entries) if (v.expiresAt <= now) this.entries.delete(k);
  }
}

// One store per server process, shared across route handlers and server components.
const registry = globalThis as typeof globalThis & { __waylornStores?: Map<string, MemoryStore<unknown>> };

export function memoryStore<T>(namespace: string): KeyValueStore<T> {
  registry.__waylornStores ??= new Map();
  let store = registry.__waylornStores.get(namespace);
  if (!store) {
    store = new MemoryStore<unknown>();
    registry.__waylornStores.set(namespace, store);
  }
  return store as KeyValueStore<T>;
}
