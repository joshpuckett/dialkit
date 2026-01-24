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

export type DialValue = number | boolean | string | SpringConfig | ActionConfig;

export type DialConfig = {
  [key: string]: DialValue | [number, number, number] | DialConfig;
};

export type ResolvedValues<T extends DialConfig> = {
  [K in keyof T]: T[K] extends [number, number, number]
    ? number
    : T[K] extends SpringConfig
      ? SpringConfig
      : T[K] extends DialConfig
        ? ResolvedValues<T[K]>
        : T[K];
};

export type ControlMeta = {
  type: 'slider' | 'toggle' | 'spring' | 'folder' | 'action';
  path: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  children?: ControlMeta[];
};

export type PanelConfig = {
  id: string;
  name: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
};

type Listener = () => void;
type ActionListener = (action: string) => void;

// Stable empty object for unregistered panels (React 19 useSyncExternalStore requirement)
const EMPTY_VALUES: Record<string, DialValue> = Object.freeze({});

class DialStoreClass {
  private panels: Map<string, PanelConfig> = new Map();
  private listeners: Map<string, Set<Listener>> = new Map();
  private globalListeners: Set<Listener> = new Set();
  private snapshots: Map<string, Record<string, DialValue>> = new Map();
  private actionListeners: Map<string, Set<ActionListener>> = new Map();

  registerPanel(id: string, name: string, config: DialConfig): void {
    const controls = this.parseConfig(config, '');
    const values = this.flattenValues(config, '');

    this.panels.set(id, { id, name, controls, values });
    this.snapshots.set(id, { ...values });
    this.notifyGlobal();
  }

  unregisterPanel(id: string): void {
    this.panels.delete(id);
    this.listeners.delete(id);
    this.snapshots.delete(id);
    this.notifyGlobal();
  }

  updateValue(panelId: string, path: string, value: DialValue): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.values[path] = value;
    // Create a new snapshot reference so useSyncExternalStore detects the change
    this.snapshots.set(panelId, { ...panel.values });
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

  private notify(panelId: string): void {
    this.listeners.get(panelId)?.forEach(fn => fn());
  }

  private notifyGlobal(): void {
    this.globalListeners.forEach(fn => fn());
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
      return { min: 0, max: value * 2 || 10, step: 0.1 };
    } else if (value >= 0 && value <= 100) {
      return { min: 0, max: value * 2 || 100, step: 1 };
    } else if (value >= 0) {
      return { min: 0, max: value * 2 || 1000, step: 10 };
    } else {
      return { min: value * 2, max: -value * 2, step: 1 };
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
