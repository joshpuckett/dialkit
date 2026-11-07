import { untrack } from 'svelte';
import { DialStore, flattenDialValueUpdates, isLeafConfigValue, resolveDialValues } from 'dialkit/store';
import type {
  DialConfig,
  DialKitPersistOptions,
  DialKitValueUpdates,
  DialValue,
  ResolvedValues,
  ShortcutConfig,
} from 'dialkit/store';

export interface CreateDialOptions {
  id?: string;
  defaultCollapsed?: boolean;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}

export type DialKitValues<T> = T;

export interface DialKitController<T extends DialConfig> {
  values: DialKitValues<ResolvedValues<T>>;
  setValue: (path: string, value: DialValue) => void;
  setValues: (values: DialKitValueUpdates<T>) => void;
  resetValues: () => void;
  setOpen: (open: boolean) => void;
  getOpen: () => boolean | undefined;
  getValues: () => ResolvedValues<T>;
}

let dialKitInstance = 0;

export function createDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): DialKitValues<ResolvedValues<T>> {
  return createDialKitController(name, config, options).values;
}

export function createDialKitController<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): DialKitController<T> {
  const hasStableId = options?.id !== undefined;
  // Not derived from the name: renaming a panel must not discard its tuned values.
  const panelId = options?.id ?? `dialkit-${++dialKitInstance}`;
  // 2.1's generated id, so data it saved for a panel without an id still loads.
  const legacyId = `${name}-${dialKitInstance}`;
  // Listeners can run inside someone else's effect, which must not pick up these reads.
  const resolve = () => untrack(() => resolveDialValues(config, DialStore.getValues(panelId)));
  const panelOptions = () => ({
    retainOnUnmount: hasStableId,
    legacyId,
    persist: options?.persist,
    defaultCollapsed: options?.defaultCollapsed,
  });

  let values = $state<ResolvedValues<T>>(resolve());

  const serializedConfig = $derived(JSON.stringify(config));
  const serializedShortcuts = $derived(JSON.stringify(options?.shortcuts));
  const serializedPersist = $derived(JSON.stringify(options?.persist));

  $effect(() => {
    untrack(() => DialStore.registerPanel(panelId, name, config, options?.shortcuts, panelOptions()));
    values = resolve();

    const unsubValues = DialStore.subscribe(panelId, () => {
      values = resolve();
    });
    const unsubActions = DialStore.subscribeActions(panelId, (action) => {
      options?.onAction?.(action);
    });

    return () => {
      unsubValues();
      unsubActions();
      DialStore.unregisterPanel(panelId);
    };
  });

  // Push changes without re-registering. The first run only records the
  // dependencies: the effect above has just registered this same state.
  let registered = false;
  $effect(() => {
    void serializedConfig;
    void serializedShortcuts;
    void serializedPersist;
    if (!registered) {
      registered = true;
      return;
    }
    untrack(() => DialStore.updatePanel(panelId, name, config, options?.shortcuts, panelOptions()));
  });

  return {
    values: reactiveValues(config, () => values) as DialKitValues<ResolvedValues<T>>,
    setOpen(open) { DialStore.setPanelOpen(panelId, open); },
    getOpen() { return DialStore.getPanelOpen(panelId); },
    setValue(path, value) {
      DialStore.updateValue(panelId, path, value);
    },
    setValues(nextValues) {
      DialStore.updateValues(panelId, flattenDialValueUpdates(config, nextValues));
    },
    resetValues() {
      DialStore.resetValues(panelId);
    },
    getValues() {
      return resolve();
    },
  };
}

/** A stable object over the latest values. Reads follow the config's current
 * shape, so a control added after creation shows up on it too. */
function reactiveValues(config: DialConfig, getValues: () => unknown, prefix = ''): unknown {
  const folders = new Map<string, unknown>();
  const current = (): object => {
    const value = prefix ? getPathValue(getValues(), prefix) : getValues();
    return typeof value === 'object' && value !== null ? value : {};
  };

  return new Proxy({}, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      const path = prefix ? `${prefix}.${key}` : key;
      const configValue = getPathValue(config, path);
      if (typeof configValue === 'object' && configValue !== null && !isLeafConfigValue(configValue)) {
        if (!folders.has(key)) folders.set(key, reactiveValues(config, getValues, path));
        return folders.get(key);
      }
      return getPathValue(getValues(), path);
    },
    has(_target, key) {
      return typeof key === 'string' && key in current();
    },
    ownKeys() {
      return Reflect.ownKeys(current());
    },
    getOwnPropertyDescriptor(_target, key) {
      return typeof key === 'string' && key in current() ? { enumerable: true, configurable: true } : undefined;
    },
  });
}

function getPathValue(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, source);
}
