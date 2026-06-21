import { DialStore, flattenDialValueUpdates, resolveDialValues } from 'dialkit/store';
import type {
  ActionConfig,
  ColorConfig,
  DialConfig,
  DialKitPersistOptions,
  DialKitValueUpdates,
  DialValue,
  EasingConfig,
  ResolvedValues,
  SelectConfig,
  ShortcutConfig,
  SpringConfig,
  TextConfig,
} from 'dialkit/store';

export interface CreateDialOptions {
  id?: string;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}

export type DialKitValues<T> = T;

export interface DialKitController<T extends DialConfig> {
  values: DialKitValues<ResolvedValues<T>>;
  setValue: (path: string, value: DialValue) => void;
  setValues: (values: DialKitValueUpdates<T>) => void;
  resetValues: () => void;
  getValues: () => ResolvedValues<T>;
}

let dialKitInstance = 0;

export function createDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): DialKitValues<ResolvedValues<T>> {
  return createDialKitController(name, config, options).values;
}

export function createDialKitController<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): DialKitController<T> {
  const hasStableId = options?.id !== undefined;
  const panelId = options?.id ?? `${name}-${++dialKitInstance}`;
  const resolve = () => resolveDialValues(config, DialStore.getValues(panelId));

  let values = $state<ResolvedValues<T>>(resolve());

  $effect(() => {
    DialStore.registerPanel(panelId, name, config, options?.shortcuts, {
      retainOnUnmount: hasStableId,
      persist: options?.persist,
    });
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

  return {
    values: buildReactiveValues(config, () => values, '') as DialKitValues<ResolvedValues<T>>,
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
      return resolve();
    },
  };
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
