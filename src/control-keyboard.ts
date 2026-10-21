import { decimalsForStep, roundValue } from './numeric';

type KeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey' | 'target' | 'currentTarget' | 'preventDefault' | 'stopPropagation'>;

/**
 * Keyboard steps are relative to the range minimum, including fractional ranges.
 * Shift (or Page Up/Down) moves ten steps; Option/Alt moves a tenth of a step.
 */
export function sliderKeyValue(key: string, value: number, min: number, max: number, step: number, shift = false, fine = false): number | undefined {
  if (key === 'Home') return min;
  if (key === 'End') return max;
  const direction = ['ArrowRight', 'ArrowUp', 'PageUp'].includes(key) ? 1
    : ['ArrowLeft', 'ArrowDown', 'PageDown'].includes(key) ? -1 : 0;
  if (!direction) return undefined;
  if (!(step > 0) || max <= min) return min;
  if (fine && !shift && key.startsWith('Arrow')) {
    return roundValue(value + direction * step / 10, step / 10, min, max);
  }
  const amount = (key.startsWith('Page') || shift) ? 10 : 1;
  const position = (value - min) / step;
  const nextStep = direction > 0 ? Math.floor(position + 1e-9) + amount : Math.ceil(position - 1e-9) - amount;
  const next = min + nextStep * step;
  return Math.max(min, Math.min(max, Number(next.toPrecision(14))));
}

/**
 * Slider keys: arrows, Home/End and Page Up/Down change the value, Enter opens
 * the numeric editor, and Delete or Backspace restores the default when `reset` is given.
 */
export function handleSliderKey(event: KeyEvent, value: number, min: number, max: number, step: number, change: (value: number) => void, edit: () => void, reset?: () => void): void {
  if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey) return;
  if (reset && (event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    reset();
    return;
  }
  const next = sliderKeyValue(event.key, value, min, max, step, event.shiftKey, event.altKey);
  if (next === undefined && (event.key !== 'Enter' || event.altKey)) return;
  event.preventDefault();
  event.stopPropagation();
  if (next === undefined) edit();
  else change(next);
}

/**
 * Evaluate typed slider input. Accepts plain numbers, arithmetic such as
 * `(100-20)/2`, a leading operator applied to the current value (`+10`, `*2`, `/4`),
 * percentages of the range (`50%`), and the slider's own unit (`24px`).
 * Returns `undefined` for anything else, including trailing text like `12abc`.
 */
export function evaluateNumber(text: string, current: number, min: number, max: number, unit?: string): number | undefined {
  let source = text.trim().toLowerCase();
  const suffix = unit?.trim().toLowerCase();
  if (suffix && suffix !== '%' && source.endsWith(suffix)) source = source.slice(0, -suffix.length).trim();
  if (source.endsWith('°')) source = source.slice(0, -1).trim();
  if (!source) return undefined;
  if (/^[*/+x×]/.test(source)) source = `${current}${source}`;
  source = source.replace(/(\d*\.?\d+)\s*%/g, (_, amount: string) => String(min + (max - min) * Number(amount) / 100));
  try {
    const result = evaluateArithmetic(source);
    return Number.isFinite(result) ? result : undefined;
  } catch {
    return undefined;
  }
}

function evaluateArithmetic(source: string): number {
  let index = 0;
  const skip = () => { while (source[index] === ' ') index++; };
  const atom = (): number => {
    skip();
    if (source[index] === '(') {
      index++;
      const value = sum();
      skip();
      if (source[index++] !== ')') throw new SyntaxError('Missing )');
      return value;
    }
    if (source[index] === '-') { index++; return -atom(); }
    if (source[index] === '+') { index++; return atom(); }
    const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(source.slice(index));
    if (!match) throw new SyntaxError('Expected a number');
    index += match[0].length;
    return Number(match[0]);
  };
  const product = (): number => {
    let value = atom();
    for (;;) {
      skip();
      const operator = source[index];
      if (operator !== '*' && operator !== '/' && operator !== 'x' && operator !== '\u00d7') return value;
      index++;
      const right = atom();
      value = operator === '/' ? value / right : value * right;
    }
  };
  const sum = (): number => {
    let value = product();
    for (;;) {
      skip();
      const operator = source[index];
      if (operator !== '+' && operator !== '-') return value;
      index++;
      const right = product();
      value = operator === '+' ? value + right : value - right;
    }
  };
  const value = sum();
  skip();
  if (index < source.length) throw new SyntaxError('Unexpected input');
  return value;
}

/**
 * Up/Down arrows inside the numeric editor step from the typed value (or the
 * current value when the text is not yet valid). Shift is ten steps, Option/Alt a tenth.
 */
export function numericInputKeyValue(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey'>, text: string, current: number, min: number, max: number, step: number, unit?: string): number | undefined {
  const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
  if (!direction || !(step > 0)) return undefined;
  const base = evaluateNumber(text, current, min, max, unit) ?? current;
  const scale = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
  return roundValue(base + direction * step * scale, step * Math.min(scale, 1), min, max);
}

/** Text shown in the numeric editor, with enough decimals for fine (tenth-step) values. */
export function formatEditableValue(value: number, step: number, min: number, max: number): string {
  const decimals = decimalsForStep(step, min, max);
  const fine = Math.abs(value - roundValue(value, step, min, max)) > 1e-9;
  return value.toFixed(fine ? decimalsForStep(step / 10, min, max) : decimals);
}

export type SliderDragState = { raw: number; lastX: number };

/** Start a drag at the value under the pointer. */
export function beginSliderDrag(valueAtPointer: number, clientX: number): SliderDragState {
  return { raw: valueAtPointer, lastX: clientX };
}

/**
 * Follow the pointer by its movement rather than its position, so modifiers can
 * change the rate mid-drag without the value jumping. Option/Alt moves at a tenth
 * of the speed (precision drag); Shift snaps to the tick marks.
 */
export function updateSliderDrag(state: SliderDragState, clientX: number, trackWidth: number, min: number, max: number, step: number, modifiers: { shiftKey: boolean; altKey: boolean }): number {
  const range = max - min;
  const precise = modifiers.altKey && !modifiers.shiftKey;
  if (trackWidth > 0) state.raw += (clientX - state.lastX) / trackWidth * range * (precise ? 0.1 : 1);
  state.lastX = clientX;
  const value = Math.max(min, Math.min(max, state.raw));
  if (modifiers.shiftKey) {
    const tick = range / step <= 10 ? step : range / 10;
    return roundValue(min + Math.round((value - min) / tick) * tick, step, min, max);
  }
  return roundValue(value, precise ? step / 10 : step, min, max);
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
