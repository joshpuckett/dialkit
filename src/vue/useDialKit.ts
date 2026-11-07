import { computed, onMounted, onUnmounted, shallowRef, watch, type ComputedRef } from 'vue';
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
  defaultCollapsed?: boolean;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}

export interface DialKitController<T extends DialConfig> {
  values: ComputedRef<ResolvedValues<T>>;
  setValue: (path: string, value: DialValue) => void;
  setValues: (values: DialKitValueUpdates<T>) => void;
  resetValues: () => void;
  setOpen: (open: boolean) => void;
  getOpen: () => boolean | undefined;
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
  // Not derived from the name: renaming a panel must not discard its tuned values.
  const panelId = options?.id ?? `dialkit-panel-${++dialKitInstance}`;
  // 2.1's generated id, so data it saved for a panel without an id still loads.
  const legacyId = `${name}-${dialKitInstance}`;
  const flatValues = shallowRef<Record<string, DialValue>>(DialStore.getValues(panelId));
  let mounted = false;
  const serializedConfig = computed(() => JSON.stringify(config));
  const serializedShortcuts = computed(() => JSON.stringify(options?.shortcuts));
  const serializedPersist = computed(() => JSON.stringify(options?.persist));

  let unsubscribeValues: (() => void) | undefined;
  let unsubscribeActions: (() => void) | undefined;

  const register = () => {
    DialStore.registerPanel(panelId, name, config, options?.shortcuts, {
      retainOnUnmount: hasStableId,
      legacyId,
      persist: options?.persist,
      defaultCollapsed: options?.defaultCollapsed,
    });
    flatValues.value = DialStore.getValues(panelId);

    unsubscribeValues = DialStore.subscribe(panelId, () => {
      flatValues.value = DialStore.getValues(panelId);
    });

    unsubscribeActions = DialStore.subscribeActions(panelId, (action) => {
      options?.onAction?.(action);
    });
  };

  watch([serializedConfig, serializedShortcuts, serializedPersist], () => {
    if (mounted) {
      DialStore.updatePanel(panelId, name, config, options?.shortcuts, {
        retainOnUnmount: hasStableId,
        legacyId,
        persist: options?.persist,
        defaultCollapsed: options?.defaultCollapsed,
      });
      flatValues.value = DialStore.getValues(panelId);
    }
  });

  onMounted(() => { register(); mounted = true; });

  onUnmounted(() => {
    if (!mounted) return;
    mounted = false;
    unsubscribeValues?.();
    unsubscribeActions?.();
    DialStore.unregisterPanel(panelId);
  });

  const values = computed(() => resolveDialValues(config, flatValues.value));

  return {
    values,
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
