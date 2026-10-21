// One window-level listener for assigned shortcuts, shared by every adapter and root.

import { DialStore } from './store/DialStore';
import type { ControlMeta, ShortcutConfig } from './store/DialStore';
import {
  applySliderDelta,
  DRAG_SENSITIVITY,
  getActiveModifier,
  getEffectiveStep,
  getEventModifiers,
  getShortcutKeys,
  isModifierKey,
  isTextEntryFocused,
} from './shortcut-utils';

export type ActiveShortcut = {
  panelId: string;
  path: string;
} | null;

type Target = { panelId: string; path: string; control: ControlMeta; shortcut: ShortcutConfig };
type Interaction = NonNullable<ShortcutConfig['interaction']>;

/** Scroll distance, in pixels, for one step from a trackpad or smooth-scrolling wheel. */
export const WHEEL_STEP_DISTANCE = 50;
/** A pause this long (ms) between wheel events starts a new gesture. */
const WHEEL_GESTURE_GAP = 200;
const LINE_HEIGHT = 16;
const ARROW_DIRECTION: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

let users = 0;
let stop: (() => void) | undefined;
let active: ActiveShortcut = null;
const listeners = new Set<(target: ActiveShortcut) => void>();

export function subscribeShortcut(listener: (target: ActiveShortcut) => void) {
  listeners.add(listener);
  listener(active);
  return () => {
    listeners.delete(listener);
  };
}

function setActive(target: ActiveShortcut) {
  if (active?.panelId === target?.panelId && active?.path === target?.path) return;
  active = target ? { panelId: target.panelId, path: target.path } : null;
  listeners.forEach(listener => listener(active));
}

/** Roots share one listener, so mounting two editing surfaces never doubles a shortcut. */
export function mountShortcutListener() {
  if (typeof window === 'undefined') return { destroy() {} };
  if (users++ === 0) stop = listen();
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (--users === 0) {
        stop?.();
        stop = undefined;
      }
    },
  };
}

/** Wheel distance toward a larger value, using whichever axis the gesture mostly moved along. */
export function getWheelDistance(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>, pageHeight = 800): number {
  const scale = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? pageHeight : 1;
  const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
  return (horizontal ? event.deltaX : -event.deltaY) * scale;
}

/**
 * Steps for one wheel event. A notched wheel, a line- or page-based delta, or the
 * first event of a gesture moves one step; after that, small trackpad deltas
 * accumulate so a swipe moves a step every `WHEEL_STEP_DISTANCE` pixels.
 */
export function takeWheelSteps(accumulated: number, distance: number, discrete = false): { steps: number; remainder: number } {
  if (!distance) return { steps: 0, remainder: accumulated };
  if (discrete || Math.abs(distance) >= WHEEL_STEP_DISTANCE) return { steps: Math.sign(distance), remainder: 0 };
  const total = Math.sign(accumulated) === Math.sign(distance) ? accumulated + distance : distance;
  const steps = Math.trunc(total / WHEEL_STEP_DISTANCE) || 0;
  return { steps, remainder: total - steps * WHEEL_STEP_DISTANCE };
}

/**
 * Extra modifiers scale a held shortcut: Shift for ten steps, Option/Alt for a
 * tenth. Command and Control belong to the browser, so they cancel the adjustment.
 */
export function getShortcutStepScale(event: KeyboardEvent | WheelEvent | MouseEvent, shortcut: ShortcutConfig): number | undefined {
  const extra = getEventModifiers(event).filter(modifier => modifier !== shortcut.modifier);
  if (extra.includes('ctrl') || extra.includes('meta')) return undefined;
  if (extra.includes('shift')) return 10;
  if (extra.includes('alt')) return 0.1;
  return 1;
}

function isInsideDialKit(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element && !!target.closest('.dialkit-root');
}

function listen() {
  // Physical key (event.code) -> shortcut key, so a key released after its
  // modifier, or typed differently with a modifier, is still found and removed.
  const held = new Map<string, string>();
  let dragging = false;
  let lastX: number | undefined;
  let accumulator = 0;
  let wheelAccumulator = 0;
  let lastWheel = -Infinity;

  /** A held slider shortcut whose own modifier is also held. Exact modifier matches win. */
  const heldTarget = (event: KeyboardEvent | WheelEvent | MouseEvent, interactions: Interaction[]): Target | null => {
    const modifiers = getEventModifiers(event);
    let fallback: Target | null = null;
    for (const key of held.values()) {
      for (const target of DialStore.resolveShortcutTargets(key)) {
        if (target.control.type !== 'slider') continue;
        if (!interactions.includes(target.shortcut.interaction ?? 'scroll')) continue;
        if (target.shortcut.modifier && !modifiers.includes(target.shortcut.modifier)) continue;
        if (target.shortcut.modifier) return target;
        fallback ??= target;
      }
    }
    return fallback;
  };

  const exactTarget = (key: string, event: KeyboardEvent): Target | null => {
    const modifier = getActiveModifier(event);
    if (modifier === null) return null;
    const target = DialStore.resolveShortcutTarget(key, modifier);
    return target ? { ...target, shortcut: target.control.shortcut ?? {} } : null;
  };

  const adjust = (target: Target, scale: number, steps: number) => {
    applySliderDelta(target.panelId, target.path, target.control, getEffectiveStep(target.control, target.shortcut) * scale, steps);
  };

  const resetPointer = () => {
    dragging = false;
    lastX = undefined;
    accumulator = 0;
  };

  const refreshActive = (event: KeyboardEvent) => {
    for (const key of held.values()) {
      const target = exactTarget(key, event) ?? heldTarget(event, ['scroll', 'drag', 'move']);
      if (target) { setActive(target); return; }
    }
    setActive(null);
  };

  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented || isTextEntryFocused()) return;

    const direction = ARROW_DIRECTION[event.key];
    if (direction) {
      if (!held.size) return;
      const target = heldTarget(event, ['scroll', 'drag', 'move']);
      const scale = target ? getShortcutStepScale(event, target.shortcut) : undefined;
      if (!target || scale === undefined) return;
      event.preventDefault();
      adjust(target, scale, direction);
      return;
    }

    if (isModifierKey(event.key)) {
      refreshActive(event);
      return;
    }

    // Prefer the typed character ("+", "?") and fall back to the physical key.
    const keys = getShortcutKeys(event);
    const key = keys.find(candidate => DialStore.resolveShortcutTargets(candidate).length > 0) ?? keys[keys.length - 1];
    const id = event.code || key;
    const wasHeld = held.has(id);
    held.set(id, key);
    if (!wasHeld) {
      resetPointer();
      wheelAccumulator = 0;
    }

    const target = exactTarget(key, event);
    if (!target) return;
    setActive(target);
    if (target.control.type === 'toggle') {
      event.preventDefault();
      if (!wasHeld && !event.repeat) DialStore.updateValue(target.panelId, target.path, !DialStore.getValue(target.panelId, target.path));
    }
  };

  const keyup = (event: KeyboardEvent) => {
    held.delete(event.code || getShortcutKeys(event).pop()!);
    // macOS sends no keyup for keys released while Command is down.
    if (event.key === 'Meta') held.clear();
    resetPointer();
    refreshActive(event);
  };

  const wheel = (event: WheelEvent) => {
    // Control + wheel is pinch-zoom on trackpads.
    if (event.ctrlKey || event.defaultPrevented || isTextEntryFocused()) return;

    let target = held.size ? heldTarget(event, ['scroll']) : null;
    if (!target) {
      // Without a held key, leave scrolling inside DialKit's own panels alone.
      if (isInsideDialKit(event.target)) return;
      const modifiers = getEventModifiers(event);
      target = DialStore.resolveScrollOnlyTargets().find(candidate => (
        candidate.control.type === 'slider' && (!candidate.shortcut.modifier || modifiers.includes(candidate.shortcut.modifier))
      )) ?? null;
    }
    const scale = target ? getShortcutStepScale(event, target.shortcut) : undefined;
    if (!target || scale === undefined) return;

    event.preventDefault();
    const gestureStart = event.timeStamp - lastWheel > WHEEL_GESTURE_GAP;
    lastWheel = event.timeStamp;
    const { steps, remainder } = takeWheelSteps(gestureStart ? 0 : wheelAccumulator, getWheelDistance(event, window.innerHeight), gestureStart || event.deltaMode !== 0);
    wheelAccumulator = remainder;
    if (steps) adjust(target, scale, steps);
  };

  const mousedown = (event: MouseEvent) => {
    if (event.button !== 0 || !held.size || isTextEntryFocused()) return;
    if (heldTarget(event, ['drag'])) {
      dragging = true;
      lastX = event.clientX;
      accumulator = 0;
      event.preventDefault();
    }
  };

  const mousemove = (event: MouseEvent) => {
    if (!held.size || isTextEntryFocused()) return;
    const target = heldTarget(event, [dragging ? 'drag' : 'move']);
    const scale = target ? getShortcutStepScale(event, target.shortcut) : undefined;
    if (!target || scale === undefined) return;
    if (lastX === undefined) {
      lastX = event.clientX;
      return;
    }
    accumulator += event.clientX - lastX;
    lastX = event.clientX;
    const steps = Math.trunc(accumulator / DRAG_SENSITIVITY);
    if (steps) {
      accumulator -= steps * DRAG_SENSITIVITY;
      adjust(target, scale, steps);
    }
  };

  const mouseup = () => { dragging = false; lastX = undefined; accumulator = 0; };

  const blur = () => {
    held.clear();
    resetPointer();
    wheelAccumulator = 0;
    setActive(null);
  };

  window.addEventListener('keydown', keydown);
  // Capture keyup so a host handler that stops propagation can't leave a key held.
  window.addEventListener('keyup', keyup, true);
  window.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('mousedown', mousedown);
  window.addEventListener('mousemove', mousemove);
  window.addEventListener('mouseup', mouseup);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup, true);
    window.removeEventListener('wheel', wheel);
    window.removeEventListener('mousedown', mousedown);
    window.removeEventListener('mousemove', mousemove);
    window.removeEventListener('mouseup', mouseup);
    window.removeEventListener('blur', blur);
    blur();
  };
}
