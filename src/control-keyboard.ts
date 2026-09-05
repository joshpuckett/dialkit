import { decimalsForStep } from './numeric';

type KeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey' | 'target' | 'currentTarget' | 'preventDefault' | 'stopPropagation'>;

/** Keyboard steps are relative to the range minimum, including fractional ranges. */
export function sliderKeyValue(key: string, value: number, min: number, max: number, step: number, shift = false): number | undefined {
  if (key === 'Home') return min;
  if (key === 'End') return max;
  const direction = ['ArrowRight', 'ArrowUp', 'PageUp'].includes(key) ? 1
    : ['ArrowLeft', 'ArrowDown', 'PageDown'].includes(key) ? -1 : 0;
  if (!direction) return undefined;
  if (!(step > 0) || max <= min) return min;
  const amount = (key.startsWith('Page') || shift) ? 10 : 1;
  const position = (value - min) / step;
  const nextStep = direction > 0 ? Math.floor(position + 1e-9) + amount : Math.ceil(position - 1e-9) - amount;
  const next = min + nextStep * step;
  return Math.max(min, Math.min(max, Number(next.toPrecision(14))));
}

/**
 * Arrow-key nudge for a slider's number field, using the same allowed values as the
 * focused track: `sliderKeyValue` moves one step relative to the range minimum, so a
 * nudge always lands on a value the slider can hold and survives the commit snap.
 * Only the vertical arrows nudge — Left, Right, Home and End stay with the text caret.
 * Returns the next value and its text at the field's display precision, or undefined when
 * the key is not a nudge or the field does not hold a number.
 */
export function nudgeInputValue(key: string, text: string, min: number, max: number, step: number, shift = false): { value: number; text: string } | undefined {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return undefined;
  const current = parseFloat(text);
  if (!Number.isFinite(current)) return undefined;
  const value = sliderKeyValue(key, current, min, max, step, shift);
  return value === undefined ? undefined : { value, text: value.toFixed(decimalsForStep(step, min, max)) };
}

/** Nudge a slider's number field and commit the value at once; returns whether the key was consumed. */
export function handleInputNudge(event: KeyEvent, text: string, min: number, max: number, step: number, apply: (text: string, value: number) => void): boolean {
  if (event.altKey || event.metaKey || event.ctrlKey) return false;
  const nudged = nudgeInputValue(event.key, text, min, max, step, event.shiftKey);
  if (!nudged) return false;
  event.preventDefault();
  apply(nudged.text, nudged.value);
  return true;
}

export function handleSliderKey(event: KeyEvent, value: number, min: number, max: number, step: number, change: (value: number) => void, edit: () => void): void {
  if (event.target !== event.currentTarget || event.altKey || event.metaKey || event.ctrlKey) return;
  const next = sliderKeyValue(event.key, value, min, max, step, event.shiftKey);
  if (next === undefined && event.key !== 'Enter') return;
  event.preventDefault();
  event.stopPropagation();
  if (next === undefined) edit();
  else change(next);
}

export function activateOnKey(event: KeyEvent, activate: () => void): void {
  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  activate();
}

export function optionKeyIndex(key: string, index: number, count: number, wrap = false): number | undefined {
  if (!count) return undefined;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const delta = ['ArrowRight', 'ArrowDown'].includes(key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(key) ? -1 : 0;
  if (!delta) return undefined;
  return wrap ? (index + delta + count) % count : Math.max(0, Math.min(count - 1, index + delta));
}

export function handleSegmentKey(event: KeyEvent): void {
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  const group = event.currentTarget as HTMLElement;
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('.dialkit-segmented-button:not(:disabled)'));
  const next = optionKeyIndex(event.key, buttons.indexOf(event.target as HTMLButtonElement), buttons.length, true);
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  buttons[next].focus({ preventScroll: true });
  buttons[next].click();
}

let labelId = 0;
export function labelSegmentedControl(group: HTMLElement): void {
  if (group.hasAttribute('aria-label') || group.hasAttribute('aria-labelledby')) return;
  const label = group.closest('.dialkit-labeled-control')?.querySelector<HTMLElement>('.dialkit-labeled-control-label');
  if (!label) { group.setAttribute('aria-label', 'Options'); return; }
  label.id ||= `dialkit-segment-label-${++labelId}`;
  group.setAttribute('aria-labelledby', label.id);
}

export function openDropdownOnKey(event: KeyEvent, open: () => void): void {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  event.stopPropagation();
  open();
}

/** Find the next control in the owner's document order, excluding floating content. */
export function adjacentTabStop(trigger: HTMLElement, backwards = false): HTMLElement | undefined {
  const candidates = Array.from(trigger.ownerDocument.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'));
  const stops = candidates.filter(el => el === trigger || (
    el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden' &&
    !el.closest('[inert], [aria-hidden="true"], .dialkit-select-dropdown, .dialkit-preset-dropdown, .dialkit-shortcuts-dropdown, .dialkit-color-popover')
  ));
  const index = stops.indexOf(trigger);
  return index < 0 ? undefined : stops[index + (backwards ? -1 : 1)];
}
