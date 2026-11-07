import { DialStore, flattenDialValueUpdates, resolveDialValues } from '../store/DialStore';
import type { DialConfig, DialKitPersistOptions, DialKitValueUpdates, DialValue, ResolvedValues, ShortcutConfig } from '../store/DialStore';
export interface CreateDialOptions {
  id?: string;
  defaultCollapsed?: boolean;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}
/** Options `updateConfig` can change. A key set to undefined clears that option. */
export interface DialKitUpdateOptions {
  name?: string;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}
export interface DialKitController<T extends DialConfig> {
  readonly id: string;
  readonly values: ResolvedValues<T>;
  getValues(): ResolvedValues<T>;
  setValue(path: string, value: DialValue): void;
  setValues(values: DialKitValueUpdates<T>): void;
  resetValues(): void;
  setOpen(open: boolean): void;
  getOpen(): boolean | undefined;
  /** Called immediately by default, then whenever the panel changes. */
  subscribe(listener: (values: ResolvedValues<T>) => void, immediate?: boolean): () => void;
  updateConfig(config: T, options?: DialKitUpdateOptions): void;
  /** Release this registration and all of its subscriptions. Safe to call twice. */
  destroy(): void;
}
let nextId = 0;
/** A framework-free panel with explicit subscriptions and lifecycle. */
export function createDialKit<T extends DialConfig>(name: string, config: T, options: CreateDialOptions = {}): DialKitController<T> {
  // Not derived from the name: renaming a panel must not discard its tuned values.
  const id = options.id ?? `vanilla-${++nextId}`;
  // 2.1's generated id, so data it saved for a panel without an id still loads.
  const legacyId = `vanilla-${name}-${nextId}`;
  let currentName = name;
  let currentConfig = config;
  let settings = options;
  let destroyed = false;
  const subscriptions = new Set<() => void>();
  // `persist` is always an explicit key, so removing the option removes persistence.
  const registration = () => ({ retainOnUnmount: options.id !== undefined, legacyId, persist: settings.persist, defaultCollapsed: settings.defaultCollapsed });
  const getValues = () => resolveDialValues(currentConfig, DialStore.getValues(id));
  DialStore.registerPanel(id, currentName, currentConfig, settings.shortcuts, registration());
  const stopActions = DialStore.subscribeActions(id, action => settings.onAction?.(action));
  return {
    id,
    get values() {
      return getValues();
    },
    getValues,
    setValue(path, value) {
      if (!destroyed)
        DialStore.updateValue(id, path, value);
    },
    setValues(values) {
      if (!destroyed)
        DialStore.updateValues(id, flattenDialValueUpdates(currentConfig, values));
    },
    resetValues() {
      if (!destroyed)
        DialStore.resetValues(id);
    },
    setOpen(open) {
      if (!destroyed)
        DialStore.setPanelOpen(id, open);
    },
    getOpen() {
      return DialStore.getPanelOpen(id);
    },
    subscribe(listener, immediate = true) {
      if (destroyed)
        return () => {
        };
      const stop = DialStore.subscribe(id, () => listener(getValues()));
      const unsubscribe = () => {
        stop();
        subscriptions.delete(unsubscribe);
      };
      subscriptions.add(unsubscribe);
      if (immediate)
        listener(getValues());
      return unsubscribe;
    },
    updateConfig(next, nextOptions = {}) {
      if (destroyed)
        return;
      const { name: nextName, ...rest } = nextOptions;
      currentName = nextName ?? currentName;
      currentConfig = next;
      settings = { ...settings, ...rest };
      DialStore.updatePanel(id, currentName, currentConfig, settings.shortcuts, registration());
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      subscriptions.forEach(stop => stop());
      stopActions();
      DialStore.unregisterPanel(id);
    },
  };
}
export const createDialKitController = createDialKit;
