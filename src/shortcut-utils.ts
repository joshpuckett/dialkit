// Shared shortcut utilities — single source of truth across all framework adapters.

import { DialStore } from './store/DialStore';
import type { ControlMeta, ShortcutConfig } from './store/DialStore';
import { callListeners, pageSingleton } from './store/shared';

// ── Math helpers ──

export { decimalsForStep, roundValue } from './numeric';

export function getEffectiveStep(control: ControlMeta, shortcut: ShortcutConfig): number {
  const range = (control.max ?? 1) - (control.min ?? 0);
  const step = control.step ?? 1;
  const mode = shortcut.mode ?? 'normal';
  // Never finer than the slider's own step: the store snaps writes to it.
  return mode === 'fine' ? Math.max(step, range * 0.01)
    : mode === 'coarse' ? Math.max(step, range * 0.1)
    : step;
}

export function applySliderDelta(
  panelId: string,
  path: string,
  control: ControlMeta,
  effectiveStep: number,
  direction: number
): void {
  const currentValue = DialStore.getValue(panelId, path);
  if (typeof currentValue !== 'number') return;
  DialStore.updateValue(panelId, path, currentValue + direction * effectiveStep);
}

export function snapToDecile(rawValue: number, min: number, max: number): number {
  const normalized = (rawValue - min) / (max - min);
  const nearest = Math.round(normalized * 10) / 10;
  if (Math.abs(normalized - nearest) <= 0.03125) {
    return min + nearest * (max - min);
  }
  return rawValue;
}

// ── DOM helpers ──

/** Typing owns the keyboard and the pointer. */
export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true;
}

const CONTROL_SELECTOR = 'button, [role="slider"], [role="radio"], [role="listbox"], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="button"], [role="separator"]';
const CONTROL_KEYS = new Set(['Enter', ' ', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/** A focused control keeps the keys it acts on; every other key is free for shortcuts. */
function focusedControlUsesKey(key: string): boolean {
  return CONTROL_KEYS.has(key) && document.activeElement?.closest(CONTROL_SELECTOR) != null;
}

/** Exactly one declared modifier, or a value no shortcut declares when Ctrl or a
 * combination is held, so Ctrl+K never fires a plain K shortcut. */
export function getActiveModifier(e: KeyboardEvent | WheelEvent | MouseEvent): string | undefined {
  const held = [e.altKey && 'alt', e.shiftKey && 'shift', e.metaKey && 'meta', e.ctrlKey && 'ctrl'].filter(Boolean);
  if (held.length === 0) return undefined;
  return held.length === 1 && held[0] !== 'ctrl' ? held[0] as string : 'other';
}

export function findControl(controls: ControlMeta[], path: string): ControlMeta | null {
  for (const control of controls) {
    if (control.path === path) return control;
    if (control.type === 'folder' && control.children) {
      const found = findControl(control.children, path);
      if (found) return found;
    }
  }
  return null;
}

export const DRAG_SENSITIVITY = 4;

// ── Formatting helpers ──

export function formatInteractionLabel(interaction: string): string {
  switch (interaction) {
    case 'drag': return 'Drag';
    case 'move': return 'Move';
    case 'scroll-only': return 'Scroll';
    default: return 'Scroll';
  }
}

export function formatSliderShortcut(sc: ShortcutConfig): string {
  const interaction = sc.interaction ?? 'scroll';
  const actionLabel = formatInteractionLabel(interaction);
  if (!sc.key) return actionLabel;
  const mod = formatModifier(sc.modifier);
  return `${mod}${sc.key.toUpperCase()}+${actionLabel}`;
}

export function formatToggleShortcut(sc: ShortcutConfig): string {
  if (!sc.key) return 'Press';
  const mod = formatModifier(sc.modifier);
  return `${mod}${sc.key.toUpperCase()}`;
}

function formatModifier(modifier?: string): string {
  return modifier === 'alt' ? '\u2325'
    : modifier === 'shift' ? '\u21E7'
    : modifier === 'meta' ? '\u2318'
    : '';
}

// ── Listener ──

export type ActiveShortcut = {
  panelId: string;
  path: string;
} | null;

type ShortcutState = {
  users: number;
  stop?: () => void;
  active: ActiveShortcut;
  listeners: Set<(target: ActiveShortcut) => void>;
};

const shortcutState = /* @__PURE__ */ pageSingleton<ShortcutState>('Shortcuts', () => ({
  users: 0,
  active: null,
  listeners: new Set(),
}));

export function subscribeShortcut(listener: (target: ActiveShortcut) => void): () => void {
  shortcutState.listeners.add(listener);
  listener(shortcutState.active);
  return () => {
    shortcutState.listeners.delete(listener);
  };
}

function setActiveShortcut(target: ActiveShortcut): void {
  const { active } = shortcutState;
  if (active?.panelId === target?.panelId && active?.path === target?.path) return;
  shortcutState.active = target;
  callListeners(shortcutState.listeners, target);
}

/** Roots share one set of window listeners, so a second root never doubles a shortcut. */
export function mountShortcutListener(): { destroy: () => void } {
  if (shortcutState.users++ === 0) shortcutState.stop = listenForShortcuts();
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (--shortcutState.users === 0) {
        shortcutState.stop?.();
        shortcutState.stop = undefined;
      }
    },
  };
}

/** The key a shortcut names. Option and Shift rewrite `event.key` (Option+B is "∫",
 * Shift+1 is "!"), so with those held, letters and digits are read by position. */
function shortcutKeyOf(event: KeyboardEvent): string {
  if (event.altKey || event.shiftKey) {
    const match = /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code);
    if (match) return (match[1] ?? match[2]).toLowerCase();
  }
  return event.key.toLowerCase();
}

function isShortcutKey(key: string): boolean {
  return DialStore.getPanels().some((panel) =>
    Object.values(panel.shortcuts).some((shortcut) => shortcut.key?.toLowerCase() === key));
}

function listenForShortcuts(): () => void {
  // Physical key to the shortcut key it pressed: its keyup can report a different
  // `key` when a modifier changed in between.
  const held = new Map<string, string>();
  let dragging = false;
  let lastX: number | undefined;
  let accumulator = 0;

  const sliderTarget = (modifier: string | undefined, ...interactions: string[]) => {
    for (const key of held.values()) {
      const target = DialStore.resolveShortcutTarget(key, modifier);
      if (target?.control.type === 'slider' && interactions.includes(target.control.shortcut?.interaction ?? 'scroll')) {
        return target;
      }
    }
    return null;
  };
  const nudge = (target: NonNullable<ReturnType<typeof sliderTarget>>, direction: number) => {
    applySliderDelta(target.panelId, target.path, target.control, getEffectiveStep(target.control, target.control.shortcut!), direction);
  };
  const resetMouse = () => {
    dragging = false;
    lastX = undefined;
    accumulator = 0;
  };
  const refreshActive = (modifier: string | undefined) => {
    for (const key of held.values()) {
      const target = DialStore.resolveShortcutTarget(key, modifier);
      if (target) {
        setActiveShortcut({ panelId: target.panelId, path: target.path });
        return;
      }
    }
    setActiveShortcut(null);
  };

  const keydown = (event: KeyboardEvent) => {
    if (isInputFocused() || focusedControlUsesKey(event.key)) return;
    const modifier = getActiveModifier(event);
    if (event.key.startsWith('Arrow') && held.size) {
      const target = sliderTarget(modifier, 'scroll', 'drag', 'move');
      if (target) {
        event.preventDefault();
        nudge(target, event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1);
        return;
      }
    }
    const key = shortcutKeyOf(event);
    if (!isShortcutKey(key)) {
      refreshActive(modifier);
      return;
    }
    const physical = event.code || key;
    const wasHeld = held.has(physical);
    held.set(physical, key);
    refreshActive(modifier);
    const target = DialStore.resolveShortcutTarget(key, modifier);
    if (target?.control.type === 'toggle' && !wasHeld && !event.repeat) {
      DialStore.updateValue(target.panelId, target.path, !DialStore.getValue(target.panelId, target.path));
    }
    if (!wasHeld) {
      lastX = undefined;
      accumulator = 0;
    }
  };
  const keyup = (event: KeyboardEvent) => {
    held.delete(event.code || shortcutKeyOf(event));
    // macOS sends no keyup for keys pressed while Command is down.
    if (event.key === 'Meta' || event.key === 'OS') held.clear();
    const modifier = getActiveModifier(event);
    if (!sliderTarget(modifier, dragging ? 'drag' : 'move')) resetMouse();
    refreshActive(modifier);
  };
  const wheel = (event: WheelEvent) => {
    if (isInputFocused()) return;
    const target = sliderTarget(getActiveModifier(event), 'scroll')
      ?? DialStore.resolveScrollOnlyTargets().find((candidate) => candidate.control.type === 'slider');
    if (!target) return;
    event.preventDefault();
    nudge(target, event.deltaY > 0 ? -1 : 1);
  };
  const mousedown = (event: MouseEvent) => {
    if (event.button !== 0 || isInputFocused()) return;
    if (sliderTarget(getActiveModifier(event), 'drag')) {
      dragging = true;
      lastX = event.clientX;
      accumulator = 0;
      event.preventDefault();
    }
  };
  const mousemove = (event: MouseEvent) => {
    if (isInputFocused()) return;
    const target = sliderTarget(getActiveModifier(event), dragging ? 'drag' : 'move');
    if (!target) return;
    if (lastX === undefined) {
      lastX = event.clientX;
      return;
    }
    accumulator += event.clientX - lastX;
    lastX = event.clientX;
    const steps = Math.trunc(accumulator / DRAG_SENSITIVITY);
    if (steps) {
      accumulator -= steps * DRAG_SENSITIVITY;
      nudge(target, steps);
    }
  };
  const release = () => {
    held.clear();
    resetMouse();
    setActiveShortcut(null);
  };
  const visibility = () => {
    if (document.visibilityState === 'hidden') release();
  };

  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('mousedown', mousedown);
  window.addEventListener('mousemove', mousemove);
  window.addEventListener('mouseup', resetMouse);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('wheel', wheel);
    window.removeEventListener('mousedown', mousedown);
    window.removeEventListener('mousemove', mousemove);
    window.removeEventListener('mouseup', resetMouse);
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', visibility);
    release();
  };
}
