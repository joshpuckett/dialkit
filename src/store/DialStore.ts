// Lightweight state store with subscriptions for dialkit

declare const process: { env?: { NODE_ENV?: string } } | undefined;
declare global {
  interface ImportMeta {
    env?: { MODE?: string; DEV?: boolean };
  }
}

export function isDevEnvironment(): boolean {
  try {
    // import.meta.env.MODE is used by Vite/ESM bundlers (works in dev server)
    // process.env.NODE_ENV is used by Webpack/CJS/Node (replaced at build time)
    // Same dual-check pattern as Zustand devtools
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env.MODE !== 'production';
    }
    return typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

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
          : T[K] extends ColorConfig
            ? string
            : T[K] extends TextConfig
              ? string
              : T[K] extends DialConfig
                ? ResolvedValues<T[K]>
                : T[K];
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

// Stable empty references for useSyncExternalStore (React 19 requirement)
const EMPTY_VALUES: Record<string, DialValue> = Object.freeze({});
const EMPTY_PANELS: PanelConfig[] = [];

class DialStoreClass {
  private panels: Map<string, PanelConfig> = new Map();
  private listeners: Map<string, Set<Listener>> = new Map();
  private globalListeners: Set<Listener> = new Set();
  private snapshots: Map<string, Record<string, DialValue>> = new Map();
  private actionListeners: Map<string, Set<ActionListener>> = new Map();
  private presets: Map<string, Preset[]> = new Map();
  private activePreset: Map<string, string | null> = new Map();
  private baseValues: Map<string, Record<string, DialValue>> = new Map();
  private panelsSnapshot: PanelConfig[] = EMPTY_PANELS;
  private enabled: boolean = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    if (this.enabled === value) return;
    this.enabled = value;

    if (!value) {
      // Notify per-panel listeners first so useSyncExternalStore detects the change
      for (const panelId of this.panels.keys()) {
        this.notify(panelId);
      }
      // Then clear all panels
      const panelIds = Array.from(this.panels.keys());
      for (const id of panelIds) {
        this.panels.delete(id);
        this.listeners.delete(id);
        this.snapshots.delete(id);
        this.actionListeners.delete(id);
        this.baseValues.delete(id);
      }
      this.presets.clear();
      this.activePreset.clear();
      // Then notify global listeners
      this.notifyGlobal();
    }
  }

  registerPanel(id: string, name: string, config: DialConfig): void {
    if (!this.enabled) return;
    const controls = this.parseConfig(config, '');
    const values = this.flattenValues(config, '');

    // Set initial transition modes based on config types
    this.initTransitionModes(config, '', values);

    this.panels.set(id, { id, name, controls, values });
    this.snapshots.set(id, { ...values });
    this.baseValues.set(id, { ...values });
    this.notifyGlobal();
  }

  updatePanel(id: string, name: string, config: DialConfig): void {
    if (!this.enabled) return;
    const existing = this.panels.get(id);
    if (!existing) {
      this.registerPanel(id, name, config);
      return;
    }

    const controls = this.parseConfig(config, '');
    const controlsByPath = this.mapControlsByPath(controls);
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

    const nextPanel: PanelConfig = { id, name, controls, values: nextValues };
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

    panel.values[`${path}.__mode`] = mode;
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
    return this.panelsSnapshot;
  }

  getPanel(id: string): PanelConfig | undefined {
    return this.panels.get(id);
  }

  subscribe(panelId: string, listener: Listener): () => void {
    if (!this.enabled) return () => {};
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
    if (!this.enabled) return () => {};
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
    }
    this.activePreset.set(panelId, null);
    this.notify(panelId);
  }

  private notify(panelId: string): void {
    this.listeners.get(panelId)?.forEach(fn => fn());
  }

  private notifyGlobal(): void {
    this.panelsSnapshot = this.panels.size > 0 ? Array.from(this.panels.values()) : EMPTY_PANELS;
    this.globalListeners.forEach(fn => fn());
  }

  private initTransitionModes(config: DialConfig, prefix: string, values: Record<string, DialValue>): void {
    for (const [key, value] of Object.entries(config)) {
      if (key === '_collapsed') continue;
      const path = prefix ? `${prefix}.${key}` : key;

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

  private parseConfig(config: DialConfig, prefix: string): ControlMeta[] {
    const controls: ControlMeta[] = [];

    for (const [key, value] of Object.entries(config)) {
      if (key === '_collapsed') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const label = this.formatLabel(key);

      if (Array.isArray(value) && value.length <= 4 && typeof value[0] === 'number') {
        // Range tuple: [default, min, max]
        controls.push({
          type: 'slider',
          path,
          label,
          min: value[1],
          max: value[2],
          step: value[3] ?? this.inferStep(value[1], value[2]),
        });
      } else if (typeof value === 'number') {
        // Single number - auto-infer range
        const { min, max, step } = this.inferRange(value);
        controls.push({ type: 'slider', path, label, min, max, step });
      } else if (typeof value === 'boolean') {
        controls.push({ type: 'toggle', path, label });
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
          children: this.parseConfig(folderConfig, path),
        });
      }
    }

    return controls;
  }

  private flattenValues(config: DialConfig, prefix: string): Record<string, DialValue> {
    const values: Record<string, DialValue> = {};

    for (const [key, value] of Object.entries(config)) {
      if (key === '_collapsed') continue;
      const path = prefix ? `${prefix}.${key}` : key;

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

}

// Singleton instance
export const DialStore = /*#__PURE__*/ new DialStoreClass();
