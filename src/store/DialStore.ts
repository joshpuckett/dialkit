// Lightweight state store with subscriptions for dialkit

export type SpringConfig = {
  type: 'spring';
  stiffness?: number;
  damping?: number;
  mass?: number;
  visualDuration?: number;
  bounce?: number;
};

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

export type MonitorConfig = {
  type: 'monitor';
  defaultValue?: string | number | boolean;
};

export type DialValue = number | boolean | string | SpringConfig | ActionConfig | SelectConfig | ColorConfig | TextConfig | MonitorConfig;

export type DialConfig = {
  [key: string]: DialValue | [number, number, number] | DialConfig;
};

export type ResolvedValues<T extends DialConfig> = {
  [K in keyof T]: T[K] extends [number, number, number]
  ? number
  : T[K] extends SpringConfig
  ? SpringConfig
  : T[K] extends SelectConfig
  ? string
  : T[K] extends ColorConfig
  ? string
  : T[K] extends TextConfig
  ? string
  : T[K] extends MonitorConfig
  ? string | number | boolean | undefined
  : T[K] extends DialConfig
  ? ResolvedValues<T[K]>
  : T[K];
};

export type ControlMeta = {
  type: 'slider' | 'toggle' | 'spring' | 'folder' | 'action' | 'select' | 'color' | 'text' | 'monitor';
  path: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  children?: ControlMeta[];
  options?: (string | { value: string; label: string })[];
  placeholder?: string;
};

export type PanelConfig = {
  id: string;
  name: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
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
  // Per-path subscriptions for granular re-renders
  private pathListeners: Map<string, Set<Listener>> = new Map();
  private pathSnapshots: Map<string, DialValue | undefined> = new Map();
  // Preset subscriptions — separate from value updates
  private presetListeners: Map<string, Set<Listener>> = new Map();
  private presetSnapshots: Map<string, { presets: Preset[]; activeId: string | null }> = new Map();

  registerPanel(id: string, name: string, config: DialConfig): void {
    const controls = this.parseConfig(config, '');
    const values = this.flattenValues(config, '');

    this.panels.set(id, { id, name, controls, values });
    this.snapshots.set(id, { ...values });
    this.baseValues.set(id, { ...values });
    this.notifyGlobal();
  }

  unregisterPanel(id: string): void {
    this.panels.delete(id);
    this.listeners.delete(id);
    this.snapshots.delete(id);
    // Clean up per-path subscriptions
    for (const key of this.pathListeners.keys()) {
      if (key.startsWith(`${id}:`)) {
        this.pathListeners.delete(key);
        this.pathSnapshots.delete(key);
      }
    }
    this.presetListeners.delete(id);
    this.presetSnapshots.delete(id);
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
    // Update per-path snapshot and notify path listeners
    const pathKey = `${panelId}:${path}`;
    this.pathSnapshots.set(pathKey, value);
    this.notifyPath(pathKey);
    this.notify(panelId);
  }

  updateSpringMode(panelId: string, path: string, mode: 'simple' | 'advanced'): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    // Store the mode preference
    panel.values[`${path}.__mode`] = mode;
    // Create a new snapshot reference
    this.snapshots.set(panelId, { ...panel.values });
    this.notify(panelId);
  }

  getSpringMode(panelId: string, path: string): 'simple' | 'advanced' {
    const panel = this.panels.get(panelId);
    if (!panel) return 'simple';
    return (panel.values[`${path}.__mode`] as 'simple' | 'advanced') || 'simple';
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

  subscribePath(panelId: string, path: string, listener: Listener): () => void {
    const key = `${panelId}:${path}`;
    if (!this.pathListeners.has(key)) {
      this.pathListeners.set(key, new Set());
    }
    this.pathListeners.get(key)!.add(listener);
    return () => {
      this.pathListeners.get(key)?.delete(listener);
    };
  }

  getValueSnapshot(panelId: string, path: string): DialValue | undefined {
    const key = `${panelId}:${path}`;
    if (this.pathSnapshots.has(key)) {
      return this.pathSnapshots.get(key);
    }
    // Initialize from panel values
    const panel = this.panels.get(panelId);
    return panel?.values[path];
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
    this.presetSnapshots.set(panelId, {
      presets: [...(this.presets.get(panelId) ?? [])],
      activeId: id,
    });
    this.notify(panelId);
    this.notifyPresets(panelId);

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
    this.presetSnapshots.set(panelId, {
      presets: [...(this.presets.get(panelId) ?? [])],
      activeId: presetId,
    });
    this.notifyAllPaths(panelId);
    this.notify(panelId);
    this.notifyPresets(panelId);
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
    this.presetSnapshots.set(panelId, {
      presets: [...(this.presets.get(panelId) ?? [])],
      activeId: this.activePreset.get(panelId) ?? null,
    });
    this.notify(panelId);
    this.notifyPresets(panelId);
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
    }
    this.activePreset.set(panelId, null);
    this.presetSnapshots.set(panelId, {
      presets: [...(this.presets.get(panelId) ?? [])],
      activeId: null,
    });
    this.notifyAllPaths(panelId);
    this.notify(panelId);
    this.notifyPresets(panelId);
  }

  subscribePresets(panelId: string, listener: Listener): () => void {
    if (!this.presetListeners.has(panelId)) {
      this.presetListeners.set(panelId, new Set());
    }
    this.presetListeners.get(panelId)!.add(listener);
    return () => {
      this.presetListeners.get(panelId)?.delete(listener);
    };
  }

  getPresetSnapshot(panelId: string): { presets: Preset[]; activeId: string | null } {
    if (!this.presetSnapshots.has(panelId)) {
      // Initialize and cache — must return stable reference for useSyncExternalStore
      this.presetSnapshots.set(panelId, {
        presets: this.presets.get(panelId) ?? [],
        activeId: this.activePreset.get(panelId) ?? null,
      });
    }
    return this.presetSnapshots.get(panelId)!;
  }

  private notify(panelId: string): void {
    this.listeners.get(panelId)?.forEach(fn => fn());
  }

  private notifyPath(pathKey: string): void {
    this.pathListeners.get(pathKey)?.forEach(fn => fn());
  }

  private notifyGlobal(): void {
    this.globalListeners.forEach(fn => fn());
  }

  private notifyPresets(panelId: string): void {
    this.presetListeners.get(panelId)?.forEach(fn => fn());
  }

  // Notify all per-path listeners for a panel (used when all values change at once, e.g. preset load)
  private notifyAllPaths(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    const prefix = `${panelId}:`;
    for (const key of this.pathListeners.keys()) {
      if (key.startsWith(prefix)) {
        const path = key.slice(prefix.length);
        this.pathSnapshots.set(key, panel.values[path]);
        this.pathListeners.get(key)?.forEach(fn => fn());
      }
    }
  }

  private parseConfig(config: DialConfig, prefix: string): ControlMeta[] {
    const controls: ControlMeta[] = [];

    for (const [key, value] of Object.entries(config)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const label = this.formatLabel(key);

      if (Array.isArray(value) && value.length === 3 && typeof value[0] === 'number') {
        // Range tuple: [default, min, max]
        controls.push({
          type: 'slider',
          path,
          label,
          min: value[1],
          max: value[2],
          step: this.inferStep(value[1], value[2]),
        });
      } else if (typeof value === 'number') {
        // Single number - auto-infer range
        const { min, max, step } = this.inferRange(value);
        controls.push({ type: 'slider', path, label, min, max, step });
      } else if (typeof value === 'boolean') {
        controls.push({ type: 'toggle', path, label });
      } else if (this.isSpringConfig(value)) {
        controls.push({ type: 'spring', path, label });
      } else if (this.isActionConfig(value)) {
        controls.push({ type: 'action', path, label: (value as ActionConfig).label || label });
      } else if (this.isSelectConfig(value)) {
        controls.push({ type: 'select', path, label, options: value.options });
      } else if (this.isColorConfig(value)) {
        controls.push({ type: 'color', path, label });
      } else if (this.isTextConfig(value)) {
        controls.push({ type: 'text', path, label, placeholder: value.placeholder });
      } else if (this.isMonitorConfig(value)) {
        controls.push({ type: 'monitor', path, label });
      } else if (typeof value === 'string') {
        // Auto-detect: hex color vs text
        if (this.isHexColor(value)) {
          controls.push({ type: 'color', path, label });
        } else {
          controls.push({ type: 'text', path, label });
        }
      } else if (typeof value === 'object' && value !== null) {
        // Nested object becomes a folder
        controls.push({
          type: 'folder',
          path,
          label,
          children: this.parseConfig(value as DialConfig, path),
        });
      }
    }

    return controls;
  }

  private flattenValues(config: DialConfig, prefix: string): Record<string, DialValue> {
    const values: Record<string, DialValue> = {};

    for (const [key, value] of Object.entries(config)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value) && value.length === 3 && typeof value[0] === 'number') {
        values[path] = value[0]; // Default value
      } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        values[path] = value;
      } else if (this.isSpringConfig(value)) {
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
      } else if (this.isMonitorConfig(value)) {
        // Monitor fields use default if provided
        if (value.defaultValue !== undefined) {
          values[path] = value.defaultValue;
        }
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

  private isMonitorConfig(value: unknown): value is MonitorConfig {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      (value as MonitorConfig).type === 'monitor'
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
}

// Singleton instance
export const DialStore = new DialStoreClass();
