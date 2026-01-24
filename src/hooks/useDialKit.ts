import { useEffect, useId, useSyncExternalStore, useRef } from 'react';
import { DialStore, DialConfig, DialValue, ResolvedValues, SpringConfig } from '../store/DialStore';

export interface UseDialOptions {
  onAction?: (action: string) => void;
}

export function useDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: UseDialOptions
): ResolvedValues<T> {
  const instanceId = useId();
  const panelId = `${name}-${instanceId}`;
  const configRef = useRef(config);
  const onActionRef = useRef(options?.onAction);
  onActionRef.current = options?.onAction;

  // Register panel on mount
  useEffect(() => {
    DialStore.registerPanel(panelId, name, configRef.current);
    return () => DialStore.unregisterPanel(panelId);
  }, [panelId, name]);

  // Subscribe to action events
  useEffect(() => {
    return DialStore.subscribeActions(panelId, (action) => {
      onActionRef.current?.(action);
    });
  }, [panelId]);

  // Subscribe to changes
  // DialStore.getValues returns a stable empty object when panel not registered
  const values = useSyncExternalStore(
    (callback) => DialStore.subscribe(panelId, callback),
    () => DialStore.getValues(panelId),
    () => DialStore.getValues(panelId)
  );

  // Build resolved values object
  return buildResolvedValues(config, values, '') as ResolvedValues<T>;
}

function buildResolvedValues(
  config: DialConfig,
  flatValues: Record<string, DialValue>,
  prefix: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, configValue] of Object.entries(config)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(configValue) && configValue.length === 3 && typeof configValue[0] === 'number') {
      // Range tuple
      result[key] = flatValues[path] ?? configValue[0];
    } else if (typeof configValue === 'number' || typeof configValue === 'boolean' || typeof configValue === 'string') {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSpringConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (typeof configValue === 'object' && configValue !== null) {
      // Nested object
      result[key] = buildResolvedValues(configValue as DialConfig, flatValues, path);
    }
  }

  return result;
}

function isSpringConfig(value: unknown): value is SpringConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as SpringConfig).type === 'spring'
  );
}
