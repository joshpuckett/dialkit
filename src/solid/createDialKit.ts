import { createSignal, createMemo, onMount, onCleanup, createUniqueId, type Accessor } from 'solid-js';
import { DialStore } from '../store/DialStore';
import type { DialConfig, ResolvedValues, DialValue, SpringConfig, SelectConfig, ColorConfig, TextConfig, ActionConfig } from '../store/DialStore';

export interface CreateDialOptions {
  onAction?: (action: string) => void;
}

export function createDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): Accessor<ResolvedValues<T>> {
  const id = createUniqueId();
  const panelId = `${name}-${id}`;

  const [values, setValues] = createSignal<Record<string, DialValue>>(
    DialStore.getValues(panelId)
  );

  onMount(() => {
    if (!DialStore.isEnabled()) return;
    DialStore.registerPanel(panelId, name, config);
    setValues(DialStore.getValues(panelId));

    const unsubValues = DialStore.subscribe(panelId, () => {
      setValues(DialStore.getValues(panelId));
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

  return createMemo(() => buildResolvedValues(config, values(), '') as ResolvedValues<T>);
}

function buildResolvedValues(
  config: DialConfig,
  flatValues: Record<string, DialValue>,
  prefix: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, configValue] of Object.entries(config)) {
    if (key === '_collapsed') continue;
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(configValue) && configValue.length <= 4 && typeof configValue[0] === 'number') {
      result[key] = flatValues[path] ?? configValue[0];
    } else if (typeof configValue === 'number' || typeof configValue === 'boolean' || typeof configValue === 'string') {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSpringConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isActionConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSelectConfig(configValue)) {
      const defaultValue = configValue.default ?? getFirstOptionValue(configValue.options);
      result[key] = flatValues[path] ?? defaultValue;
    } else if (isColorConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue.default ?? '#000000';
    } else if (isTextConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue.default ?? '';
    } else if (typeof configValue === 'object' && configValue !== null) {
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
