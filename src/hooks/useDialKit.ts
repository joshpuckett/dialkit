import { useCallback, useEffect, useId, useMemo, useRef, useSyncExternalStore } from 'react';
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
  values: ResolvedValues<T>;
  setValue: (path: string, value: DialValue) => void;
  setValues: (values: DialKitValueUpdates<T>) => void;
  resetValues: () => void;
  getValues: () => ResolvedValues<T>;
}

export function useDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: UseDialOptions
): ResolvedValues<T> {
  return useDialKitController(name, config, options).values;
}

export function useDialKitController<T extends DialConfig>(
  name: string,
  config: T,
  options?: UseDialOptions
): DialKitController<T> {
  const instanceId = useId();
  const hasStableId = options?.id !== undefined;
  const panelId = options?.id ?? `${name}-${instanceId}`;
  const configRef = useRef(config);
  const serializedConfig = JSON.stringify(config);
  configRef.current = config;
  const onActionRef = useRef(options?.onAction);
  onActionRef.current = options?.onAction;
  const shortcutsRef = useRef(options?.shortcuts);
  shortcutsRef.current = options?.shortcuts;
  const persistRef = useRef(options?.persist);
  persistRef.current = options?.persist;
  const serializedShortcuts = JSON.stringify(options?.shortcuts);
  const serializedPersist = JSON.stringify(options?.persist);

  // Register panel on mount
  useEffect(() => {
    DialStore.registerPanel(panelId, name, configRef.current, shortcutsRef.current, {
      retainOnUnmount: hasStableId,
      persist: persistRef.current,
    });
    return () => DialStore.unregisterPanel(panelId);
  }, [hasStableId, panelId, name]);

  // Update panel when config structure or shortcuts change
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    DialStore.updatePanel(panelId, name, configRef.current, shortcutsRef.current, {
      retainOnUnmount: hasStableId,
      persist: persistRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStableId, panelId, name, serializedConfig, serializedShortcuts, serializedPersist]);

  // Subscribe to action events
  useEffect(() => {
    return DialStore.subscribeActions(panelId, (action) => {
      onActionRef.current?.(action);
    });
  }, [panelId]);

  const subscribe = useCallback(
    (callback: () => void) => DialStore.subscribe(panelId, callback),
    [panelId]
  );
  const getSnapshot = useCallback(
    () => DialStore.getValues(panelId),
    [panelId]
  );

  // DialStore.getValues returns a stable empty object when panel is not registered.
  const flatValues = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const values = useMemo(
    () => resolveDialValues(configRef.current, flatValues),
    [flatValues, serializedConfig]
  );

  const setValue = useCallback(
    (path: string, value: DialValue) => {
      DialStore.updateValue(panelId, path, value);
    },
    [panelId]
  );

  const setValues = useCallback(
    (nextValues: DialKitValueUpdates<T>) => {
      DialStore.updateValues(panelId, flattenDialValueUpdates(configRef.current, nextValues));
    },
    [panelId]
  );

  const resetValues = useCallback(() => {
    DialStore.resetValues(panelId);
  }, [panelId]);

  const getValues = useCallback(
    () => resolveDialValues(configRef.current, DialStore.getValues(panelId)),
    [panelId]
  );

  return useMemo(
    () => ({
      values,
      setValue,
      setValues,
      resetValues,
      getValues,
    }),
    [getValues, resetValues, setValue, setValues, values]
  );
}
