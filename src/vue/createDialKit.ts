import { computed, onMounted, onUnmounted, ref, shallowRef, type ComputedRef } from 'vue';
import { DialStore } from '../store/DialStore';
import type {
  ActionConfig,
  ColorConfig,
  DialConfig,
  DialValue,
  EasingConfig,
  ResolvedValues,
  SelectConfig,
  SpringConfig,
  TextConfig,
} from '../store/DialStore';

export interface CreateDialOptions {
  onAction?: (action: string) => void;
}

let dialKitInstance = 0;

export function createDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: CreateDialOptions
): ComputedRef<ResolvedValues<T>> {
  const panelId = `${name}-${++dialKitInstance}`;
  const configRef = shallowRef(config);
  const values = ref<Record<string, DialValue>>(DialStore.getValues(panelId));

  let unsubscribeValues: (() => void) | undefined;
  let unsubscribeActions: (() => void) | undefined;

  const register = () => {
    DialStore.registerPanel(panelId, name, configRef.value);
    values.value = DialStore.getValues(panelId);

    unsubscribeValues = DialStore.subscribe(panelId, () => {
      values.value = DialStore.getValues(panelId);
    });

    unsubscribeActions = options?.onAction
      ? DialStore.subscribeActions(panelId, options.onAction)
      : undefined;
  };

  onMounted(register);

  onUnmounted(() => {
    unsubscribeValues?.();
    unsubscribeActions?.();
    DialStore.unregisterPanel(panelId);
  });

  return computed(() => buildResolvedValues(configRef.value, values.value, '') as ResolvedValues<T>);
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
