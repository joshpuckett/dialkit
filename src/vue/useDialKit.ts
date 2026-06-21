import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type ComputedRef } from 'vue';
import { DialStore, flattenDialValueUpdates, resolveDialValues } from '../store/DialStore';
import type {
  DialConfig,
  DialKitPersistOptions,
  DialKitValueUpdates,
  DialValue,
  ResolvedValues,
  ShortcutConfig,
} from '../store/DialStore';

export interface UseDialOptions {
  id?: string;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}

export interface DialKitController<T extends DialConfig> {
  values: ComputedRef<ResolvedValues<T>>;
  setValue: (path: string, value: DialValue) => void;
  setValues: (values: DialKitValueUpdates<T>) => void;
  resetValues: () => void;
  getValues: () => ResolvedValues<T>;
}

let dialKitInstance = 0;

export function useDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: UseDialOptions
): ComputedRef<ResolvedValues<T>> {
  return useDialKitController(name, config, options).values;
}

export function useDialKitController<T extends DialConfig>(
  name: string,
  config: T,
  options?: UseDialOptions
): DialKitController<T> {
  const hasStableId = options?.id !== undefined;
  const panelId = options?.id ?? `${name}-${++dialKitInstance}`;
  const configRef = shallowRef(config);
  const onActionRef = ref(options?.onAction);
  const shortcutsRef = shallowRef(options?.shortcuts);
  const persistRef = shallowRef(options?.persist);
  const flatValues = ref<Record<string, DialValue>>(DialStore.getValues(panelId));
  const mounted = ref(false);
  const serializedConfig = computed(() => JSON.stringify(config));
  const serializedShortcuts = computed(() => JSON.stringify(options?.shortcuts));
  const serializedPersist = computed(() => JSON.stringify(options?.persist));

  let unsubscribeValues: (() => void) | undefined;
  let unsubscribeActions: (() => void) | undefined;

  const register = () => {
    DialStore.registerPanel(panelId, name, configRef.value, shortcutsRef.value, {
      retainOnUnmount: hasStableId,
      persist: persistRef.value,
    });
    flatValues.value = DialStore.getValues(panelId);

    unsubscribeValues = DialStore.subscribe(panelId, () => {
      flatValues.value = DialStore.getValues(panelId);
    });

    unsubscribeActions = DialStore.subscribeActions(panelId, (action) => {
      onActionRef.value?.(action);
    });
  };

  watch(() => options?.onAction, (next) => {
    onActionRef.value = next;
  });

  watch(() => options?.shortcuts, (next) => {
    shortcutsRef.value = next;
  });

  watch(() => options?.persist, (next) => {
    persistRef.value = next;
  });

  watch([serializedConfig, serializedShortcuts, serializedPersist], () => {
    configRef.value = config;
    shortcutsRef.value = options?.shortcuts;
    persistRef.value = options?.persist;
    if (mounted.value) {
      DialStore.updatePanel(panelId, name, configRef.value, shortcutsRef.value, {
        retainOnUnmount: hasStableId,
        persist: persistRef.value,
      });
      flatValues.value = DialStore.getValues(panelId);
    }
  });

  onMounted(register);
  onMounted(() => {
    mounted.value = true;
  });

  onUnmounted(() => {
    unsubscribeValues?.();
    unsubscribeActions?.();
    DialStore.unregisterPanel(panelId);
  });

  const values = computed(() => resolveDialValues(configRef.value, flatValues.value));

  return {
    values,
    setValue(path, value) {
      DialStore.updateValue(panelId, path, value);
    },
    setValues(nextValues) {
      DialStore.updateValues(panelId, flattenDialValueUpdates(configRef.value, nextValues));
    },
    resetValues() {
      DialStore.resetValues(panelId);
    },
    getValues() {
      return resolveDialValues(configRef.value, DialStore.getValues(panelId));
    },
  };
}
