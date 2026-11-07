import { callListeners, pageSingleton, warnOnce } from './shared';

type Listener = () => void;

type VisibilityController = {
  visible?: boolean;
  defaultVisible: boolean;
  onVisibilityChange?: (visible: boolean) => void;
};

/**
 * UI-only state shared by the toolkit root and the timeline portal.
 * Playback deliberately lives elsewhere: hiding the editor must never pause
 * or otherwise change the animation it is inspecting.
 */
class TimelineUiStoreClass {
  private visible = true;
  private initialized = false;
  private controllers = new Map<symbol, VisibilityController>();
  private listeners = new Set<Listener>();

  getVisible(): boolean {
    for (const controller of this.controllers.values()) {
      if (controller.visible !== undefined) return controller.visible;
    }
    return this.visible;
  }

  /** Whether a dock is mounted to show the timelines. */
  hasDock(): boolean {
    return this.controllers.size > 0;
  }

  registerController(id: symbol, controller: VisibilityController): () => void {
    if (this.controllers.size > 0) {
      warnOnce('More than one DialTimeline is mounted. One dock shows every registered timeline.');
    }
    if (!this.initialized) {
      this.visible = controller.defaultVisible;
      this.initialized = true;
    }
    this.controllers.set(id, controller);
    this.notify();

    return () => {
      this.controllers.delete(id);
      if (this.controllers.size === 0) this.initialized = false;
      this.notify();
    };
  }

  updateController(id: symbol, controller: VisibilityController): void {
    if (!this.controllers.has(id)) return;
    const previous = this.getVisible();
    this.controllers.set(id, controller);
    if (previous !== this.getVisible()) this.notify();
  }

  requestVisible(visible: boolean): void {
    const current = this.getVisible();
    if (current === visible) return;

    const controlled = Array.from(this.controllers.values()).filter(
      (controller) => controller.visible !== undefined
    );
    if (controlled.length > 0) {
      controlled.forEach((controller) => controller.onVisibilityChange?.(visible));
      return;
    }

    this.visible = visible;
    this.controllers.forEach((controller) => controller.onVisibilityChange?.(visible));
    this.notify();
  }

  toggle(): void {
    this.requestVisible(!this.getVisible());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    callListeners(this.listeners);
  }
}

export const TimelineUiStore = /* @__PURE__ */ pageSingleton('TimelineUiStore', () => new TimelineUiStoreClass());
