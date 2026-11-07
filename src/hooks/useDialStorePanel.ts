import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { DialStore } from '../store/DialStore';
import type { DialConfig, DialKitPersistOptions, DialValue, ShortcutConfig } from '../store/DialStore';

export interface UseDialStorePanelOptions {
  id?: string;
  defaultCollapsed?: boolean;
  persist?: DialKitPersistOptions;
  shortcuts?: Record<string, ShortcutConfig>;
  kind?: 'timeline';
}

// Serialize with a referential short-circuit: consumers can re-render at 60Hz
// during timeline playback, and re-stringifying an unchanged config every
// frame is wasted work whenever the object is memoized or module-stable.
export function useSerialized(value: unknown): string {
  const ref = useRef<{ value: unknown; text: string }>();
  if (!ref.current || !Object.is(ref.current.value, value)) {
    ref.current = { value, text: JSON.stringify(value) };
  }
  return ref.current.text;
}

// The DialStore panel lifecycle shared by useDialKit and useDialTimeline:
// stable panel id, register on mount / unregister on unmount, push structure
// changes on config edits, and subscribe to the flat value snapshot.
// Fixes to StrictMode/HMR behavior belong here so every panel-backed hook
// gets them.
export function useDialStorePanel(
  name: string,
  config: DialConfig,
  options: UseDialStorePanelOptions = {}
): { panelId: string; flatValues: Record<string, DialValue>; serializedConfig: string } {
  const instanceId = useId();
  const hasStableId = options.id !== undefined;
  // Not derived from the name: renaming a panel must not discard its tuned values.
  const panelId = options.id ?? `dialkit-${instanceId}`;
  // 2.1's generated id, so data it saved for a panel without an id still loads.
  const legacyId = `${name}-${instanceId}`;

  const configRef = useRef(config);
  configRef.current = config;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const serializedConfig = useSerialized(config);
  const serializedShortcuts = useSerialized(options.shortcuts);
  const serializedPersist = useSerialized(options.persist);

  // Register on mount
  useEffect(() => {
    DialStore.registerPanel(panelId, name, configRef.current, optionsRef.current.shortcuts, {
      retainOnUnmount: hasStableId,
      legacyId,
      persist: optionsRef.current.persist,
      defaultCollapsed: optionsRef.current.defaultCollapsed,
      kind: optionsRef.current.kind,
    });
    return () => DialStore.unregisterPanel(panelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStableId, panelId]);

  // Push structure changes without re-registering
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    DialStore.updatePanel(panelId, name, configRef.current, optionsRef.current.shortcuts, {
      retainOnUnmount: hasStableId,
      legacyId,
      persist: optionsRef.current.persist,
      defaultCollapsed: optionsRef.current.defaultCollapsed,
      kind: optionsRef.current.kind,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStableId, panelId, name, serializedConfig, serializedShortcuts, serializedPersist]);

  const subscribe = useCallback(
    (callback: () => void) => DialStore.subscribe(panelId, callback),
    [panelId]
  );
  const getSnapshot = useCallback(() => DialStore.getValues(panelId), [panelId]);

  // DialStore.getValues returns a stable empty object when panel is not registered.
  const flatValues = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { panelId, flatValues, serializedConfig };
}
