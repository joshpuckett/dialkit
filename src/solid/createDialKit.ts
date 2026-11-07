import { createEffect, onCleanup, createUniqueId, untrack, type Accessor } from 'solid-js';
import { isServer } from 'solid-js/web';
import { createStore, reconcile } from 'solid-js/store';
import { cloneDialValue, DialStore, flattenDialValueUpdates, resolveDialValues } from '../store/DialStore';
import type {
  DialConfig,
  DialKitPersistOptions,
  DialKitValueUpdates,
  DialValue,
  ResolvedValues,
  ShortcutConfig,
} from '../store/DialStore';

export interface CreateDialOptions {
  id?: string;
  defaultCollapsed?: boolean;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}

export interface DialKitController<T extends DialConfig> {
  values: Accessor<ResolvedValues<T>>;
  setValue: (path: string, value: DialValue) => void;
  setValues: (values: DialKitValueUpdates<T>) => void;
  resetValues: () => void;
  setOpen: (open: boolean) => void;
  getOpen: () => boolean | undefined;
  getValues: () => ResolvedValues<T>;
}

export function createDialKit<T extends DialConfig>(
  name: string | Accessor<string>,
  config: T,
  options?: CreateDialOptions
): Accessor<ResolvedValues<T>> {
  return createDialKitController(name, config, options).values;
}

export function createDialKitController<T extends DialConfig>(
  name: string | Accessor<string>,
  config: T,
  options?: CreateDialOptions
): DialKitController<T> {
  const id = createUniqueId();
  const hasStableId = options?.id !== undefined;
  // Not derived from the name: renaming a panel must not discard its tuned values.
  const panelId = options?.id ?? `dialkit-${id}`;

  // reconcile mutates what the Solid store holds, so the store only ever gets
  // copies, never objects shared with the config or DialStore.
  const readValues = () => cloneDialValue(resolveDialValues(config, DialStore.getValues(panelId)));

  // Resolved values live in a store so consumers reading `values().someKey`
  // subscribe to that key alone; reconcile diffs each snapshot from the
  // external DialStore instead of replacing the whole object.
  const [values, setValues] = createStore(readValues());

  if (!isServer) {
    // Subscribe at setup so the notify fired by registerPanel syncs
    // persisted/preset values into the store without a manual copy.
    onCleanup(DialStore.subscribe(panelId, () => {
      setValues(reconcile(untrack(readValues)));
    }));
    onCleanup(DialStore.subscribeActions(panelId, (action) => {
      options?.onAction?.(action);
    }));
  }

  // Registration and updates share one effect, so the first run registers
  // whatever the config is by then and nothing can reach updatePanel before it.
  let registered = false;
  let signature: string | undefined;
  createEffect(() => {
    const currentName = typeof name === 'function' ? name() : name;
    const next = JSON.stringify([currentName, config, options?.shortcuts, options?.persist]);
    if (next === signature) return;
    signature = next;
    untrack(() => {
      const panelOptions = {
        retainOnUnmount: hasStableId,
        // 2.1's generated id, so data it saved for a panel without an id still loads.
        legacyId: `${currentName}-${id}`,
        persist: options?.persist,
        defaultCollapsed: options?.defaultCollapsed,
      };
      if (registered) {
        DialStore.updatePanel(panelId, currentName, config, options?.shortcuts, panelOptions);
      } else {
        registered = true;
        DialStore.registerPanel(panelId, currentName, config, options?.shortcuts, panelOptions);
      }
    });
  });
  onCleanup(() => {
    if (registered) DialStore.unregisterPanel(panelId);
  });

  return {
    values: () => values,
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
      return resolveDialValues(config, DialStore.getValues(panelId));
    },
  };
}
