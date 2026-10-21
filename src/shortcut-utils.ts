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

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);
const TEXT_ROLES = '[role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]';
// Composite widgets that use letters for type-ahead.
const TYPE_AHEAD_ROLES = '[role="menu"], [role="menubar"], [role^="menuitem"], [role="listbox"], [role="option"], [role="tree"], [role="treeitem"], [role="grid"], [role="treegrid"]';

/** The focused element, following open shadow roots to the element that actually receives keys. */
export function getDeepActiveElement(root: Document | ShadowRoot = document): Element | null {
  let element = root.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

/**
 * Whether keys are currently typing text, or searching a menu or list by its
 * first letters. Assigned shortcuts pause only here: buttons, sliders and other
 * widgets keep them working, and widgets that use a key themselves claim it
 * with `preventDefault()` before shortcuts see it.
 */
export function isTextEntryFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const element = getDeepActiveElement();
  if (!element || element === document.body) return false;
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(element.type);
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return !!element.closest(`${TEXT_ROLES}, ${TYPE_AHEAD_ROLES}`);
}

/** @deprecated Use `isTextEntryFocused`, which no longer pauses shortcuts on buttons and widgets. */
export const isInputFocused = isTextEntryFocused;

export type ShortcutModifier = NonNullable<ShortcutConfig['modifier']>;
export type EventModifier = ShortcutModifier | 'ctrl';

export function getEventModifiers(e: KeyboardEvent | WheelEvent | MouseEvent): EventModifier[] {
  const modifiers: EventModifier[] = [];
  if (e.altKey) modifiers.push('alt');
  if (e.shiftKey) modifiers.push('shift');
  if (e.metaKey) modifiers.push('meta');
  if (e.ctrlKey) modifiers.push('ctrl');
  return modifiers;
}

/**
 * The single modifier a shortcut can be assigned, or `null` when the held
 * combination cannot match any shortcut (two modifiers, or Control).
 */
export function getActiveModifier(e: KeyboardEvent | WheelEvent | MouseEvent): ShortcutModifier | undefined | null {
  const modifiers = getEventModifiers(e);
  if (modifiers.length === 0) return undefined;
  return modifiers.length === 1 && modifiers[0] !== 'ctrl' ? modifiers[0] : null;
}

const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift', 'CapsLock', 'Fn', 'FnLock', 'Hyper', 'OS', 'Super', 'Symbol', 'SymbolLock']);

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

const CODE_KEYS: Record<string, string> = {
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Space: ' ',
};

function keyForCode(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_KEYS[code];
}

/**
 * The keys an event can stand for, typed character first. Option and Shift
 * change the character (Option+R types "®" on macOS, Shift+1 types "!"), so the
 * physical key follows as a fallback when it differs.
 */
export function getShortcutKeys(e: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'shiftKey'>): string[] {
  const typed = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const physical = keyForCode(e.code);
  const modified = e.altKey || e.shiftKey || typed === 'Dead' || typed === 'Unidentified';
  return modified && physical && physical !== typed ? [typed, physical] : [typed];
}

/** The key an event refers to: the typed character, or the physical key when a modifier replaced it with a symbol. */
export function getShortcutKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'shiftKey'>): string {
  const [typed, physical] = getShortcutKeys(e);
  return physical !== undefined && !/^[a-z0-9]$/.test(typed) ? physical : typed;
}

export type Hotkey = { key: string; modifiers: EventModifier[] };

const HOTKEY_MODIFIERS: Record<string, EventModifier | 'mod'> = {
  alt: 'alt', option: 'alt', opt: 'alt',
  shift: 'shift',
  meta: 'meta', cmd: 'meta', command: 'meta',
  ctrl: 'ctrl', control: 'ctrl',
  mod: 'mod',
};

const HOTKEY_KEYS: Record<string, string> = {
  period: '.', comma: ',', slash: '/', backslash: '\\', backquote: '`', backtick: '`',
  minus: '-', equal: '=', semicolon: ';', quote: "'", space: ' ', esc: 'Escape', escape: 'Escape',
};

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * Parse a hotkey such as `"ctrl+period"`, `"mod+."`, `"alt+d"` or `"backquote"`.
 * `mod` is Command on Apple platforms and Control elsewhere.
 */
export function parseHotkey(hotkey: string): Hotkey | null {
  const trimmed = hotkey.trim();
  if (!trimmed) return null;
  const parts = trimmed.endsWith('++') ? [...trimmed.slice(0, -2).split('+'), '+'] : trimmed.split('+');
  const rawKey = parts.pop()!.trim();
  if (!rawKey) return null;
  const modifiers: EventModifier[] = [];
  for (const part of parts) {
    const modifier = HOTKEY_MODIFIERS[part.trim().toLowerCase()];
    if (!modifier) return null;
    const resolved = modifier === 'mod' ? (isApplePlatform() ? 'meta' : 'ctrl') : modifier;
    if (!modifiers.includes(resolved)) modifiers.push(resolved);
  }
  const named = HOTKEY_KEYS[rawKey.toLowerCase()];
  const key = named ?? (rawKey.length === 1 ? rawKey.toLowerCase() : rawKey);
  return { key, modifiers };
}

export function matchesHotkey(e: KeyboardEvent, hotkey: Hotkey): boolean {
  const modifiers = getEventModifiers(e);
  return getShortcutKeys(e).includes(hotkey.key)
    && modifiers.length === hotkey.modifiers.length
    && hotkey.modifiers.every(modifier => modifiers.includes(modifier));
}

/** Format for `aria-keyshortcuts`, for example `Control+.`. */
export function formatAriaKeyshortcut(hotkey: Hotkey): string {
  const names: Record<EventModifier, string> = { alt: 'Alt', shift: 'Shift', meta: 'Meta', ctrl: 'Control' };
  const key = hotkey.key === ' ' ? 'Space' : hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
  return [...hotkey.modifiers.map(modifier => names[modifier]), key].join('+');
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
