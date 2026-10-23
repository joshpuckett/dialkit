import { PAD_GRID_DIVISIONS, normalizePadValue, padGridIntersection, padValueFromKey, padValueFromPoint, resolvePadAxis, snapPadAxis, type DialPadConfig, type DialPadValue } from './dial-pad';
import { getActiveElement } from './shortcut-utils';

export type DialPadProps = Omit<DialPadConfig, 'type'> & {
  label: string;
  value: DialPadValue;
  onChange: (value: DialPadValue) => void;
};

let nextId = 0;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** Shared pointer, keyboard, and numeric editing behavior for all four frameworks. */
export function mountDialPad(host: HTMLElement, initial: DialPadProps) {
  let props = initial;
  let value = normalizePadValue(props.value, props);
  let drag: {
    id: number;
    start: { x: number; y: number };
    value: DialPadValue;
    offset: { x: number; y: number };
    moved: boolean;
    lock?: 'x' | 'y';
    lockValue?: DialPadValue;
  } | undefined;

  const root = element('div', 'dialkit-pad');
  const fields = element('div', 'dialkit-pad-fields');
  const caption = element('div', 'dialkit-pad-caption');
  const label = element('span', 'dialkit-pad-label');
  caption.append(label);
  fields.append(caption);
  const surface = element('div', 'dialkit-pad-surface');
  surface.tabIndex = 0;
  surface.setAttribute('role', 'group');
  const plane = element('div', 'dialkit-pad-plane');
  plane.setAttribute('aria-hidden', 'true');
  // Grid spacing is based on the whole square, independently of the point's inset.
  const grid = element('div', 'dialkit-pad-grid');
  grid.setAttribute('aria-hidden', 'true');
  for (let index = 1; index < PAD_GRID_DIVISIONS; index++) {
    const vertical = element('span', 'dialkit-pad-grid-line dialkit-pad-grid-vertical');
    const horizontal = element('span', 'dialkit-pad-grid-line dialkit-pad-grid-horizontal');
    vertical.style.left = `${index / PAD_GRID_DIVISIONS * 100}%`;
    horizontal.style.top = `${index / PAD_GRID_DIVISIONS * 100}%`;
    grid.append(vertical, horizontal);
  }
  const center = element('span', 'dialkit-pad-center');
  const point = element('span', 'dialkit-pad-point');
  plane.append(center, point);
  surface.append(grid, plane);
  const instructions = element('span', 'dialkit-pad-instructions', 'Arrow keys adjust each axis. Shift adjusts by ten steps. Home resets both axes. Hold Shift while dragging to lock an axis.');
  instructions.id = `dialkit-pad-help-${++nextId}`;
  surface.setAttribute('aria-describedby', instructions.id);
  const inputs = (['x', 'y'] as const).map(axis => {
    const field = element('label', 'dialkit-pad-field');
    const name = element('span', 'dialkit-pad-axis');
    const input = element('input', 'dialkit-pad-value');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'spinbutton');
    field.append(name, input);
    fields.append(field);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('blur', () => {
      const number = input.value.trim() === '' ? NaN : Number(input.value);
      if (Number.isFinite(number)) commit({ ...value, [axis]: number });
      input.value = String(value[axis]);
    });
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        if (event.key === 'Escape') input.value = String(value[axis]);
        input.blur();
        surface.focus({ preventScroll: true });
      } else if (!event.altKey && !event.metaKey && !event.ctrlKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const range = resolvePadAxis(props[axis]);
        const draft = input.value.trim() === '' ? NaN : Number(input.value);
        const current = Number.isFinite(draft) ? draft : value[axis];
        const direction = event.key === 'ArrowUp' ? 1 : -1;
        commit({ ...value, [axis]: snapPadAxis(current + direction * range.step * (event.shiftKey ? 10 : 1), range) });
        input.value = String(value[axis]);
      }
    });
    return { axis, name, input };
  });
  root.append(fields, surface, instructions);
  host.append(root);

  function render() {
    label.textContent = props.label;
    label.title = props.label;
    const names = { x: props.labels?.x ?? 'X', y: props.labels?.y ?? 'Y' };
    surface.setAttribute('aria-label', `${props.label}: ${names.x} ${value.x}, ${names.y} ${value.y}`);
    inputs.forEach(({ axis, name, input }) => {
      const range = resolvePadAxis(props[axis]);
      name.textContent = names[axis];
      name.title = names[axis];
      input.setAttribute('aria-label', `${props.label} ${names[axis]}`);
      input.setAttribute('aria-valuemin', String(range.min));
      input.setAttribute('aria-valuemax', String(range.max));
      input.setAttribute('aria-valuenow', String(value[axis]));
      if (getActiveElement(input) !== input) input.value = String(value[axis]);
      const fraction = (value[axis] - range.min) / (range.max - range.min);
      point.style[axis === 'x' ? 'left' : 'top'] = `${(axis === 'x' ? fraction : 1 - fraction) * 100}%`;
    });
  }

  function commit(next: DialPadValue) {
    const normalized = normalizePadValue(next, props);
    if (normalized.x === value.x && normalized.y === value.y) return;
    value = normalized;
    render();
    props.onChange({ ...value });
  }

  function endDrag() {
    const id = drag?.id;
    drag = undefined;
    delete surface.dataset.dragging;
    if (id !== undefined && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
  }

  function move(event: PointerEvent, released = false) {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.max(Math.abs(event.clientX - drag.start.x), Math.abs(event.clientY - drag.start.y)) >= 3) {
      drag.moved = true;
      surface.dataset.dragging = 'true';
    }
    const bounds = plane.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    let x = event.clientX - drag.offset.x;
    let y = event.clientY - drag.offset.y;
    // Snap clicks on release, including clicks on the point itself. Once a drag
    // begins, never snap it, even if it ends back inside the starting snap area.
    if (released && !drag.moved && !event.shiftKey) {
      const gridBounds = grid.getBoundingClientRect();
      const intersection = padGridIntersection(event.clientX - gridBounds.left, event.clientY - gridBounds.top, gridBounds.width, gridBounds.height);
      if (intersection) {
        x = gridBounds.left + intersection.x;
        y = gridBounds.top + intersection.y;
      }
    }
    const next = padValueFromPoint(
      (x - bounds.left) / bounds.width,
      (y - bounds.top) / bounds.height,
      props,
    );
    if (event.shiftKey) {
      if (!drag.lock) {
        const dx = Math.abs(event.clientX - drag.start.x);
        const dy = Math.abs(event.clientY - drag.start.y);
        if (Math.max(dx, dy) < 3) return;
        drag.lock = dx >= dy ? 'x' : 'y';
        drag.lockValue = { ...value };
      }
      const fixed = drag.lock === 'x' ? 'y' : 'x';
      next[fixed] = drag.lockValue![fixed];
    } else {
      drag.lock = undefined;
      drag.lockValue = undefined;
    }
    commit(next);
  }

  surface.addEventListener('dblclick', () => commit(normalizePadValue(undefined, props)));
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    surface.focus({ preventScroll: true });
    const bounds = point.getBoundingClientRect();
    const onPoint = event.target === point;
    drag = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      value: { ...value },
      offset: onPoint ? { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 } : { x: 0, y: 0 },
      moved: false,
    };
    surface.setPointerCapture(event.pointerId);
    move(event);
  });
  surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.id) return;
    move(event, true);
    endDrag();
  });
  surface.addEventListener('pointercancel', event => { if (event.pointerId === drag?.id) endDrag(); });
  surface.addEventListener('lostpointercapture', event => { if (event.pointerId === drag?.id) endDrag(); });
  surface.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const next = padValueFromKey(value, event.key, event.shiftKey, props);
    if (next || event.key === 'Home' || (event.key === 'Escape' && drag)) {
      event.preventDefault();
      event.stopPropagation();
      if (next) commit(next);
      else if (event.key === 'Home') { endDrag(); commit(normalizePadValue(undefined, props)); }
      else if (drag) { const start = drag.value; endDrag(); commit(start); }
    }
  });

  render();
  return {
    update(next: DialPadProps) {
      props = next;
      value = normalizePadValue(next.value, props);
      render();
    },
    destroy() { endDrag(); root.remove(); },
  };
}
