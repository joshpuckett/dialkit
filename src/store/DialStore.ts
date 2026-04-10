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

export type TextConfig = {
  type: 'text';
  default?: string;
  placeholder?: string;
};

export type DialValue = number | boolean | string | SpringConfig | EasingConfig | ActionConfig | SelectConfig | ColorConfig | TextConfig;

export type VisibleWhenValue = string | boolean | number;

/**
 * Rule for conditional control visibility. Exactly one of `is` or `not`
 * should be provided — if both are set, only `is` is evaluated.
 */
export type VisibleWhen = {
  /**
   * Flat store path of another control in the same panel to watch.
   * Must be the full dot-delimited path as it appears in panel.values
   * (e.g. `"debug.showStats"` for a nested control, not a relative path).
   */
  field: string;
} & (
  | { is: VisibleWhenValue | VisibleWhenValue[]; not?: never }
  | { not: VisibleWhenValue | VisibleWhenValue[]; is?: never }
  | { is?: undefined; not?: undefined }
);

/**
 * Wraps a control with a visibility rule. The control is only added to the
 * panel's rendered tree when its rule passes. Re-evaluated on every value
 * change. Use the {@link withVisibility} helper instead of building this by hand.
 */
export type ControlWithVisibility<T = DialValue | [number, number, number, number?] | DialConfig> = {
  value: T;
  visibleWhen: VisibleWhen;
};

/**
 * Tag any DialKit control with a conditional visibility rule. The control is
 * only shown when `rule` passes against the current panel values.
 *
 * @example
 * const config = {
 *   layoutMode: { type: 'select', options: ['grid', 'sphere'] },
 *   radius: withVisibility([1, 0, 10], { field: 'layoutMode', is: 'sphere' }),
 * };
 */
export function withVisibility<T extends DialValue | [number, number, number, number?] | DialConfig>(
  control: T,
  rule: VisibleWhen
): ControlWithVisibility<T> {
  return { value: control, visibleWhen: rule };
}

/** The union of all value shapes that can appear in a DialConfig entry. */
type DialConfigValue = DialValue | [number, number, number, number?] | DialConfig;

/**
 * Detect and unwrap a `{ value, visibleWhen }` wrapper produced by
 * {@link withVisibility}. Returns the inner value if wrapped, or the
 * original value if not.
 *
 * Exported for use by framework hooks (React, Solid, Svelte, Vue) so
 * they can strip the wrapper when building resolved values without
 * duplicating the detection logic.
 */
export function unwrapVisibility(raw: unknown): DialConfigValue {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    'value' in raw &&
    'visibleWhen' in raw
  ) {
    return (raw as ControlWithVisibility).value;
  }
  return raw as DialConfigValue;
}

export type DialConfig = {
  [key: string]: DialValue | [number, number, number, number?] | DialConfig | ControlWithVisibility;
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
          : T[K] extends ColorConfig
            ? string
            : T[K] extends TextConfig
              ? string
              : T[K] extends DialConfig
                ? ResolvedValues<T[K]>
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
  type: 'slider' | 'toggle' | 'spring' | 'transition' | 'folder' | 'action' | 'select' | 'color' | 'text';
  path: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  children?: ControlMeta[];
  defaultOpen?: boolean;
  options?: (string | { value: string; label: string })[];
  placeholder?: string;
  shortcut?: ShortcutConfig;
  /** Conditional visibility rule attached via {@link withVisibility}. */
  visibleWhen?: VisibleWhen;
};

export type PanelConfig = {
  id: string;
  name: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
  shortcuts: Record<string, ShortcutConfig>;
};

type Listener = () => void;
type ActionListener = (action: string) => void;

export type Preset = {
  id: string;
  name: string;
  values: Record<string, DialValue>;
};

// Stable empty object for unregistered panels (React 19 useSyncExternalStore requirement)
const EMPTY_VALUES: Record<string, DialValue> = Object.freeze({});

class DialStoreClass {
  private panels: Map<string, PanelConfig> = new Map();
  private listeners: Map<string, Set<Listener>> = new Map();
  private globalListeners: Set<Listener> = new Set();
  private snapshots: Map<string, Record<string, DialValue>> = new Map();
  private actionListeners: Map<string, Set<ActionListener>> = new Map();
  private presets: Map<string, Preset[]> = new Map();
  private activePreset: Map<string, string | null> = new Map();
  private baseValues: Map<string, Record<string, DialValue>> = new Map();
  /**
   * Full (unfiltered) control tree per panel. `panels[id].controls` holds the
   * tree with conditional-visibility controls already filtered out, which is
   * what the UI renders. We keep the unfiltered tree here so visibility can
   * flip back when a dependent value changes.
   */
  private allControls: Map<string, ControlMeta[]> = new Map();

  registerPanel(id: string, name: string, config: DialConfig, shortcuts?: Record<string, ShortcutConfig>): void {
    const allControls = this.parseConfig(config, '', shortcuts);
    const values = this.flattenValues(config, '');

    // Set initial transition modes based on config types
    this.initTransitionModes(config, '', values);

    this.allControls.set(id, allControls);
    const controls = this.filterByVisibility(allControls, values);

    this.panels.set(id, { id, name, controls, values, shortcuts: shortcuts ?? {} });
    this.snapshots.set(id, { ...values });
    this.baseValues.set(id, { ...values });
    this.notifyGlobal();
  }

  updatePanel(id: string, name: string, config: DialConfig, shortcuts?: Record<string, ShortcutConfig>): void {
    const existing = this.panels.get(id);
    if (!existing) {
      this.registerPanel(id, name, config, shortcuts);
      return;
    }

    const allControls = this.parseConfig(config, '', shortcuts);
    const controlsByPath = this.mapControlsByPath(allControls);
    const defaultValues = this.flattenValues(config, '');
    const nextValues: Record<string, DialValue> = {};

    for (const [path, defaultValue] of Object.entries(defaultValues)) {
      nextValues[path] = this.normalizePreservedValue(
        existing.values[path],
        defaultValue,
        controlsByPath.get(path)
      );
    }

    // Set mode defaults for new transition controls first.
    this.initTransitionModes(config, '', nextValues);

    for (const [path, mode] of Object.entries(existing.values)) {
      if (!path.endsWith('.__mode')) {
        continue;
      }

      const transitionPath = path.slice(0, -'__mode'.length - 1);
      const transitionControl = controlsByPath.get(transitionPath);
      if (transitionControl?.type === 'transition') {
        nextValues[path] = mode;
      }
    }

    this.allControls.set(id, allControls);
    const controls = this.filterByVisibility(allControls, nextValues);

    const nextPanel: PanelConfig = { id, name, controls, values: nextValues, shortcuts: shortcuts ?? existing.shortcuts };
    this.panels.set(id, nextPanel);
    this.snapshots.set(id, { ...nextValues });

    const previousBaseValues = this.baseValues.get(id) ?? {};
    const nextBaseValues: Record<string, DialValue> = {};
    for (const [path, defaultValue] of Object.entries(defaultValues)) {
      nextBaseValues[path] = this.normalizePreservedValue(
        previousBaseValues[path],
        defaultValue,
        controlsByPath.get(path)
      );
    }

    for (const [path, value] of Object.entries(nextValues)) {
      if (path.endsWith('.__mode')) {
        nextBaseValues[path] = value;
      }
    }

    this.baseValues.set(id, nextBaseValues);

    this.notify(id);
    this.notifyGlobal();
  }

  unregisterPanel(id: string): void {
    this.panels.delete(id);
    this.listeners.delete(id);
    this.snapshots.delete(id);
    this.actionListeners.delete(id);
    this.baseValues.delete(id);
    this.allControls.delete(id);
    this.notifyGlobal();
  }

  updateValue(panelId: string, path: string, value: DialValue): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.values[path] = value;

    // Auto-save to active preset or base values
    const activeId = this.activePreset.get(panelId);
    if (activeId) {
      const presets = this.presets.get(panelId) ?? [];
      const preset = presets.find(p => p.id === activeId);
      if (preset) preset.values[path] = value;
    } else {
      const base = this.baseValues.get(panelId);
      if (base) base[path] = value;
    }

    // Create a new snapshot reference so useSyncExternalStore detects the change
    this.snapshots.set(panelId, { ...panel.values });
    this.notify(panelId);

    // Re-evaluate conditional visibility. If any control's visibility flipped,
    // rebuild the filtered tree and bump the global listener so DialRoot picks
    // up the new controls array.
    const allControls = this.allControls.get(panelId);
    if (!allControls) return;
    const nextControls = this.filterByVisibility(allControls, panel.values);
    if (!this.sameControlPaths(panel.controls, nextControls)) {
      panel.controls = nextControls;
      this.notifyGlobal();
    }
  }

  updateSpringMode(panelId: string, path: string, mode: 'simple' | 'advanced'): void {
    this.updateTransitionMode(panelId, path, mode);
  }

  getSpringMode(panelId: string, path: string): 'simple' | 'advanced' {
    const mode = this.getTransitionMode(panelId, path);
    if (mode === 'easing') return 'simple';
    return mode;
  }

  updateTransitionMode(panelId: string, path: string, mode: 'easing' | 'simple' | 'advanced'): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    const modePath = `${path}.__mode`;
    panel.values[modePath] = mode;

    // Auto-save to active preset or base values, mirroring updateValue.
    // Without this, mode changes are ephemeral — they die at the next
    // preset switch because loadPreset replaces panel.values wholesale.
    const activeId = this.activePreset.get(panelId);
    if (activeId) {
      const presets = this.presets.get(panelId) ?? [];
      const preset = presets.find(p => p.id === activeId);
      if (preset) preset.values[modePath] = mode;
    } else {
      const base = this.baseValues.get(panelId);
      if (base) base[modePath] = mode;
    }

    this.snapshots.set(panelId, { ...panel.values });
    this.notify(panelId);
  }

  getTransitionMode(panelId: string, path: string): 'easing' | 'simple' | 'advanced' {
    const panel = this.panels.get(panelId);
    if (!panel) return 'simple';
    return (panel.values[`${path}.__mode`] as 'easing' | 'simple' | 'advanced') || 'simple';
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

  getPanels(): PanelConfig[] {
    return Array.from(this.panels.values());
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
      this.listeners.get(panelId)?.delete(listener);
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
      this.actionListeners.get(panelId)?.delete(listener);
    };
  }

  triggerAction(panelId: string, path: string): void {
    this.actionListeners.get(panelId)?.forEach(fn => fn(path));
  }

  savePreset(panelId: string, name: string): string {
    const panel = this.panels.get(panelId);
    if (!panel) throw new Error(`Panel ${panelId} not found`);

    const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const preset: Preset = {
      id,
      name,
      values: { ...panel.values },
    };

    const existing = this.presets.get(panelId) ?? [];
    this.presets.set(panelId, [...existing, preset]);
    this.activePreset.set(panelId, id);

    // Force re-render by creating new snapshot reference
    this.snapshots.set(panelId, { ...panel.values });
    this.notify(panelId);

    return id;
  }

  loadPreset(panelId: string, presetId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    const presets = this.presets.get(panelId) ?? [];
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    // Apply preset values
    panel.values = { ...preset.values };
    this.snapshots.set(panelId, { ...panel.values });
    this.activePreset.set(panelId, presetId);

    // Re-evaluate conditional visibility against the preset's values. If
    // any control's visibility flipped (e.g. the preset changed a field
    // that drives a `visibleWhen` rule), rebuild the filtered tree and
    // bump the global listener so DialRoot picks up the new controls.
    const allControls = this.allControls.get(panelId);
    if (allControls) {
      const nextControls = this.filterByVisibility(allControls, panel.values);
      if (!this.sameControlPaths(panel.controls, nextControls)) {
        panel.controls = nextControls;
        this.notifyGlobal();
      }
    }

    this.notify(panelId);
  }

  deletePreset(panelId: string, presetId: string): void {
    const presets = this.presets.get(panelId) ?? [];
    this.presets.set(panelId, presets.filter(p => p.id !== presetId));

    // Clear active if deleted
    if (this.activePreset.get(panelId) === presetId) {
      this.activePreset.set(panelId, null);
    }

    // Force re-render by creating new snapshot reference
    const panel = this.panels.get(panelId);
    if (panel) {
      this.snapshots.set(panelId, { ...panel.values });
    }
    this.notify(panelId);
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
    if (panel && base) {
      panel.values = { ...base };
      this.snapshots.set(panelId, { ...panel.values });

      // Re-evaluate conditional visibility against the restored base
      // values, same as loadPreset. Without this, switching back to
      // "Version 1" from an active preset keeps the preset's control
      // tree even though the values have reverted.
      const allControls = this.allControls.get(panelId);
      if (allControls) {
        const nextControls = this.filterByVisibility(allControls, panel.values);
        if (!this.sameControlPaths(panel.controls, nextControls)) {
          panel.controls = nextControls;
          this.notifyGlobal();
        }
      }
    }
    this.activePreset.set(panelId, null);
    this.notify(panelId);
  }

  resolveShortcutTarget(key: string, modifier?: 'alt' | 'shift' | 'meta'): {
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

        const control = this.findControlByPath(panel.controls, path);
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
        const control = this.findControlByPath(panel.controls, path);
        if (control) {
          results.push({ panelId: panel.id, path, control, shortcut });
        }
      }
    }
    return results;
  }

  private findControlByPath(controls: ControlMeta[], path: string): ControlMeta | null {
    for (const control of controls) {
      if (control.path === path) return control;
      if (control.type === 'folder' && control.children) {
        const found = this.findControlByPath(control.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  private notify(panelId: string): void {
    this.listeners.get(panelId)?.forEach(fn => fn());
  }

  private notifyGlobal(): void {
    this.globalListeners.forEach(fn => fn());
  }

  private initTransitionModes(config: DialConfig, prefix: string, values: Record<string, DialValue>): void {
    for (const [key, rawValue] of Object.entries(config)) {
      if (key === '_collapsed') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      // Unwrap conditional-visibility wrapper before shape dispatch.
      const value = this.unwrapVisibilityWithRule(rawValue).value;

      if (this.isEasingConfig(value)) {
        values[`${path}.__mode`] = 'easing';
      } else if (this.isSpringConfig(value)) {
        // Detect physics mode from config
        const hasPhysics = value.stiffness !== undefined || value.damping !== undefined || value.mass !== undefined;
        const hasTime = value.visualDuration !== undefined || value.bounce !== undefined;
        values[`${path}.__mode`] = hasPhysics && !hasTime ? 'advanced' : 'simple';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !this.isActionConfig(value) && !this.isSelectConfig(value) && !this.isColorConfig(value) && !this.isTextConfig(value)) {
        this.initTransitionModes(value as DialConfig, path, values);
      }
    }
  }

  private parseConfig(config: DialConfig, prefix: string, shortcuts?: Record<string, ShortcutConfig>): ControlMeta[] {
    const controls: ControlMeta[] = [];
    const startLen = () => controls.length;
    const tagLast = (visibleWhen: VisibleWhen | undefined, before: number) => {
      if (!visibleWhen) return;
      for (let i = before; i < controls.length; i++) {
        if (!controls[i].visibleWhen) controls[i].visibleWhen = visibleWhen;
      }
    };

    for (const [key, rawValue] of Object.entries(config)) {
      if (key === '_collapsed') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const label = this.formatLabel(key);
      const shortcut = shortcuts?.[path];

      // Unwrap conditional-visibility wrapper, remember the rule.
      const unwrapped = this.unwrapVisibilityWithRule(rawValue);
      const value = unwrapped.value;
      const visibleWhen = unwrapped.visibleWhen;
      const before = startLen();

      if (Array.isArray(value) && value.length <= 4 && typeof value[0] === 'number') {
        // Range tuple: [default, min, max]
        controls.push({
          type: 'slider',
          path,
          label,
          min: value[1],
          max: value[2],
          step: value[3] ?? this.inferStep(value[1], value[2]),
          shortcut,
        });
      } else if (typeof value === 'number') {
        // Single number - auto-infer range
        const { min, max, step } = this.inferRange(value);
        controls.push({ type: 'slider', path, label, min, max, step, shortcut });
      } else if (typeof value === 'boolean') {
        controls.push({ type: 'toggle', path, label, shortcut });
      } else if (this.isSpringConfig(value) || this.isEasingConfig(value)) {
        controls.push({ type: 'transition', path, label });
      } else if (this.isActionConfig(value)) {
        controls.push({ type: 'action', path, label: (value as ActionConfig).label || label });
      } else if (this.isSelectConfig(value)) {
        controls.push({ type: 'select', path, label, options: value.options });
      } else if (this.isColorConfig(value)) {
        controls.push({ type: 'color', path, label });
      } else if (this.isTextConfig(value)) {
        controls.push({ type: 'text', path, label, placeholder: value.placeholder });
      } else if (typeof value === 'string') {
        // Auto-detect: hex color vs text
        if (this.isHexColor(value)) {
          controls.push({ type: 'color', path, label });
        } else {
          controls.push({ type: 'text', path, label });
        }
      } else if (typeof value === 'object' && value !== null) {
        // Nested object becomes a folder
        const folderConfig = value as DialConfig;
        const defaultOpen = '_collapsed' in folderConfig ? !(folderConfig._collapsed as boolean) : true;
        controls.push({
          type: 'folder',
          path,
          label,
          defaultOpen,
          children: this.parseConfig(folderConfig, path, shortcuts),
        });
      }

      tagLast(visibleWhen, before);
    }

    return controls;
  }

  private flattenValues(config: DialConfig, prefix: string): Record<string, DialValue> {
    const values: Record<string, DialValue> = {};

    for (const [key, rawValue] of Object.entries(config)) {
      if (key === '_collapsed') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      // Unwrap conditional-visibility wrapper before shape dispatch.
      const value = this.unwrapVisibilityWithRule(rawValue).value;

      if (Array.isArray(value) && value.length <= 4 && typeof value[0] === 'number') {
        values[path] = value[0]; // Default value
      } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        values[path] = value;
      } else if (this.isSpringConfig(value) || this.isEasingConfig(value)) {
        values[path] = value;
      } else if (this.isActionConfig(value)) {
        // Actions don't need stored values - they're just triggers
        values[path] = value;
      } else if (this.isSelectConfig(value)) {
        // Use default or first option's value
        const firstOption = value.options[0];
        const firstValue = typeof firstOption === 'string' ? firstOption : firstOption.value;
        values[path] = value.default ?? firstValue;
      } else if (this.isColorConfig(value)) {
        values[path] = value.default ?? '#000000';
      } else if (this.isTextConfig(value)) {
        values[path] = value.default ?? '';
      } else if (typeof value === 'object' && value !== null) {
        Object.assign(values, this.flattenValues(value as DialConfig, path));
      }
    }

    return values;
  }

  private isSpringConfig(value: unknown): value is SpringConfig {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as SpringConfig).type === 'spring'
    );
  }

  private isEasingConfig(value: unknown): value is EasingConfig {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as EasingConfig).type === 'easing'
    );
  }

  private isActionConfig(value: unknown): value is ActionConfig {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as ActionConfig).type === 'action'
    );
  }

  private isSelectConfig(value: unknown): value is SelectConfig {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as SelectConfig).type === 'select' &&
      'options' in value &&
      Array.isArray((value as SelectConfig).options)
    );
  }

  private isColorConfig(value: unknown): value is ColorConfig {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as ColorConfig).type === 'color'
    );
  }

  private isTextConfig(value: unknown): value is TextConfig {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as TextConfig).type === 'text'
    );
  }

  private isHexColor(value: string): boolean {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
  }

  private formatLabel(key: string): string {
    // Convert camelCase to Title Case
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private inferRange(value: number): { min: number; max: number; step: number } {
    // Infer reasonable range based on value
    if (value >= 0 && value <= 1) {
      return { min: 0, max: 1, step: 0.01 };
    } else if (value >= 0 && value <= 10) {
      return { min: 0, max: value * 3 || 10, step: 0.1 };
    } else if (value >= 0 && value <= 100) {
      return { min: 0, max: value * 3 || 100, step: 1 };
    } else if (value >= 0) {
      return { min: 0, max: value * 3 || 1000, step: 10 };
    } else {
      return { min: value * 3, max: -value * 3, step: 1 };
    }
  }

  private inferStep(min: number, max: number): number {
    const range = max - min;
    if (range <= 1) return 0.01;
    if (range <= 10) return 0.1;
    if (range <= 100) return 1;
    return 10;
  }

  private normalizePreservedValue(
    existingValue: DialValue | undefined,
    defaultValue: DialValue,
    control: ControlMeta | undefined
  ): DialValue {
    if (existingValue === undefined || !control) {
      return defaultValue;
    }

    switch (control.type) {
      case 'slider': {
        if (typeof existingValue !== 'number' || typeof defaultValue !== 'number') {
          return defaultValue;
        }

        const min = control.min ?? Number.NEGATIVE_INFINITY;
        const max = control.max ?? Number.POSITIVE_INFINITY;
        const clamped = Math.min(max, Math.max(min, existingValue));

        if (typeof control.step !== 'number' || control.step <= 0) {
          return clamped;
        }

        return this.roundToStep(clamped, min, max, control.step);
      }
      case 'toggle':
        return typeof existingValue === 'boolean' ? existingValue : defaultValue;
      case 'select': {
        if (typeof existingValue !== 'string') {
          return defaultValue;
        }

        const options = control.options ?? [];
        const validValues = new Set(options.map((option) => (typeof option === 'string' ? option : option.value)));
        return validValues.has(existingValue) ? existingValue : defaultValue;
      }
      case 'color':
      case 'text':
        return typeof existingValue === 'string' ? existingValue : defaultValue;
      case 'transition':
        if (this.isSpringConfig(defaultValue)) {
          return this.isSpringConfig(existingValue) ? existingValue : defaultValue;
        }
        if (this.isEasingConfig(defaultValue)) {
          return this.isEasingConfig(existingValue) ? existingValue : defaultValue;
        }
        return defaultValue;
      case 'action':
        return defaultValue;
      default:
        return defaultValue;
    }
  }

  private roundToStep(value: number, min: number, max: number, step: number): number {
    const snapped = min + Math.round((value - min) / step) * step;
    const clamped = Math.min(max, Math.max(min, snapped));
    const precision = this.stepPrecision(step);
    return Number(clamped.toFixed(precision));
  }

  private stepPrecision(step: number): number {
    const text = String(step);
    const decimalIndex = text.indexOf('.');
    return decimalIndex === -1 ? 0 : text.length - decimalIndex - 1;
  }

  private mapControlsByPath(controls: ControlMeta[]): Map<string, ControlMeta> {
    const map = new Map<string, ControlMeta>();

    const visit = (nodes: ControlMeta[]) => {
      for (const node of nodes) {
        if (node.type === 'folder' && node.children) {
          visit(node.children);
          continue;
        }

        map.set(node.path, node);
      }
    };

    visit(controls);
    return map;
  }

  // ─── Conditional visibility ──────────────────────────────────────

  /**
   * Detects and unwraps a `{ value, visibleWhen }` wrapper produced by
   * {@link withVisibility}. Returns the inner control plus the rule (or
   * `undefined` for `visibleWhen` if the input was not a wrapper).
   */
  private unwrapVisibilityWithRule(raw: unknown): { value: DialConfigValue; visibleWhen: VisibleWhen | undefined } {
    if (
      typeof raw === 'object' &&
      raw !== null &&
      !Array.isArray(raw) &&
      'value' in raw &&
      'visibleWhen' in raw
    ) {
      const wrapper = raw as ControlWithVisibility;
      return { value: wrapper.value, visibleWhen: wrapper.visibleWhen };
    }
    return { value: raw as DialConfigValue, visibleWhen: undefined };
  }

  /** Evaluate a visibility rule against a flat value map. */
  private isVisible(rule: VisibleWhen | undefined, values: Record<string, DialValue>): boolean {
    if (!rule) return true;
    const actual = values[rule.field];
    if (actual === undefined && !(rule.field in values)) {
      // Dev-mode warning for mistyped field paths. Guarded by typeof check
      // so it's safe in environments without process (bundlers strip this).
      if (typeof globalThis !== 'undefined' && typeof console !== 'undefined') {
        console.warn(
          `[DialKit] visibleWhen references field "${rule.field}" which does not exist in the panel's values. ` +
          `The control will default to visible. Check for typos — field must be the full dot-delimited store path.`
        );
      }
    }
    if (rule.is !== undefined) {
      const targets = Array.isArray(rule.is) ? rule.is : [rule.is];
      return targets.some(t => t === actual);
    }
    if (rule.not !== undefined) {
      const targets = Array.isArray(rule.not) ? rule.not : [rule.not];
      return !targets.some(t => t === actual);
    }
    return true;
  }

  /**
   * Recursively filter a control tree by evaluating each control's
   * `visibleWhen` against the current values. Folders that become empty
   * after filtering their children are pruned.
   *
   * KNOWN LIMITATION — folder collapsed state across hide/show cycles:
   * Folder open/closed state lives in `Folder`'s local `useState`, not in
   * the store. When a folder's `visibleWhen` fails, its DOM node unmounts
   * and that local state is lost. Re-showing the folder mounts a fresh
   * instance with `defaultOpen`, so a user-collapsed folder will re-open
   * after a visibility cycle. Sibling visibility changes do NOT trigger
   * this (motion.div keys are stable by path), only the wrapped folder
   * itself hiding. This is a pre-existing architectural constraint of
   * DialKit's folder state model, not introduced by this feature — any
   * mechanism that unmounts a folder would behave the same. Lifting
   * folder state into the store is a possible follow-up.
   */
  private filterByVisibility(controls: ControlMeta[], values: Record<string, DialValue>): ControlMeta[] {
    const result: ControlMeta[] = [];
    for (const control of controls) {
      if (!this.isVisible(control.visibleWhen, values)) continue;

      if (control.type === 'folder' && control.children) {
        const filteredChildren = this.filterByVisibility(control.children, values);
        if (filteredChildren.length === 0) continue;
        result.push({ ...control, children: filteredChildren });
      } else {
        result.push(control);
      }
    }
    return result;
  }

  /**
   * Cheap structural comparison used to decide whether visibility flipped
   * after an updateValue. We only care about the set of visible paths —
   * labels/options/etc can't change between snapshots of the same tree.
   */
  private sameControlPaths(a: ControlMeta[], b: ControlMeta[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const ca = a[i];
      const cb = b[i];
      if (ca.path !== cb.path || ca.type !== cb.type) return false;
      if (ca.type === 'folder') {
        const childrenA = ca.children ?? [];
        const childrenB = cb.children ?? [];
        if (!this.sameControlPaths(childrenA, childrenB)) return false;
      }
    }
    return true;
  }

}

// Singleton instance
export const DialStore = new DialStoreClass();
