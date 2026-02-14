import { useEffect, useId, useSyncExternalStore, useRef } from 'react';
import { DialStore, DialConfig, DialValue, ResolvedValues, SpringConfig, SelectConfig, ColorConfig, TextConfig, ActionConfig } from '../store/DialStore';

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

    if (Array.isArray(configValue) && configValue.length <= 4 && typeof configValue[0] === 'number') {
      // Range tuple
      result[key] = flatValues[path] ?? configValue[0];
    } else if (typeof configValue === 'number' || typeof configValue === 'boolean' || typeof configValue === 'string') {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSpringConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isActionConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSelectConfig(configValue)) {
      // Select config resolves to string value
      const defaultValue = configValue.default ?? getFirstOptionValue(configValue.options);
      result[key] = flatValues[path] ?? defaultValue;
    } else if (isColorConfig(configValue)) {
      // Color config resolves to string value
      result[key] = flatValues[path] ?? configValue.default ?? '#000000';
    } else if (isTextConfig(configValue)) {
      // Text config resolves to string value
      result[key] = flatValues[path] ?? configValue.default ?? '';
    } else if (typeof configValue === 'object' && configValue !== null) {
      // Nested object
      result[key] = buildResolvedValues(configValue as DialConfig, flatValues, path);
    }
  }

  return result;
}

function hasType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && 'type' in value && (value as { type: string }).type === type;
}

function isSpringConfig(value: unknown): value is SpringConfig {
  return hasType(value, 'spring');
}

function isActionConfig(value: unknown): value is ActionConfig {
  return hasType(value, 'action');
}

function isSelectConfig(value: unknown): value is SelectConfig {
  return hasType(value, 'select') && 'options' in (value as object) && Array.isArray((value as SelectConfig).options);
}

function isColorConfig(value: unknown): value is ColorConfig {
  return hasType(value, 'color');
}

function isTextConfig(value: unknown): value is TextConfig {
  return hasType(value, 'text');
}

function getFirstOptionValue(options: (string | { value: string; label: string })[]): string {
  const first = options[0];
  return typeof first === 'string' ? first : first.value;
}
