import { onMount, onCleanup, createUniqueId, type Accessor } from 'solid-js';
import { isServer } from 'solid-js/web';
import { createStore, reconcile } from 'solid-js/store';
import { DialStore, flattenDialValueUpdates, resolveDialValues } from '../store/DialStore';
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
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
  collapsed?: boolean;
}

export interface DialKitController<T extends DialConfig> {
  values: Accessor<ResolvedValues<T>>;
  setValue: (path: string, value: DialValue) => void;
  setValues: (values: DialKitValueUpdates<T>) => void;
  resetValues: () => void;
  getValues: () => ResolvedValues<T>;
}

export function createDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): Accessor<ResolvedValues<T>> {
  return createDialKitController(name, config, options).values;
}

export function createDialKitController<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): DialKitController<T> {
  const id = createUniqueId();
  const hasStableId = options?.id !== undefined;
  const panelId = options?.id ?? `${name}-${id}`;

  // Resolved values live in a store so consumers reading `values().someKey`
  // subscribe to that key alone; reconcile diffs each snapshot from the
  // external DialStore instead of replacing the whole object.
  const [values, setValues] = createStore(
    resolveDialValues(config, DialStore.getValues(panelId))
  );

  if (!isServer) {
    // Subscribe at setup so the notify fired by registerPanel (in onMount)
    // syncs persisted/preset values into the store without a manual copy.
    const unsubValues = DialStore.subscribe(panelId, () => {
      setValues(reconcile(resolveDialValues(config, DialStore.getValues(panelId))));
    });
    onCleanup(unsubValues);
  }

  onMount(() => {
    DialStore.registerPanel(panelId, name, config, options?.shortcuts, {
      retainOnUnmount: hasStableId,
      persist: options?.persist,
      collapsed: options?.collapsed,
    });

    const unsubActions = options?.onAction
      ? DialStore.subscribeActions(panelId, options.onAction)
      : undefined;

    onCleanup(() => {
      unsubActions?.();
      DialStore.unregisterPanel(panelId);
    });
  });

  return {
    values: () => values,
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
