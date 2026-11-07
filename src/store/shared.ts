/**
 * One instance per page, however many copies of DialKit's code are loaded.
 * Framework entries, `dialkit/store`, and the ESM and CJS builds each bundle
 * their own copy of a store class, but they must all see the same state.
 */
export function pageSingleton<T>(name: string, create: () => T): T {
  const registry = globalThis as unknown as Record<symbol, T | undefined>;
  const key = Symbol.for(`dialkit.v2.${name}`);
  return (registry[key] ??= create());
}

const warned = new Set<string>();

/** Config mistakes surface once, however often the config is parsed. */
export function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[dialkit] ${message}`);
}

/** A throwing subscriber must not stop other subscribers or the store's own work. */
export function callListeners<A extends unknown[]>(
  listeners: Iterable<(...args: A) => void> | undefined,
  ...args: A
): void {
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(...args);
    } catch (error) {
      console.error('[dialkit] A subscriber threw:', error);
    }
  }
}
