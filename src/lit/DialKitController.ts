import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { DialStore, flattenDialValueUpdates, resolveDialValues } from '../store/DialStore';
import type { DialConfig, DialKitPersistOptions, DialKitValueUpdates, DialStorePanelOptions, DialValue, ResolvedValues, ShortcutConfig } from '../store/DialStore';
export interface CreateDialOptions {
  id?: string;
  defaultCollapsed?: boolean;
  persist?: DialKitPersistOptions;
  onAction?: (action: string) => void;
  shortcuts?: Record<string, ShortcutConfig>;
}
let nextId = 0;
/**
 * A panel bound to a Lit host. The panel is registered while the host is connected,
 * and every store change requests a host update, so `values` can be read in `render()`.
 */
export class DialKitController<T extends DialConfig> implements ReactiveController {
  readonly id: string;
  private config: T;
  private connected = false;
  private stopValues?: () => void;
  private stopActions?: () => void;
  private cacheKey?: Record<string, DialValue>;
  private cache?: ResolvedValues<T>;
  private readonly registration: DialStorePanelOptions;
  constructor(private readonly host: ReactiveControllerHost, private readonly name: string, config: T, private readonly options: CreateDialOptions = {}) {
    this.config = config;
    this.id = options.id ?? `lit-${name}-${++nextId}`;
    this.registration = { retainOnUnmount: options.id !== undefined, persist: options.persist, defaultCollapsed: options.defaultCollapsed };
    // Lit calls hostConnected() right away when the host is already connected.
    host.addController(this);
  }
  hostConnected() {
    if (this.connected)
      return;
    // A rejected config throws here and acquires nothing, so the controller stays disconnected.
    DialStore.registerPanel(this.id, this.name, this.config, this.options.shortcuts, this.registration);
    this.connected = true;
    this.stopValues = DialStore.subscribe(this.id, () => this.host.requestUpdate());
    this.stopActions = DialStore.subscribeActions(this.id, action => this.options.onAction?.(action));
    // Retained or persisted values may differ from the defaults rendered before connecting.
    this.host.requestUpdate();
  }
  hostDisconnected() {
    if (!this.connected)
      return;
    this.connected = false;
    this.stopValues?.();
    this.stopActions?.();
    this.stopValues = this.stopActions = undefined;
    DialStore.unregisterPanel(this.id);
  }
  /** Resolved values, cached until the store publishes a new snapshot. */
  get values(): ResolvedValues<T> {
    const flat = DialStore.getValues(this.id);
    if (!this.cache || flat !== this.cacheKey) {
      this.cacheKey = flat;
      this.cache = resolveDialValues(this.config, flat);
    }
    return this.cache;
  }
  getValues(): ResolvedValues<T> {
    return this.values;
  }
  setValue(path: string, value: DialValue) {
    DialStore.updateValue(this.id, path, value);
  }
  setValues(values: DialKitValueUpdates<T>) {
    DialStore.updateValues(this.id, flattenDialValueUpdates(this.config, values));
  }
  resetValues() {
    DialStore.resetValues(this.id);
  }
  setOpen(open: boolean) {
    DialStore.setPanelOpen(this.id, open);
  }
  getOpen() {
    return DialStore.getPanelOpen(this.id);
  }
  /** Reconcile new definitions while retaining compatible edits. */
  updateConfig(next: T) {
    this.config = next;
    this.cache = undefined;
    if (this.connected)
      DialStore.updatePanel(this.id, this.name, next, this.options.shortcuts, this.registration);
    this.host.requestUpdate();
  }
}
export function createDialKit<T extends DialConfig>(host: ReactiveControllerHost, name: string, config: T, options?: CreateDialOptions): DialKitController<T> {
  return new DialKitController(host, name, config, options);
}
export const createDialKitController = createDialKit;
