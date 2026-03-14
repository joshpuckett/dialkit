import { DialStore } from 'dialkit/store';
import type {
  ActionConfig,
  ColorConfig,
  DialConfig,
  DialValue,
  EasingConfig,
  ResolvedValues,
  SelectConfig,
  ShortcutConfig,
  SpringConfig,
  TextConfig,
} from 'dialkit/store';

export interface CreateDialOptions {
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}

export type DialKitValues<T> = T;

let dialKitInstance = 0;

export function createDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): DialKitValues<ResolvedValues<T>> {
  const panelId = `${name}-${++dialKitInstance}`;
  const resolve = () => buildResolvedValues(config, DialStore.getValues(panelId), '') as ResolvedValues<T>;

  let values = $state<ResolvedValues<T>>(resolve());

  $effect(() => {
    DialStore.registerPanel(panelId, name, config, options?.shortcuts);
    values = resolve();

    const unsubValues = DialStore.subscribe(panelId, () => {
      values = resolve();
    });

    const unsubActions = options?.onAction
      ? DialStore.subscribeActions(panelId, options.onAction)
      : undefined;

    return () => {
      unsubValues();
      unsubActions?.();
      DialStore.unregisterPanel(panelId);
    };
  });

  return buildReactiveValues(config, () => values, '') as DialKitValues<ResolvedValues<T>>;
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
    } else if (isSpringConfig(configValue) || isEasingConfig(configValue)) {
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

function buildReactiveValues<T extends DialConfig>(
  config: T,
  getValues: () => ResolvedValues<T>,
  prefix: string
): DialKitValues<ResolvedValues<T>> {
  const result: Record<string, unknown> = {};

  for (const [key, configValue] of Object.entries(config)) {
    if (key === '_collapsed') continue;
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof configValue === 'object' && configValue !== null && !isLeafConfigValue(configValue)) {
      const nested = buildReactiveValues(configValue as DialConfig, getValues, path);

      Object.defineProperty(result, key, {
        enumerable: true,
        get() {
          return nested;
        },
      });
      continue;
    }

    Object.defineProperty(result, key, {
      enumerable: true,
      get() {
        return getPathValue(getValues(), path);
      },
    });
  }

  return result as DialKitValues<ResolvedValues<T>>;
}

function getPathValue(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, source);
}

function isLeafConfigValue(value: unknown): boolean {
  return (
    (Array.isArray(value) && value.length <= 4 && typeof value[0] === 'number') ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isSpringConfig(value) ||
    isEasingConfig(value) ||
    isActionConfig(value) ||
    isSelectConfig(value) ||
    isColorConfig(value) ||
    isTextConfig(value)
  );
}

function hasType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && 'type' in value && (value as { type: string }).type === type;
}

function isSpringConfig(value: unknown): value is SpringConfig {
  return hasType(value, 'spring');
}

function isEasingConfig(value: unknown): value is EasingConfig {
  return hasType(value, 'easing');
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
