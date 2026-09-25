import { clamp, colorFormat, colorToRgb, fitGamut, formatColor, maxChroma, parseColor, type Color } from './color';
import { getDialKitPortalRoot, getDropdownPosition, observeDropdownPosition } from './dropdown-position';
import { handleSegmentKey } from './control-keyboard';
import { eventWithin, getActiveElement, observeFocusOutside } from './shortcut-utils';

export type ColorControlProps = { label: string; value: string; onChange: (value: string) => void };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  if (el instanceof HTMLButtonElement) el.type = 'button';
  return el;
}

/** One interaction/rendering implementation shared by the four framework adapters. */
export function mountColorControl(host: HTMLElement, initial: ColorControlProps, presentation: 'popover' | 'inline' = 'popover') {
  const inline = presentation === 'inline';
  let props = initial;
  let color: Color = parseColor(props.value) ?? { l: 0, c: 0, h: 0, a: 1 };
  let format = colorFormat(props.value);
  let lastEmitted: string | undefined;
  let popup: HTMLDivElement | undefined;
  let stopPosition: (() => void) | undefined;
  let paintFrame = 0;
  let updatePicker = () => {};
  const row = element('div', 'dialkit-color-control');
  const label = element('span', 'dialkit-color-label');
  const inputs = element('div', 'dialkit-color-inputs');
  const valueInput = element('input', 'dialkit-color-value');
  valueInput.type = 'text';
  valueInput.spellcheck = false;
  valueInput.autocomplete = 'off';
  const swatch = element('button', 'dialkit-color-swatch');
  swatch.setAttribute('aria-haspopup', 'dialog');
  swatch.setAttribute('aria-expanded', 'false');
  inputs.append(valueInput, swatch);
  row.append(label, inputs);
  host.append(row);
  if (inline) row.style.display = 'none';

  const render = () => {
    label.textContent = props.label;
    valueInput.setAttribute('aria-label', `${props.label} color value`);
    if (getActiveElement(valueInput) !== valueInput) valueInput.value = props.value;
    valueInput.title = props.value;
    swatch.style.setProperty('--dial-color', props.value);
    swatch.setAttribute('aria-label', `Pick ${props.label.toLowerCase()} color`);
    updatePicker();
  };
  const commit = (next: Color, nextFormat = format) => {
    format = nextFormat;
    // Hex and P3 are bounded output spaces. Keep the handle on the emitted color.
    color = format === 'oklch' ? next : fitGamut(next, format === 'p3' ? 'p3' : 'srgb');
    const value = formatColor(color, format);
    lastEmitted = value;
    props = { ...props, value };
    render();
    props.onChange(value);
  };
  const acceptText = (input: HTMLInputElement) => {
    const parsed = parseColor(input.value);
    if (!parsed) {
      input.setAttribute('aria-invalid', 'true');
      input.title = 'Enter a hex, RGB, HSL, OKLCH, or Display P3 color';
      return false;
    }
    input.removeAttribute('aria-invalid');
    color = parsed;
    format = colorFormat(input.value);
    const value = input.value.trim();
    lastEmitted = value;
    props = { ...props, value };
    render();
    props.onChange(value);
    return true;
  };
  valueInput.addEventListener('change', () => acceptText(valueInput));
  valueInput.addEventListener('blur', () => {
    if (valueInput.getAttribute('aria-invalid')) {
      valueInput.value = props.value;
      valueInput.removeAttribute('aria-invalid');
    }
  });
  valueInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { if (acceptText(valueInput)) valueInput.blur(); }
    if (e.key === 'Escape') { valueInput.value = props.value; valueInput.removeAttribute('aria-invalid'); valueInput.blur(); }
    e.stopPropagation();
  });

  let stopFocus: (() => void) | undefined;
  const close = (restoreFocus = false) => {
    stopFocus?.();
    stopFocus = undefined;
    stopPosition?.();
    stopPosition = undefined;
    cancelAnimationFrame(paintFrame);
    popup?.remove();
    popup = undefined;
    updatePicker = () => {};
    delete row.dataset.open;
    swatch.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside);
    if (restoreFocus) swatch.focus({ preventScroll: true });
  };
  const outside = (e: PointerEvent) => {
    if (!eventWithin(e, popup, row)) close();
  };

  const open = () => {
    if (popup) { if (!inline) close(); return; }
    const root = inline ? host : getDialKitPortalRoot(host) ?? host;
    popup = element('div', 'dialkit-color-popover');
    popup.dataset.presentation = presentation;
    popup.style.position = inline ? 'static' : 'fixed';
    popup.setAttribute('role', inline ? 'group' : 'dialog');
    popup.setAttribute('aria-label', `${props.label} color picker`);
    const plane = element('div', 'dialkit-color-plane');
    plane.setAttribute('role', 'group');
    plane.setAttribute('aria-label', 'Color field; use arrow keys to adjust saturation and lightness');
    plane.tabIndex = 0;
    const canvas = element('canvas', 'dialkit-color-canvas');
    canvas.width = 252;
    canvas.height = 160;
    canvas.setAttribute('aria-hidden', 'true');
    const marker = element('span', 'dialkit-color-marker');
    marker.setAttribute('aria-hidden', 'true');
    plane.append(canvas, marker);
    const tracks = element('div', 'dialkit-color-tracks');
    function track(name: string, max: number, step: number, className: string) {
      const line = element('label', 'dialkit-color-track-row');
      const nameEl = element('span', '', name);
      const input = element('input', `dialkit-color-track ${className}`);
      input.type = 'range'; input.min = '0'; input.max = String(max); input.step = String(step);
      input.setAttribute('aria-label', name);
      line.append(nameEl, input); tracks.append(line);
      return input;
    }
    const hue = track('Hue', 360, 0.1, 'dialkit-color-hue');
    const opacity = track('Opacity', 100, 1, 'dialkit-color-opacity');
    hue.addEventListener('input', () => {
      const h = Number(hue.value);
      // Hue changes keep the field handle in place and match the strip preview.
      commit({ ...color, h, c: saturation * maxChroma(color.l, h, planeSpace()) });
    });
    opacity.addEventListener('input', () => commit({ ...color, a: Number(opacity.value) / 100 }));

    const formatRow = element('div', 'dialkit-labeled-control dialkit-color-format-row');
    const formats = element('div', 'dialkit-segmented dialkit-color-formats');
    formatRow.append(formats);
    formats.setAttribute('role', 'radiogroup');
    formats.addEventListener('keydown', handleSegmentKey);
    formats.setAttribute('aria-label', 'Color format');
    const formatPill = element('div', 'dialkit-segmented-pill');
    formatPill.setAttribute('aria-hidden', 'true');
    formats.append(formatPill);
    const formatButtons = (['hex', 'oklch', 'p3'] as const).map(f => {
      const button = element('button', 'dialkit-segmented-button dialkit-color-format', f === 'p3' ? 'Display P3' : f === 'hex' ? 'Hex' : 'OKLCH');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => commit(color, f));
      formats.append(button);
      return button;
    });
    const output = element('input', 'dialkit-color-css-input');
    output.type = 'text'; output.spellcheck = false;
    output.setAttribute('aria-label', 'CSS color');
    output.addEventListener('change', () => acceptText(output));
    output.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); acceptText(output); } });
    let lastHue = -1;
    let lastSpace = '';
    let lastHueTrack = '';
    let saturation = 0;
    const planeSpace = () => format === 'hex' ? 'srgb' : 'p3';
    const ctx = canvas.getContext('2d', { colorSpace: 'display-p3' });
    const canvasSpace = ctx?.getContextAttributes?.().colorSpace === 'display-p3' ? 'p3' : 'srgb';
    const paint = () => {
      if (!ctx) return;
      const space = planeSpace();
      if (lastHue === color.h && lastSpace === space) return;
      lastHue = color.h; lastSpace = space;
      const pixels = ctx.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++) {
        const l = 1 - y / (canvas.height - 1);
        // Normalize each row to its available chroma: the whole field is usable,
        // from neutral on the left to the richest color on the right.
        const max = maxChroma(l, color.h, space);
        for (let x = 0; x < canvas.width; x++) {
          const sample = { l, c: x / (canvas.width - 1) * max, h: color.h, a: 1 };
          const rgb = colorToRgb(sample, canvasSpace);
          const index = (y * canvas.width + x) * 4;
          rgb.forEach((n, i) => { pixels.data[index + i] = Math.round(clamp(n) * 255); });
          pixels.data[index + 3] = 255;
        }
      }
      ctx.putImageData(pixels, 0, 0);
    };
    updatePicker = () => {
      popup?.setAttribute('aria-label', `${props.label} color picker`);
      const max = maxChroma(color.l, color.h, planeSpace());
      // Keep the horizontal position at white and black, where chroma is zero.
      if (max > 0) saturation = clamp(color.c / max);
      marker.style.left = `${saturation * 100}%`;
      marker.style.top = `${(1 - color.l) * 100}%`;
      marker.style.background = formatColor({ ...color, a: 1 }, 'oklch');
      hue.value = String(color.h);
      opacity.value = String(color.a * 100);
      hue.setAttribute('aria-valuetext', `${Math.round(color.h)} degrees`);
      opacity.setAttribute('aria-valuetext', `${Math.round(color.a * 100)} percent`);
      const hueTrackKey = `${color.l.toFixed(5)}:${saturation.toFixed(5)}:${planeSpace()}`;
      if (hueTrackKey !== lastHueTrack) {
        lastHueTrack = hueTrackKey;
        const stops = Array.from({ length: 73 }, (_, i) => {
          const h = i * 5;
          return formatColor({ l: color.l, c: saturation * maxChroma(color.l, h, planeSpace()), h, a: 1 }, 'oklch');
        });
        hue.style.setProperty('--dial-color-track-bg', `linear-gradient(to right in oklab, ${stops.join(', ')})`);
      }
      // Fill the entire thumb independently of the shorter track beneath it.
      hue.style.setProperty('--dial-color-thumb', formatColor({ ...color, a: 1 }, 'oklch'));
      opacity.style.setProperty('--dial-color-thumb', formatColor(color, 'oklch'));
      opacity.style.setProperty('--dial-color-opaque', formatColor({ ...color, a: 1 }, 'oklch'));
      formatButtons.forEach((button, i) => {
        const active = (['hex', 'oklch', 'p3'] as const)[i] === format;
        button.setAttribute('aria-checked', String(active));
        button.tabIndex = active ? 0 : -1;
        button.dataset.active = String(active);
        if (active) formatPill.style.transform = `translateX(${i * 100}%)`;
      });
      if (getActiveElement(output) !== output) { output.value = props.value; output.removeAttribute('aria-invalid'); }
      output.title = props.value;
      cancelAnimationFrame(paintFrame);
      paintFrame = requestAnimationFrame(paint);
    };
    const move = (e: PointerEvent) => {
      const rect = plane.getBoundingClientRect();
      const l = 1 - clamp((e.clientY - rect.top) / rect.height);
      saturation = clamp((e.clientX - rect.left) / rect.width);
      commit({ ...color, l, c: saturation * maxChroma(l, color.h, planeSpace()) });
    };
    plane.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      plane.focus({ preventScroll: true });
      plane.setPointerCapture(e.pointerId);
      move(e);
    });
    plane.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 0.01;
      const l = clamp(color.l + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0));
      saturation = clamp(saturation + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0));
      commit({ ...color, l, c: saturation * maxChroma(l, color.h, planeSpace()) });
    });
    plane.addEventListener('pointermove', e => { if (plane.hasPointerCapture(e.pointerId)) move(e); });
    plane.addEventListener('pointerup', e => { if (plane.hasPointerCapture(e.pointerId)) plane.releasePointerCapture(e.pointerId); });
    popup.addEventListener('keydown', e => {
      if (inline) return;
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      if (e.key === 'Tab') {
        const first = formatButtons.find(button => button.tabIndex === 0);
        const active = getActiveElement(output);
        if ((e.shiftKey && active === first) || (!e.shiftKey && active === output)) {
          swatch.focus({ preventScroll: true });
          close();
        }
      }
      e.stopPropagation();
    });
    popup.append(formatRow, plane, tracks, output);
    root.append(popup);
    const updatePosition = () => {
      if (!popup) return;
      if (!host.isConnected || row.getClientRects().length === 0) { close(); return; }
      const p = getDropdownPosition(row, root, { dropdownHeight: popup.scrollHeight + 2, width: 280, maxHeight: 480, preferSide: true, fixed: true, gap: 8 });
      Object.assign(popup.style, { left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px`, maxHeight: `${p.maxHeight}px`, transformOrigin: p.above ? 'bottom' : 'top' });
    };
    updatePicker();
    if (inline) return;
    stopPosition = observeDropdownPosition(row, updatePosition, () => popup);
    row.dataset.open = 'true';
    swatch.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside);
    stopFocus = observeFocusOutside([popup, row], close);
    formatButtons.find(button => button.getAttribute('aria-checked') === 'true')?.focus({ preventScroll: true });
  };
  swatch.addEventListener('click', open);
  render();
  if (inline) open();
  return {
    update(next: ColorControlProps) {
      const parsed = parseColor(next.value);
      if (parsed && next.value !== lastEmitted && next.value !== props.value) {
        color = { ...parsed, h: parsed.c < 1e-7 ? color.h : parsed.h };
        format = colorFormat(next.value);
      }
      props = next;
      render();
    },
    destroy() { close(); row.remove(); },
  };
}
