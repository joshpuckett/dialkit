// Shared shortcut utilities — single source of truth across all framework adapters.

import { DialStore } from './store/DialStore';
import type { ControlMeta, ShortcutConfig } from './store/DialStore';

// ── Math helpers ──

export { decimalsForStep, roundValue } from './numeric';
import { roundValue } from './numeric';

export function getEffectiveStep(control: ControlMeta, shortcut: ShortcutConfig): number {
  const min = control.min ?? 0;
  const max = control.max ?? 1;
  const range = max - min;
  const mode = shortcut.mode ?? 'normal';
  return mode === 'fine' ? range * 0.01
    : mode === 'coarse' ? range * 0.1
    : control.step ?? 1;
}

export function applySliderDelta(
  panelId: string,
  path: string,
  control: ControlMeta,
  effectiveStep: number,
  direction: number
): void {
  const currentValue = DialStore.getValue(panelId, path) as number;
  const min = control.min ?? 0;
  const max = control.max ?? 1;
  const newValue = Math.max(min, Math.min(max, currentValue + direction * effectiveStep));
  DialStore.updateValue(panelId, path, roundValue(newValue, effectiveStep, min, max));
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

/**
 * Focused element as seen from `from`'s tree, following open shadow roots downward.
 * Resolving from an owned element also works inside closed shadow roots; without an
 * element the walk starts at `document`, so focus inside closed roots stays opaque.
 */
export function getActiveElement(from?: Element | null): Element | null {
  const root = (from?.getRootNode() ?? document) as Document | ShadowRoot;
  let active = root.activeElement ?? null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/**
 * True when the event started inside any of `nodes`, across open shadow boundaries. Listeners outside
 * a closed shadow root cannot see its nodes in the composed path, so outside-click detection needs open roots.
 */
export function eventWithin(event: Event, ...nodes: Array<Node | null | undefined>): boolean {
  const path = event.composedPath();
  return nodes.some(node => node != null && path.includes(node));
}

/**
 * Observe focus departures on every enclosing shadow root and the document. A listener on `document` alone
 * misses focus moving between two elements inside one shadow tree: dispatch stops where the target and
 * relatedTarget retarget to the same host, so the event never leaves that tree.
 */
export function observeFocusOutside(nodes: Element[], outside: () => void): () => void {
  const roots = new Set<Document | ShadowRoot>();
  for (const node of nodes) {
    let root = node.getRootNode();
    while (root instanceof ShadowRoot) {
      roots.add(root);
      root = root.host.getRootNode();
    }
    roots.add(node.ownerDocument);
  }
  const focusin = (event: Event) => {
    if (!eventWithin(event, ...nodes)) outside();
  };
  roots.forEach(root => root.addEventListener('focusin', focusin));
  return () => roots.forEach(root => root.removeEventListener('focusin', focusin));
}

export function isInputFocused(from?: Element | null): boolean {
  const el = getActiveElement(from);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (el.closest('select, button, [role="slider"], [role="radio"], [role="listbox"], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="button"]')) return true;
  if ((el as HTMLElement).contentEditable === 'true') return true;
  return false;
}

export function getActiveModifier(e: KeyboardEvent | WheelEvent | MouseEvent): 'alt' | 'shift' | 'meta' | undefined {
  if (e.altKey) return 'alt';
  if (e.shiftKey) return 'shift';
  if (e.metaKey) return 'meta';
  return undefined;
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
