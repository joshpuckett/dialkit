import { roundValue } from '../numeric';
import { parseColor } from '../color';
import { normalizePadValue, type DialPadConfig, type DialPadValue } from '../dial-pad';
import { callListeners, pageSingleton, warnOnce } from './shared';
export type { DialPadAxis, DialPadConfig, DialPadValue } from '../dial-pad';

// Lightweight state store with subscriptions for dialkit

export type SpringConfig = {
  type: 'spring';
  stiffness?: number;
  damping?: number;
  mass?: number;
  visualDuration?: number;
  bounce?: number;
};

export type EasingConfig = {
  type: 'easing';
  duration: number;
  ease: [number, number, number, number];
};

export type TransitionConfig = SpringConfig | EasingConfig;

export type ActionConfig = {
  type: 'action';
  label?: string;
};

export type SelectConfig = {
  type: 'select';
  options: (string | { value: string; label: string })[];
  default?: string;
};

export type ColorConfig = {
  type: 'color';
  default?: string;
};

export type ImageOption = string | { value: string; label: string };

export type ImageConfig = {
  type: 'image';
  /** Image URLs, optionally paired with display labels. */
  options?: ImageOption[];
  /** Defaults to the first option, or an empty string for upload-only controls. */
  default?: string;
};

export type TextConfig = {
  type: 'text';
  default?: string;
  placeholder?: string;
};

export type DialValue = number | boolean | string | SpringConfig | EasingConfig | ActionConfig | SelectConfig | ColorConfig | ImageConfig | TextConfig | DialPadConfig | DialPadValue;

export type DialConfig = {
  [key: string]: DialValue | [number, number, number, number?] | DialConfig;
};

export type ResolvedValues<T extends DialConfig> = {
  [K in keyof T]: T[K] extends [number, number, number, number?]
    ? number
    : T[K] extends SpringConfig
      ? TransitionConfig
      : T[K] extends EasingConfig
        ? TransitionConfig
        : T[K] extends SelectConfig
          ? string
          : T[K] extends ColorConfig | ImageConfig
            ? string
            : T[K] extends TextConfig
              ? string
              : T[K] extends DialPadConfig
                ? DialPadValue
                : T[K] extends DialConfig
                  ? ResolvedValues<T[K]>
                  : T[K];
};

export type DialKitValueUpdates<T extends DialConfig> = {
  [K in keyof T as K extends '_collapsed' ? never : K]?: T[K] extends [number, number, number, number?]
    ? number
    : T[K] extends SpringConfig | EasingConfig
      ? TransitionConfig
      : T[K] extends ActionConfig
        ? never
        : T[K] extends SelectConfig | ColorConfig | ImageConfig | TextConfig
          ? string
          : T[K] extends DialPadConfig
            ? DialPadValue
            : T[K] extends DialConfig
              ? DialKitValueUpdates<T[K]>
              : T[K];
};

export type ShortcutMode = 'fine' | 'normal' | 'coarse';
export type ShortcutInteraction = 'scroll' | 'drag' | 'move' | 'scroll-only';

export type ShortcutConfig = {
  key?: string;
  modifier?: 'alt' | 'shift' | 'meta';
  mode?: ShortcutMode;
  interaction?: ShortcutInteraction;
};

export type ControlMeta = {
  type: 'slider' | 'toggle' | 'transition' | 'folder' | 'action' | 'select' | 'color' | 'image' | 'text' | 'pad';
  path: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  children?: ControlMeta[];
  defaultOpen?: boolean;
  options?: (string | { value: string; label: string })[];
  placeholder?: string;
  pad?: DialPadConfig;
  shortcut?: ShortcutConfig;
};

export type PanelConfig = {
  id: string;
  name: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
  shortcuts: Record<string, ShortcutConfig>;
  kind?: 'timeline';
};

type Listener = () => void;
type ActionListener = (action: string) => void;

export type Preset = {
  id: string;
  name: string;
  values: Record<string, DialValue>;
};

export type DialKitPersistOptions = boolean | {
  key?: string;
  storage?: 'localStorage' | 'sessionStorage';
  presets?: boolean;
};

export type DialStorePanelOptions = {
  defaultCollapsed?: boolean;
  retainOnUnmount?: boolean;
  persist?: DialKitPersistOptions;
  kind?: 'timeline';
  /** The id DialKit 2.1 generated for a panel without one. What 2.1 saved under it moves to the panel's key. */
  legacyId?: string;
};

type PersistConfig = {
  key: string;
  storage: 'localStorage' | 'sessionStorage';
  presets: boolean;
  legacyKey?: string;
};

type PersistedPanelState = {
  version: 1;
  values?: Record<string, DialValue>;
  baseValues?: Record<string, DialValue>;
  presets?: Preset[];
  activePresetId?: string | null;
  baseName?: string;
};

// Stable empty object for unregistered panels (React 19 useSyncExternalStore requirement)
const EMPTY_VALUES: Record<string, DialValue> = Object.freeze({});

export function resolveDialValues<T extends DialConfig>(
  config: T,
  flatValues: Record<string, DialValue>
): ResolvedValues<T> {
  return resolveConfigValues(config, flatValues, '') as ResolvedValues<T>;
}

export function flattenDialValueUpdates<T extends DialConfig>(
  config: T,
  updates: DialKitValueUpdates<T>
): Record<string, DialValue> {
  const values: Record<string, DialValue> = {};
  if (typeof updates === 'object' && updates !== null) {
    flattenConfigUpdates(config, updates as Record<string, unknown>, '', values);
  }
  return values;
}

function resolveConfigValues(
  config: DialConfig,
  flatValues: Record<string, DialValue>,
  prefix: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, configValue] of Object.entries(config)) {
    if (key === '_collapsed') continue;
    const path = prefix ? `${prefix}.${key}` : key;

    if (isLeafConfigValue(configValue)) {
      result[key] = flatValues[path] ?? configDefaultValue(configValue);
    } else if (typeof configValue === 'object' && configValue !== null && !Array.isArray(configValue)) {
      result[key] = resolveConfigValues(configValue as DialConfig, flatValues, path);
    }
  }

  return result;
}

function flattenConfigUpdates(
  config: DialConfig,
  updates: Record<string, unknown>,
  prefix: string,
  values: Record<string, DialValue>
): void {
  for (const [key, configValue] of Object.entries(config)) {
    if (key === '_collapsed' || !(key in updates)) continue;

    const nextValue = updates[key];
    if (nextValue === undefined) continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if (isActionConfigValue(configValue)) {
      continue;
    }

    if (isLeafConfigValue(configValue)) {
      values[path] = nextValue as DialValue;
      continue;
    }

    if (
      typeof configValue === 'object' &&
      configValue !== null &&
      !Array.isArray(configValue) &&
      typeof nextValue === 'object' &&
      nextValue !== null &&
      !Array.isArray(nextValue)
    ) {
      flattenConfigUpdates(configValue as DialConfig, nextValue as Record<string, unknown>, path, values);
    }
  }
}

export function isLeafConfigValue(value: unknown): boolean {
  return (
    isSliderTuple(value) ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isSpringConfigValue(value) ||
    isEasingConfigValue(value) ||
    isActionConfigValue(value) ||
    isSelectConfigValue(value) ||
    isColorConfigValue(value) ||
    isImageConfigValue(value) ||
    isTextConfigValue(value) ||
    isPadConfigValue(value)
  );
}

/** Defaults shared by the store and the values returned before a panel mounts. */
function configDefaultValue(value: DialConfig[string]): DialValue {
  if (typeof value === 'number' || Array.isArray(value)) return sliderRange(value).initial;
  if (isSelectConfigValue(value)) return value.default ?? getFirstOptionValue(value.options);
  if (isColorConfigValue(value)) return value.default ?? '#000000';
  if (isImageConfigValue(value)) return value.default ?? getFirstOptionValue(value.options ?? []);
  if (isTextConfigValue(value)) return value.default ?? '';
  if (isPadConfigValue(value)) return normalizePadValue(undefined, value);
  return value as DialValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stored values are plain data: numbers, strings, and small objects and arrays. */
export function cloneDialValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneDialValue) as T;
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneDialValue(nested)])
  ) as T;
}

function sameDialValue(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  if (typeof previous !== 'object' || typeof next !== 'object' || previous === null || next === null) return false;
  const previousKeys = Object.keys(previous);
  if (previousKeys.length !== Object.keys(next).length) return false;
  return previousKeys.every((key) => key in next &&
    sameDialValue((previous as Record<string, unknown>)[key], (next as Record<string, unknown>)[key]));
}

function hasType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && 'type' in value && (value as { type: string }).type === type;
}

export function isSpringConfigValue(value: unknown): value is SpringConfig {
  return hasType(value, 'spring');
}

export function isEasingConfigValue(value: unknown): value is EasingConfig {
  return hasType(value, 'easing');
}

/** Motion's fallbacks, so editors and scrubbing show what a partial spring really plays. */
export const SPRING_DEFAULTS = {
  stiffness: 100,
  damping: 10,
  mass: 1,
  visualDuration: 0.3,
  bounce: 0.3,
} as const;

export type TransitionMode = 'easing' | 'simple' | 'advanced';

export function isPhysicsSpring(transition: TransitionConfig): boolean {
  return (
    transition.type === 'spring' &&
    (transition.stiffness !== undefined || transition.damping !== undefined || transition.mass !== undefined)
  );
}

/** The editor mode describes the value, so it is always read from the value. */
export function transitionModeOf(transition: TransitionConfig): TransitionMode {
  if (transition.type === 'easing') return 'easing';
  return isPhysicsSpring(transition) ? 'advanced' : 'simple';
}

function isValidTransition(value: unknown): value is TransitionConfig {
  const finiteOrMissing = (part: unknown) => part === undefined || (typeof part === 'number' && Number.isFinite(part));
  if (isEasingConfigValue(value)) {
    return typeof value.duration === 'number' && Number.isFinite(value.duration) &&
      Array.isArray(value.ease) && value.ease.length === 4 && value.ease.every(Number.isFinite);
  }
  return isSpringConfigValue(value) &&
    [value.stiffness, value.damping, value.mass, value.visualDuration, value.bounce].every(finiteOrMissing);
}

export function isHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}

/** camelCase → Title Case, the label rule used everywhere a key becomes UI text. */
export function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/** Default slider step for a numeric range. */
export function inferStep(min: number, max: number): number {
  const range = max - min;
  if (range <= 1) return 0.01;
  if (range <= 10) return 0.1;
  if (range <= 100) return 1;
  return 10;
}

function isSliderTuple(value: unknown): value is [number, number, number, number?] {
  return Array.isArray(value) && value.length <= 4 && typeof value[0] === 'number';
}

function inferRange(value: number): { min: number; max: number; step: number } {
  if (value >= 0 && value <= 1) return { min: 0, max: 1, step: 0.01 };
  if (value >= 0 && value <= 10) return { min: 0, max: value * 3 || 10, step: 0.1 };
  if (value >= 0 && value <= 100) return { min: 0, max: value * 3 || 100, step: 1 };
  if (value >= 0) return { min: 0, max: value * 3 || 1000, step: 10 };
  return { min: value * 3, max: -value * 3, step: 1 };
}

type SliderRange = { initial: number; min: number; max: number; step: number };

/**
 * The one reading of a numeric config, used for defaults and control metadata
 * alike. Ranges may be computed by the host (a width that is 0 on first render),
 * so a bad one is repaired and reported instead of taking the host down.
 */
function sliderRange(
  value: number | readonly (number | undefined)[],
  report?: (problem: string) => void
): SliderRange {
  const isFinite = (part: unknown): part is number => typeof part === 'number' && Number.isFinite(part);
  const raw = typeof value === 'number' ? [value] : value;
  const seed = isFinite(raw[0]) ? raw[0] : 0;
  const inferred = inferRange(seed);
  if (typeof value === 'number') return { initial: seed, ...inferred };

  let min = isFinite(raw[1]) ? raw[1] : inferred.min;
  let max = isFinite(raw[2]) ? raw[2] : inferred.max;
  if (!isFinite(raw[1]) || !isFinite(raw[2])) report?.('needs a finite min and max, so its range was inferred');
  if (min > max) {
    [min, max] = [max, min];
    report?.('has min above max, so they were swapped');
  } else if (min === max) {
    max = min + 1;
    report?.(`has an empty range, so ${min}-${max} is used`);
  }
  const explicitStep = raw[3];
  const validStep = isFinite(explicitStep) && explicitStep > 0;
  if (explicitStep !== undefined && !validStep) report?.('needs a positive step, so one was inferred');
  const initial = Math.max(min, Math.min(max, seed));
  if (initial !== seed) report?.(`has default ${seed} outside ${min}-${max}, so ${initial} is used`);
  return { initial, min, max, step: validStep ? explicitStep : inferStep(min, max) };
}

/** Controls whose `type` field makes them a control rather than a folder. */
const CONTROL_FIELDS: Record<string, readonly string[]> = {
  action: ['label'],
  select: ['options', 'default'],
  color: ['default'],
  image: ['options', 'default'],
  text: ['default', 'placeholder'],
  pad: ['x', 'y', 'labels'],
};

/**
 * The valid form of a value for its control, or undefined when it doesn't fit.
 * Writes and reconciliation share this, so a value that was accepted can never
 * change later just because the panel re-registered.
 */
function coerceControlValue(value: unknown, control: ControlMeta): DialValue | undefined {
  switch (control.type) {
    case 'slider':
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
      return roundValue(value, control.step ?? 0, control.min, control.max);
    case 'toggle':
      return typeof value === 'boolean' ? value : undefined;
    case 'pad':
      return normalizePadValue(value, control.pad);
    case 'select': {
      if (typeof value !== 'string') return undefined;
      const options = control.options ?? [];
      return options.some((option) => (typeof option === 'string' ? option : option.value) === value) ? value : undefined;
    }
    case 'color':
    case 'image':
    case 'text':
      return typeof value === 'string' ? value : undefined;
    case 'transition':
      return isValidTransition(value) ? value : undefined;
    default:
      return undefined;
  }
}

function isActionConfigValue(value: unknown): value is ActionConfig {
  return hasType(value, 'action');
}

function isSelectConfigValue(value: unknown): value is SelectConfig {
  return hasType(value, 'select') && 'options' in (value as object) && Array.isArray((value as SelectConfig).options);
}

function isColorConfigValue(value: unknown): value is ColorConfig {
  return hasType(value, 'color');
}

function isImageConfigValue(value: unknown): value is ImageConfig {
  return hasType(value, 'image');
}

function isTextConfigValue(value: unknown): value is TextConfig {
  return hasType(value, 'text');
}

function isPadConfigValue(value: unknown): value is DialPadConfig {
  return hasType(value, 'pad');
}

function getFirstOptionValue(options: (string | { value: string; label: string })[]): string {
  const first = options[0];
  if (first === undefined) return '';
  return typeof first === 'string' ? first : first.value;
}

class DialStoreClass {
  private panelOpenListeners = new Set<(panelId: string, open: boolean) => void>();
  private panelOpenStates = new Map<string, boolean>();
  private panels: Map<string, PanelConfig> = new Map();
  private controlsByPanel = new WeakMap<PanelConfig, Map<string, ControlMeta>>();
  private panelsSnapshot: PanelConfig[] = [];
  private standardPanelsSnapshot: PanelConfig[] = [];
  private timelinePanelsSnapshot: PanelConfig[] = [];
  private listeners: Map<string, Set<Listener>> = new Map();
  private globalListeners: Set<Listener> = new Set();
  private snapshots: Map<string, Record<string, DialValue>> = new Map();
  private actionListeners: Map<string, Set<ActionListener>> = new Map();
  private presets: Map<string, Preset[]> = new Map();
  private activePreset: Map<string, string | null> = new Map();
  private baseValues: Map<string, Record<string, DialValue>> = new Map();
  private baseNames: Map<string, string> = new Map();
  private defaultValues: Map<string, Record<string, DialValue>> = new Map();
  private registrationCounts: Map<string, number> = new Map();
  private retainedPanels: Set<string> = new Set();
  private persistConfigs: Map<string, PersistConfig> = new Map();
  private configSignatures: Map<string, string> = new Map();
  /** Storage keys holding data from a newer DialKit, which this one must not overwrite. */
  private frozenStorageKeys: Set<string> = new Set();
  private listeningToOtherTabs = false;

  registerPanel(id: string, name: string, config: DialConfig, shortcuts?: Record<string, ShortcutConfig>, options: DialStorePanelOptions = {}): void {
    const { controls, controlsByPath, defaultValues } = this.parseConfig(config, shortcuts);
    if (!this.panelOpenStates.has(id) && options.defaultCollapsed !== undefined) {
      this.panelOpenStates.set(id, !options.defaultCollapsed);
    }
    const existingPanel = this.panels.get(id);
    if (existingPanel && existingPanel.kind !== options.kind) {
      console.warn(
        `[dialkit] Panel id "${id}" cannot be shared by a timeline and a standard panel; ` +
        `the most recent registration controls where it renders.`
      );
    }
    const signature = configSignature(config);
    if (existingPanel && this.configSignatures.get(id) !== signature) {
      warnOnce(`Panel id "${id}" is registered with different configs; the most recent one is used. Keep their configs consistent.`);
    }
    this.configSignatures.set(id, signature);
    const keyChanged = this.configurePanelRetention(id, name, options);
    this.registrationCounts.set(id, (this.registrationCounts.get(id) ?? 0) + 1);

    const persisted = this.loadPersistedPanel(id);
    // Moving to another storage slot replaces what is in memory.
    const moved = keyChanged ? persisted : null;
    const previousValues = moved?.values ?? this.panels.get(id)?.values ?? this.snapshots.get(id) ?? persisted?.values ?? {};
    const values = this.reconcileValues(defaultValues, previousValues, controlsByPath);

    const previousBaseValues = moved?.baseValues ?? this.baseValues.get(id) ?? persisted?.baseValues ?? persisted?.values ?? {};
    const baseValues = this.reconcileValues(defaultValues, previousBaseValues, controlsByPath);

    const panel: PanelConfig = { id, name, controls, values, shortcuts: shortcuts ?? {}, kind: options.kind };
    this.panels.set(id, panel);
    this.controlsByPanel.set(panel, controlsByPath);
    this.snapshots.set(id, { ...values });
    this.baseValues.set(id, baseValues);
    this.defaultValues.set(id, defaultValues);

    const existingPresets = moved?.presets ?? this.presets.get(id) ?? persisted?.presets;
    if (existingPresets) {
      this.presets.set(id, this.reconcilePresets(existingPresets, defaultValues, controlsByPath));
    }
    if (moved || (!this.activePreset.has(id) && persisted?.activePresetId !== undefined)) {
      this.activePreset.set(id, persisted?.activePresetId ?? null);
    }
    if (persisted?.baseName && (moved || !this.baseNames.has(id))) {
      this.baseNames.set(id, persisted.baseName);
    }

    this.warnShortcutConflicts(id, shortcuts);
    this.persistPanel(id);
    this.notify(id);
    this.notifyGlobal();
  }

  /** Updates a registered panel. An unregistered id stays unregistered: a late
   * update must not bring back a panel nothing is left to release. */
  updatePanel(id: string, name: string, config: DialConfig, shortcuts?: Record<string, ShortcutConfig>, options: DialStorePanelOptions = {}): void {
    const existing = this.panels.get(id);
    if (!existing) return;

    const { controls, controlsByPath, defaultValues } = this.parseConfig(config, shortcuts ?? existing.shortcuts);
    this.configSignatures.set(id, configSignature(config));
    const moved = this.configurePanelRetention(id, name, options) ? this.loadPersistedPanel(id) : null;
    const nextValues = this.reconcileValues(defaultValues, moved?.values ?? existing.values, controlsByPath);

    const nextPanel: PanelConfig = { id, name, controls, values: nextValues, shortcuts: shortcuts ?? existing.shortcuts, kind: options.kind ?? existing.kind };
    this.panels.set(id, nextPanel);
    this.controlsByPanel.set(nextPanel, controlsByPath);
    this.snapshots.set(id, { ...nextValues });

    this.baseValues.set(id, this.reconcileValues(defaultValues, moved?.baseValues ?? this.baseValues.get(id) ?? {}, controlsByPath));
    this.defaultValues.set(id, defaultValues);
    this.presets.set(id, this.reconcilePresets(moved?.presets ?? this.presets.get(id) ?? [], defaultValues, controlsByPath));
    if (moved) {
      this.activePreset.set(id, moved.activePresetId ?? null);
      if (moved.baseName) this.baseNames.set(id, moved.baseName);
    }

    this.warnShortcutConflicts(id, shortcuts);
    this.persistPanel(id);
    this.notify(id);
    this.notifyGlobal();
  }

  unregisterPanel(id: string): void {
    const nextCount = (this.registrationCounts.get(id) ?? 1) - 1;
    if (nextCount > 0) {
      this.registrationCounts.set(id, nextCount);
      return;
    }

    this.registrationCounts.delete(id);
    this.panels.delete(id);
    this.configSignatures.delete(id);
    // Keep listener sets: subscribed components can outlive the registration
    // (HMR unregister/re-register of the same id) and must keep receiving
    // notifications. Cleanup happens via unsubscribe closures.
    if (this.listeners.get(id)?.size === 0) this.listeners.delete(id);
    if (this.actionListeners.get(id)?.size === 0) this.actionListeners.delete(id);

    if (!this.retainedPanels.has(id)) {
      this.panelOpenStates.delete(id);
      this.snapshots.delete(id);
      this.baseValues.delete(id);
      this.baseNames.delete(id);
      this.defaultValues.delete(id);
      this.presets.delete(id);
      this.activePreset.delete(id);
      this.persistConfigs.delete(id);
    }

    this.notifyGlobal();
  }

  /** Undefined delegates the initial state to DialRoot.defaultOpen. */
  getPanelOpen(panelId: string): boolean | undefined {
    return this.panelOpenStates.get(panelId);
  }

  isPanelOpen(panelId: string): boolean {
    return this.panelOpenStates.get(panelId) ?? true;
  }

  togglePanelOpen(panelId: string): void {
    this.setPanelOpen(panelId, !this.isPanelOpen(panelId));
  }

  /** Applies a host component's own default; no-op once the panel has state. */
  initPanelOpen(panelId: string, open: boolean): void {
    if (!this.panels.has(panelId) || this.panelOpenStates.has(panelId)) return;
    this.panelOpenStates.set(panelId, open);
    this.notify(panelId);
  }

  /** Observe open requests so a containing toolkit can reveal its requested panel. */
  subscribePanelOpen(listener: (panelId: string, open: boolean) => void): () => void {
    this.panelOpenListeners.add(listener);
    return () => { this.panelOpenListeners.delete(listener); };
  }

  setPanelOpen(panelId: string, open: boolean): void {
    if (!this.panels.has(panelId)) return;
    if (this.panelOpenStates.get(panelId) !== open) {
      this.panelOpenStates.set(panelId, open);
      this.notify(panelId);
    }
    // Repeated open requests still reveal a collapsed containing toolkit.
    callListeners(this.panelOpenListeners, panelId, open);
  }

  updateValue(panelId: string, path: string, value: DialValue): void {
    this.updateValues(panelId, { [path]: value });
  }

  updateValues(panelId: string, updates: Record<string, DialValue>): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    const controls = this.controlsByPanel.get(panel);
    let changed = false;

    for (const [path, value] of Object.entries(updates)) {
      const control = controls?.get(path);
      if (!control || control.type === 'action' || !Object.prototype.hasOwnProperty.call(panel.values, path)) {
        continue;
      }

      const next = coerceControlValue(value, control);
      if (next === undefined) {
        warnOnce(`Ignored a value that doesn't fit ${control.type} control "${path}".`);
        continue;
      }
      if (sameDialValue(panel.values[path], next)) continue;

      panel.values[path] = next;
      changed = true;
    }

    if (changed) this.commit(panelId);
  }

  resetValues(panelId: string): void {
    const panel = this.panels.get(panelId);
    const defaults = this.defaultValues.get(panelId);
    if (!panel || !defaults) return;

    this.writeEditsToVersion(panelId);
    panel.values = cloneDialValue(defaults);
    this.baseValues.set(panelId, cloneDialValue(defaults));
    this.activePreset.set(panelId, null);
    this.commit(panelId);
  }

  /** @deprecated The mode follows the value. Write the transition to change it. */
  updateSpringMode(_panelId: string, _path: string, _mode: 'simple' | 'advanced'): void {}

  getSpringMode(panelId: string, path: string): 'simple' | 'advanced' {
    const mode = this.getTransitionMode(panelId, path);
    if (mode === 'easing') return 'simple';
    return mode;
  }

  /** @deprecated The mode follows the value. Write the transition to change it. */
  updateTransitionMode(_panelId: string, _path: string, _mode: TransitionMode): void {}

  getTransitionMode(panelId: string, path: string): TransitionMode {
    const value = this.panels.get(panelId)?.values[path];
    return isValidTransition(value) ? transitionModeOf(value) : 'simple';
  }

  getValue(panelId: string, path: string): DialValue | undefined {
    const panel = this.panels.get(panelId);
    return panel?.values[path];
  }

  getValues(panelId: string): Record<string, DialValue> {
    // Return the snapshot for useSyncExternalStore compatibility
    // Use stable EMPTY_VALUES to avoid infinite loop in React 19
    return this.snapshots.get(panelId) ?? EMPTY_VALUES;
  }

  getPanels(kind?: 'panel' | 'timeline'): PanelConfig[] {
    // Stable reference between global notifications: getSnapshot-style
    // consumers (React useSyncExternalStore, Solid `from`) compare by
    // identity, and a fresh array on every call makes them loop or re-render.
    if (kind === 'panel') return this.standardPanelsSnapshot;
    if (kind === 'timeline') return this.timelinePanelsSnapshot;
    return this.panelsSnapshot;
  }

  getPanel(id: string): PanelConfig | undefined {
    return this.panels.get(id);
  }

  subscribe(panelId: string, listener: Listener): () => void {
    if (!this.listeners.has(panelId)) {
      this.listeners.set(panelId, new Set());
    }
    this.listeners.get(panelId)!.add(listener);

    return () => {
      const listeners = this.listeners.get(panelId);
      listeners?.delete(listener);
      if (listeners?.size === 0 && !this.panels.has(panelId)) {
        this.listeners.delete(panelId);
      }
    };
  }

  subscribeGlobal(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  subscribeActions(panelId: string, listener: ActionListener): () => void {
    if (!this.actionListeners.has(panelId)) {
      this.actionListeners.set(panelId, new Set());
    }
    this.actionListeners.get(panelId)!.add(listener);

    return () => {
      const listeners = this.actionListeners.get(panelId);
      listeners?.delete(listener);
      if (listeners?.size === 0 && !this.panels.has(panelId)) {
        this.actionListeners.delete(panelId);
      }
    };
  }

  triggerAction(panelId: string, path: string): void {
    callListeners(this.actionListeners.get(panelId), path);
  }

  saveNewPreset(panelId: string): string {
    const names = [this.getBaseName(panelId), ...this.getPresets(panelId).map(preset => preset.name)];
    const highest = names.reduce((max, name) => {
      // Older saves used "Version N"; both count toward the next number.
      const match = /^(?:V|Version )(\d+)$/.exec(name);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 1);
    return this.savePreset(panelId, `V${highest + 1}`);
  }

  /** Edits made on the selected version go with the new one; the selected version keeps what it held. */
  savePreset(panelId: string, name: string): string {
    const panel = this.panels.get(panelId);
    if (!panel) throw new Error(`Panel ${panelId} not found`);

    const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const preset: Preset = {
      id,
      name: this.uniqueVersionName(panelId, name),
      values: cloneDialValue(panel.values),
    };

    const existing = this.presets.get(panelId) ?? [];
    this.presets.set(panelId, [...existing, preset]);
    this.activePreset.set(panelId, id);
    this.commit(panelId);

    return id;
  }

  loadPreset(panelId: string, presetId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    const presets = this.presets.get(panelId) ?? [];
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    this.writeEditsToVersion(panelId);
    panel.values = cloneDialValue(preset.values);
    this.activePreset.set(panelId, presetId);
    this.commit(panelId);
  }

  deletePreset(panelId: string, presetId: string): void {
    const presets = this.presets.get(panelId);
    if (!presets) return;
    this.presets.set(panelId, presets.filter(p => p.id !== presetId));

    // The visible values always belong to the active version, so losing the
    // active version returns to the base.
    if (this.activePreset.get(panelId) === presetId) {
      this.activePreset.set(panelId, null);
      const panel = this.panels.get(panelId);
      const base = this.baseValues.get(panelId);
      if (panel && base) panel.values = cloneDialValue(base);
    }

    this.commit(panelId);
  }

  /** Rename a saved version. A null presetId renames the base version. */
  renamePreset(panelId: string, presetId: string | null, name: string): void {
    const trimmed = name.trim();
    if (!trimmed || !this.snapshots.has(panelId)) return;
    if (presetId === null) {
      this.baseNames.set(panelId, this.uniqueVersionName(panelId, trimmed, null));
    } else {
      const presets = this.presets.get(panelId) ?? [];
      if (!presets.some(p => p.id === presetId)) return;
      const unique = this.uniqueVersionName(panelId, trimmed, presetId);
      this.presets.set(panelId, presets.map(p => p.id === presetId ? { ...p, name: unique } : p));
    }
    this.commit(panelId);
  }

  /** Where a panel's saved versions persist, if they do. */
  getPresetStorage(panelId: string): { key: string; storage: 'localStorage' | 'sessionStorage' } | null {
    const config = this.persistConfigs.get(panelId);
    return config?.presets ? { key: config.key, storage: config.storage } : null;
  }

  /** Display name of the base version (the values before any saved preset). */
  getBaseName(panelId: string): string {
    return this.baseNames.get(panelId) ?? 'V1';
  }

  getPresets(panelId: string): Preset[] {
    return this.presets.get(panelId) ?? [];
  }

  getActivePresetId(panelId: string): string | null {
    return this.activePreset.get(panelId) ?? null;
  }

  clearActivePreset(panelId: string): void {
    const panel = this.panels.get(panelId);
    const base = this.baseValues.get(panelId);
    this.writeEditsToVersion(panelId);
    if (panel && base) panel.values = cloneDialValue(base);
    this.activePreset.set(panelId, null);
    this.commit(panelId);
  }

  /** Whether the visible values differ from what the selected version holds. */
  hasEdits(panelId: string): boolean {
    const panel = this.panels.get(panelId);
    const held = this.selectedVersionValues(panelId);
    return !!panel && !!held && !sameDialValue(panel.values, held);
  }

  /** Make the current edits part of the selected version. Leaving a version does this too. */
  keepEdits(panelId: string): void {
    if (this.writeEditsToVersion(panelId)) this.commit(panelId);
  }

  /** `modifier` is whatever is held; only a shortcut declaring exactly it matches. */
  resolveShortcutTarget(key: string, modifier?: string): {
    panelId: string;
    path: string;
    control: ControlMeta;
  } | null {
    for (const panel of this.panels.values()) {
      for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
        if (!shortcut.key) continue; // skip keyless shortcuts
        if (shortcut.key.toLowerCase() !== key.toLowerCase()) continue;
        const scMod = shortcut.modifier ?? undefined;
        if (scMod !== modifier) continue;

        const control = this.controlsByPanel.get(panel)?.get(path);
        if (control) {
          return { panelId: panel.id, path, control };
        }
      }
    }
    return null;
  }

  resolveScrollOnlyTargets(): Array<{
    panelId: string;
    path: string;
    control: ControlMeta;
    shortcut: ShortcutConfig;
  }> {
    const results: Array<{ panelId: string; path: string; control: ControlMeta; shortcut: ShortcutConfig }> = [];
    for (const panel of this.panels.values()) {
      for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
        if ((shortcut.interaction ?? 'scroll') !== 'scroll-only') continue;
        const control = this.controlsByPanel.get(panel)?.get(path);
        if (control) {
          results.push({ panelId: panel.id, path, control, shortcut });
        }
      }
    }
    return results;
  }

  /** What the selected version holds. Edits stay in `panel.values` until the version is left,
   * so saving them as a new version leaves this one as it was. */
  private selectedVersionValues(panelId: string): Record<string, DialValue> | undefined {
    const activeId = this.activePreset.get(panelId);
    return activeId
      ? this.presets.get(panelId)?.find(preset => preset.id === activeId)?.values
      : this.baseValues.get(panelId);
  }

  private writeEditsToVersion(panelId: string): boolean {
    const panel = this.panels.get(panelId);
    const held = this.selectedVersionValues(panelId);
    if (!panel || !held || sameDialValue(panel.values, held)) return false;
    Object.assign(held, cloneDialValue(panel.values));
    return true;
  }

  /** Publish a change: every mutation of panel, preset, or version state ends here,
   * because subscribers learn about all of them from a new snapshot object. */
  private commit(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (panel) this.snapshots.set(panelId, { ...panel.values });
    this.persistPanel(panelId);
    this.notify(panelId);
  }

  private uniqueVersionName(panelId: string, name: string, renaming?: string | null): string {
    const taken = new Set(this.getPresets(panelId).filter(preset => preset.id !== renaming).map(preset => preset.name));
    if (renaming !== null) taken.add(this.getBaseName(panelId));
    if (!taken.has(name)) return name;
    let suffix = 2;
    while (taken.has(`${name} ${suffix}`)) suffix++;
    return `${name} ${suffix}`;
  }

  private warnShortcutConflicts(id: string, shortcuts?: Record<string, ShortcutConfig>): void {
    for (const [path, shortcut] of Object.entries(shortcuts ?? {})) {
      if (!shortcut.key) continue;
      for (const panel of this.panels.values()) {
        for (const [otherPath, other] of Object.entries(panel.shortcuts)) {
          if (panel.id === id && otherPath === path) continue;
          if (other.key?.toLowerCase() === shortcut.key.toLowerCase() && other.modifier === shortcut.modifier) {
            warnOnce(`Shortcut "${shortcut.key}" is used by both "${otherPath}" and "${path}"; the first registered wins.`);
          }
        }
      }
    }
  }

  /** Reports whether the panel moved to a different storage slot. Leaving `persist`
   * out of the options keeps the current setting; passing it as undefined or false
   * removes it, which is how a host drops the option. */
  private configurePanelRetention(id: string, name: string, options: DialStorePanelOptions): boolean {
    const previous = this.persistConfigs.get(id);
    if (options.retainOnUnmount) this.retainedPanels.add(id);

    const persistConfig = this.normalizePersistConfig(id, name, options);
    if (persistConfig) {
      this.persistConfigs.set(id, persistConfig);
      this.retainedPanels.add(id);
      this.listenToOtherTabs();
    } else if ('persist' in options) {
      this.persistConfigs.delete(id);
    }
    if (options.retainOnUnmount === false && !this.persistConfigs.has(id)) this.retainedPanels.delete(id);

    return Boolean(previous && persistConfig &&
      (previous.key !== persistConfig.key || previous.storage !== persistConfig.storage));
  }

  private reconcileValues(
    defaultValues: Record<string, DialValue>,
    previousValues: Record<string, DialValue>,
    controlsByPath: Map<string, ControlMeta>
  ): Record<string, DialValue> {
    const nextValues: Record<string, DialValue> = {};

    for (const [path, defaultValue] of Object.entries(defaultValues)) {
      nextValues[path] = cloneDialValue(this.normalizePreservedValue(
        previousValues[path],
        defaultValue,
        controlsByPath.get(path)
      ));
    }

    return nextValues;
  }

  private reconcilePresets(
    presets: Preset[],
    defaultValues: Record<string, DialValue>,
    controlsByPath: Map<string, ControlMeta>
  ): Preset[] {
    return presets.map((preset) => ({
      ...preset,
      values: this.reconcileValues(defaultValues, preset.values, controlsByPath),
    }));
  }

  private normalizePersistConfig(id: string, name: string, options: DialStorePanelOptions): PersistConfig | null {
    const { persist } = options;
    if (!persist) return null;
    const settings = typeof persist === 'object' ? persist : {};
    let key = settings.key;
    let legacyKey: string | undefined;
    if (!key) {
      // A generated id changes with the component tree, so it can't name saved data.
      if (options.retainOnUnmount === false) {
        warnOnce(`Panel "${name}" uses persist without an id, so it saves under its name. Pass a stable id to keep two "${name}" panels apart.`);
        key = `dialkit:${name}`;
        if (options.legacyId) legacyKey = `dialkit:${options.legacyId}`;
      } else {
        key = `dialkit:${id}`;
      }
    }
    return {
      key,
      storage: settings.storage ?? 'localStorage',
      presets: settings.presets ?? true,
      legacyKey,
    };
  }

  private loadPersistedPanel(id: string): PersistedPanelState | null {
    const config = this.persistConfigs.get(id);
    if (!config) return null;

    const storage = this.getStorage(config.storage);
    if (!storage) return null;

    try {
      const raw = storage.getItem(config.key) ?? this.moveLegacyData(storage, config);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return null;
      if (parsed.version !== 1) {
        if (typeof parsed.version === 'number' && parsed.version > 1) {
          this.frozenStorageKeys.add(config.key);
          warnOnce(`"${config.key}" was saved by a newer DialKit, so it is being left alone and changes stay in memory.`);
        }
        return null;
      }
      const values = isRecord(parsed.values) ? parsed.values as Record<string, DialValue> : undefined;
      const presets = config.presets && Array.isArray(parsed.presets)
        ? parsed.presets.filter((preset): preset is Preset =>
          isRecord(preset) && typeof preset.id === 'string' && typeof preset.name === 'string' && isRecord(preset.values))
        : [];
      return {
        version: 1,
        values,
        baseValues: config.presets && isRecord(parsed.baseValues) ? parsed.baseValues as Record<string, DialValue> : values,
        presets,
        activePresetId: presets.some(preset => preset.id === parsed.activePresetId) ? parsed.activePresetId as string : null,
        baseName: config.presets && typeof parsed.baseName === 'string' ? parsed.baseName : undefined,
      };
    } catch {
      return null;
    }
  }

  /** Moves what 2.1 saved under a generated id to the panel's key, so it loads once and can't come back stale later. */
  private moveLegacyData(storage: Storage, config: PersistConfig): string | null {
    const legacyKey = config.legacyKey;
    const raw = legacyKey ? storage.getItem(legacyKey) : null;
    if (!legacyKey || !raw) return null;
    try {
      storage.setItem(config.key, raw);
      const thumbnails = storage.getItem(`${legacyKey}:thumbnails`);
      if (thumbnails) storage.setItem(`${config.key}:thumbnails`, thumbnails);
      storage.removeItem(legacyKey);
      storage.removeItem(`${legacyKey}:thumbnails`);
    } catch {
      // Storage is full: use the old data now and leave it where it is.
    }
    return raw;
  }

  private persistPanel(id: string): void {
    const config = this.persistConfigs.get(id);
    if (!config || this.frozenStorageKeys.has(config.key)) return;

    const storage = this.getStorage(config.storage);
    if (!storage) return;

    const values = this.snapshots.get(id) ?? this.panels.get(id)?.values;
    if (!values) return;

    const state: PersistedPanelState = { version: 1, values };
    if (config.presets) {
      state.baseValues = this.baseValues.get(id) ?? values;
      state.presets = this.presets.get(id) ?? [];
      state.activePresetId = this.activePreset.get(id) ?? null;
      const baseName = this.baseNames.get(id);
      if (baseName) state.baseName = baseName;
    }

    const text = JSON.stringify(state);
    try {
      storage.setItem(config.key, text);
    } catch {
      // Values matter more than their preview images, which share this quota.
      try {
        storage.removeItem(`${config.key}:thumbnails`);
        storage.setItem(config.key, text);
      } catch {
        warnOnce(`Couldn't save "${config.key}" to ${config.storage}, so recent changes only exist in memory.`);
      }
    }
  }

  private listenToOtherTabs(): void {
    if (this.listeningToOtherTabs) return;
    const target = globalThis as unknown as { window?: { addEventListener?: Window['addEventListener'] } };
    if (typeof target.window?.addEventListener !== 'function') return;
    this.listeningToOtherTabs = true;
    target.window.addEventListener('storage', this.handleStorageEvent);
  }

  /** Another tab saved this panel: show its state rather than overwrite it on our next write. */
  private handleStorageEvent = (event: StorageEvent): void => {
    if (event.newValue === null) return;
    for (const [id, config] of this.persistConfigs) {
      if (event.key !== config.key || event.storageArea !== this.getStorage(config.storage)) continue;
      const persisted = this.loadPersistedPanel(id);
      if (persisted) this.adoptPersisted(id, persisted);
    }
  };

  private adoptPersisted(id: string, persisted: PersistedPanelState): void {
    const panel = this.panels.get(id);
    const defaults = this.defaultValues.get(id);
    const controls = panel && this.controlsByPanel.get(panel);
    if (!panel || !defaults || !controls) {
      // Not mounted: forget the memory copy so the next registration reads storage.
      this.snapshots.delete(id);
      this.baseValues.delete(id);
      this.presets.delete(id);
      this.activePreset.delete(id);
      this.baseNames.delete(id);
      return;
    }
    panel.values = this.reconcileValues(defaults, persisted.values ?? {}, controls);
    this.baseValues.set(id, this.reconcileValues(defaults, persisted.baseValues ?? {}, controls));
    this.presets.set(id, this.reconcilePresets(persisted.presets ?? [], defaults, controls));
    this.activePreset.set(id, persisted.activePresetId ?? null);
    if (persisted.baseName) this.baseNames.set(id, persisted.baseName);
    this.snapshots.set(id, { ...panel.values });
    this.notify(id);
  }

  private getStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
    if (typeof globalThis === 'undefined' || !('window' in globalThis)) {
      return null;
    }

    try {
      return kind === 'sessionStorage'
        ? globalThis.window?.sessionStorage ?? null
        : globalThis.window?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private notify(panelId: string): void {
    callListeners(this.listeners.get(panelId));
  }

  private notifyGlobal(): void {
    this.panelsSnapshot = Array.from(this.panels.values());
    this.standardPanelsSnapshot = this.panelsSnapshot.filter((panel) => panel.kind !== 'timeline');
    this.timelinePanelsSnapshot = this.panelsSnapshot.filter((panel) => panel.kind === 'timeline');
    callListeners(this.globalListeners);
  }

  /** Compile controls, defaults, and the lookup index in one walk. */
  private parseConfig(config: DialConfig, shortcuts?: Record<string, ShortcutConfig>) {
    const defaultValues: Record<string, DialValue> = {};
    const controlsByPath = new Map<string, ControlMeta>();
    const visit = (config: DialConfig, prefix: string): ControlMeta[] => {
      const controls: ControlMeta[] = [];

      for (const [key, value] of Object.entries(config)) {
        if (key === '_collapsed') continue;
        if (key.includes('.')) {
          warnOnce(`Key "${key}" contains ".", which also separates nested paths, so it can collide with a nested key.`);
        }
        const path = prefix ? `${prefix}.${key}` : key;
        const label = formatLabel(key);
        const shortcut = shortcuts?.[path];
        let control: ControlMeta | undefined;

        if (isSliderTuple(value) || typeof value === 'number') {
          // Range tuple [default, min, max, step?], or a single number with an inferred range
          const { min, max, step } = sliderRange(value, (problem) => warnOnce(`Slider "${path}" ${problem}.`));
          control = { type: 'slider', path, label, min, max, step, shortcut };
        } else if (Array.isArray(value)) {
          warnOnce(`"${path}" is an array but not a [default, min, max, step?] tuple, so it was skipped.`);
          continue;
        } else if (typeof value === 'boolean') {
          control = { type: 'toggle', path, label, shortcut };
        } else if (isSpringConfigValue(value) || isEasingConfigValue(value)) {
          control = { type: 'transition', path, label };
        } else if (isActionConfigValue(value)) {
          control = { type: 'action', path, label: value.label || label };
        } else if (isSelectConfigValue(value)) {
          control = { type: 'select', path, label, options: value.options };
        } else if (isColorConfigValue(value)) {
          control = { type: 'color', path, label };
        } else if (isImageConfigValue(value)) {
          control = { type: 'image', path, label, options: value.options };
        } else if (isTextConfigValue(value)) {
          control = { type: 'text', path, label, placeholder: value.placeholder };
        } else if (isPadConfigValue(value)) {
          control = { type: 'pad', path, label, pad: value };
        } else if (typeof value === 'string') {
          // Auto-detect: hex color vs text
          if (parseColor(value) && value !== 'transparent') {
            control = { type: 'color', path, label };
          } else {
            control = { type: 'text', path, label };
          }
        } else if (typeof value === 'object' && value !== null) {
          // Nested object becomes a folder
          const folderConfig = value as DialConfig;
          const defaultOpen = '_collapsed' in folderConfig ? !(folderConfig._collapsed as boolean) : true;
          control = {
            type: 'folder',
            path,
            label,
            defaultOpen,
            children: visit(folderConfig, path),
          };
        }
        if (!control) continue;
        const fields = CONTROL_FIELDS[control.type];
        if (fields && typeof value === 'object' && value !== null) {
          const ignored = Object.keys(value).filter((field) => field !== 'type' && !fields.includes(field));
          if (ignored.length) {
            warnOnce(`"${path}" has type "${control.type}", so it is a control and ${ignored.join(', ')} ignored. Rename its "type" key if it should be a folder.`);
          }
        }
        controls.push(control);
        controlsByPath.set(path, control);
        if (control.type === 'folder') continue;
        defaultValues[path] = cloneDialValue(configDefaultValue(value));
      }

      return controls;
    };
    const controls = visit(config, '');
    return { controls, defaultValues, controlsByPath };
  }

  private normalizePreservedValue(
    existingValue: DialValue | undefined,
    defaultValue: DialValue,
    control: ControlMeta | undefined
  ): DialValue {
    // An authored default is honored as written, even when it is off the step grid.
    if (existingValue === undefined || !control || sameDialValue(existingValue, defaultValue)) {
      return defaultValue;
    }
    return coerceControlValue(existingValue, control) ?? defaultValue;
  }
}

function configSignature(config: DialConfig): string {
  try {
    return JSON.stringify(config);
  } catch {
    return '';
  }
}

// Singleton instance
export const DialStore = /* @__PURE__ */ pageSingleton('DialStore', () => new DialStoreClass());
