import { createSignal, createMemo, onMount, onCleanup, createUniqueId, type Accessor } from 'solid-js';
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

  const [flatValues, setFlatValues] = createSignal<Record<string, DialValue>>(
    DialStore.getValues(panelId)
  );

  onMount(() => {
    DialStore.registerPanel(panelId, name, config, options?.shortcuts, {
      retainOnUnmount: hasStableId,
      persist: options?.persist,
    });
    setFlatValues(DialStore.getValues(panelId));

    const unsubValues = DialStore.subscribe(panelId, () => {
      setFlatValues(DialStore.getValues(panelId));
    });

    const unsubActions = options?.onAction
      ? DialStore.subscribeActions(panelId, options.onAction)
      : undefined;

    onCleanup(() => {
      unsubValues();
      unsubActions?.();
      DialStore.unregisterPanel(panelId);
    });
  });

  const values = createMemo(() => resolveDialValues(config, flatValues()));

  return {
    values,
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
