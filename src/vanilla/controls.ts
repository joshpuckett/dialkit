import { activateOnKey, handleSegmentKey, handleSliderKey, labelSegmentedControl, handleInputNudge } from '../control-keyboard';
import { decimalsForStep, roundValue, snapToDecile, formatSliderShortcut, formatToggleShortcut } from '../shortcut-utils';
import { observeTextSize } from '../text-autosize';
import { ICON_CHEVRON, ICON_PANEL } from '../icons';
import type { ShortcutConfig } from '../store/DialStore';
import { element, icon, svg, type Mounted } from './dom';
import { animateSpring } from './animation';
export interface FolderProps {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  isRoot?: boolean;
  inline?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export function mountFolder(host: HTMLElement, initial: FolderProps) {
  let props = initial;
  let open = props.open ?? props.defaultOpen ?? true;
  const folder = element('div', `dialkit-folder${props.isRoot ? ' dialkit-folder-root' : ''}`);
  const header = element('div', `dialkit-folder-header${props.isRoot ? ' dialkit-panel-header' : ''}`);
  const top = element('div', 'dialkit-folder-header-top');
  const titleRow = element('div', 'dialkit-folder-title-row');
  const title = element('span', `dialkit-folder-title${props.isRoot ? ' dialkit-folder-title-root' : ''}`);
  titleRow.append(title);
  top.append(titleRow);
  const glyph = props.isRoot ? svg('svg', { class: 'dialkit-panel-icon', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }) : icon(ICON_CHEVRON, 'dialkit-folder-icon');
  if (props.isRoot) {
    glyph.append(svg('path', { d: ICON_PANEL.path, fill: 'currentColor', opacity: 0.5 }));
    ICON_PANEL.circles.forEach(c => glyph.append(svg('circle', { ...c, fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1.25 })));
  }
  if (!props.inline || !props.isRoot)
    top.append(glyph);
  const toolbar = element('div', 'dialkit-panel-toolbar');
  toolbar.addEventListener('click', event => event.stopPropagation());
  header.append(top);
  if (props.isRoot)
    header.append(toolbar);
  const content = element('div', 'dialkit-folder-content');
  const body = element('div', 'dialkit-folder-inner');
  content.append(body);
  folder.append(header, content);
  const node = props.isRoot ? element('div', `dialkit-panel-inner${props.inline ? ' dialkit-panel-inline' : ''}`) : folder;
  if (props.isRoot) {
    node.tabIndex = -1;
    node.append(folder);
  }
  host.append(node);
  let renderedOpen = open;
  let animation: Animation | undefined;
  const render = () => {
    const changed = renderedOpen !== open;
    const before = (props.isRoot ? node : content).getBoundingClientRect();
    if (changed)
      animation?.cancel();
    const wasOpen = renderedOpen;
    renderedOpen = open;
    folder.dataset.open = String(open);
    title.textContent = props.title;
    top.setAttribute('aria-label', props.title);
    top.setAttribute('aria-expanded', String(open));
    if (!(props.inline && props.isRoot)) {
      top.setAttribute('role', 'button');
      top.tabIndex = 0;
    }
    content.style.display = open ? '' : 'none';
    content.inert = !open;
    if (props.isRoot) {
      toolbar.style.display = open ? '' : 'none';
      titleRow.style.display = open ? '' : 'none';
      node.dataset.collapsed = String(!open);
      if (!props.inline)
        Object.assign(node.style, open
          ? { width: '280px', height: 'auto', maxHeight: 'calc(100dvh - 32px)', borderRadius: '14px', boxShadow: 'var(--dial-shadow)', overflowX: 'hidden', overflowY: 'auto', cursor: '' }
          : { width: '42px', height: '42px', maxHeight: '42px', borderRadius: '50%', boxShadow: 'var(--dial-shadow-collapsed)', overflow: 'hidden', cursor: 'pointer' });
    }
    else {
      glyph.style.transform = open ? '' : 'rotate(180deg)';
      glyph.style.transition = 'transform 250ms ease';
    }
    if (changed && before.width > 0) {
      if (props.isRoot && !props.inline) {
        const after = node.getBoundingClientRect();
        node.style.maxHeight = 'calc(100dvh - 32px)';
        animation = animateSpring(node, p => ({ width: `${before.width + (after.width - before.width) * p}px`, height: `${before.height + (after.height - before.height) * p}px`, borderRadius: `${(wasOpen ? 14 : 21) + (open ? -7 : 7) * p}px` }));
      }
      else if (!props.isRoot) {
        content.style.display = '';
        const targetHeight = open ? content.scrollHeight : 0;
        animation = animateSpring(content, p => ({ height: `${before.height + (targetHeight - before.height) * p}px`, opacity: wasOpen ? 1 - p : p, clipPath: 'inset(0 -20px)' }));
        if (!open) {
          if (animation)
            animation.onfinish = () => {
              if (!open)
                content.style.display = 'none';
            };
          else
            content.style.display = 'none';
        }
      }
    }
  };
  const toggle = () => {
    if (props.inline && props.isRoot)
      return;
    open = !open;
    render();
    props.onOpenChange?.(open);
  };
  header.addEventListener('click', event => {
    event.stopPropagation();
    toggle();
  });
  top.addEventListener('keydown', event => activateOnKey(event, toggle));
  if (props.isRoot)
    node.addEventListener('click', () => {
      if (!open)
        toggle();
    });
  render();
  return {
    element: node, body, toolbar, update(next: FolderProps) {
      props = next;
      open = next.open ?? open;
      render();
    }, destroy() {
      animation?.cancel();
      node.remove();
    }
  };
}
export interface SegmentedControlProps<T extends string = string> {
  options: {
    value: T;
    label: string;
  }[];
  value: T;
  onChange: (value: T) => void;
}
export function mountSegmentedControl<T extends string>(host: HTMLElement, initial: SegmentedControlProps<T>): Mounted<SegmentedControlProps<T>> {
  let props = initial;
  const group = element('div', 'dialkit-segmented');
  group.setAttribute('role', 'radiogroup');
  group.addEventListener('keydown', handleSegmentKey);
  const pill = element('div', 'dialkit-segmented-pill');
  pill.style.transition = 'left 200ms ease, width 200ms ease';
  pill.setAttribute('aria-hidden', 'true');
  group.append(pill);
  host.append(group);
  labelSegmentedControl(group);
  let buttons: HTMLButtonElement[] = [];
  let signature = '';
  function render() {
    const nextSignature = JSON.stringify(props.options);
    if (signature !== nextSignature) {
      signature = nextSignature;
      buttons.forEach(b => b.remove());
      buttons = props.options.map(option => {
        const b = element('button', 'dialkit-segmented-button', option.label);
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => props.onChange(option.value));
        group.append(b);
        return b;
      });
    }
    buttons.forEach((b, i) => {
      const active = props.options[i].value === props.value;
      b.dataset.active = String(active);
      b.setAttribute('aria-checked', String(active));
      b.tabIndex = active ? 0 : -1;
      if (active) {
        pill.style.left = `${b.offsetLeft}px`;
        pill.style.width = `${b.offsetWidth}px`;
      }
    });
  }
  const observer = new ResizeObserver(render);
  observer.observe(group);
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      observer.disconnect();
      group.remove();
    }
  };
}
export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  shortcut?: ShortcutConfig;
  shortcutActive?: boolean;
}
export function mountToggle(host: HTMLElement, initial: ToggleProps): Mounted<ToggleProps> {
  let props = initial;
  const row = element('div', 'dialkit-labeled-control');
  const label = element('span', 'dialkit-labeled-control-label');
  row.append(label);
  host.append(row);
  const segmentProps = () => ({ options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }], value: props.checked ? 'on' : 'off', onChange: (value: string) => props.onChange(value === 'on') });
  const segmented = mountSegmentedControl(row, segmentProps());
  function render() {
    label.textContent = props.label;
    appendShortcut(label, props.shortcut, props.shortcutActive, true);
    segmented.update(segmentProps());
  }
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      segmented.destroy();
      row.remove();
    }
  };
}
function appendShortcut(label: HTMLElement, shortcut?: ShortcutConfig, active = false, toggle = false) {
  if (!shortcut)
    return;
  label.append(element('span', `dialkit-shortcut-pill${active ? ' dialkit-shortcut-pill-active' : ''}`, toggle ? formatToggleShortcut(shortcut) : formatSliderShortcut(shortcut)));
}
export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  shortcut?: ShortcutConfig;
  shortcutActive?: boolean;
}
export function mountSlider(host: HTMLElement, initial: SliderProps): Mounted<SliderProps> {
  let props = initial;
  const wrapper = element('div', 'dialkit-slider-wrapper');
  const track = element('div', 'dialkit-slider');
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  const hashes = element('div', 'dialkit-slider-hashmarks');
  const fill = element('div', 'dialkit-slider-fill');
  const handle = element('div', 'dialkit-slider-handle');
  const label = element('span', 'dialkit-slider-label');
  const display = element('span', 'dialkit-slider-value');
  const input = element('input', 'dialkit-slider-input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.style.display = 'none';
  track.append(hashes, fill, handle, label, display, input);
  wrapper.append(track);
  host.append(wrapper);
  let drag: {
    id: number;
    x: number;
    y: number;
    rect: DOMRect;
    moved: boolean;
  } | undefined;
  let editing = false, hovered = false, editable = false;
  let nudgeOrigin: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hashSignature = '';
  let clickAnimations: (Animation | undefined)[] = [];
  const cancelClick = () => {
    clickAnimations.forEach(animation => animation?.cancel());
    clickAnimations = [];
  };
  const range = () => ({ min: props.min ?? 0, max: props.max ?? 1, step: props.step ?? 0.01 });
  const formatted = () => {
    const { min, max, step } = range();
    return props.value.toFixed(decimalsForStep(step, min, max));
  };
  function render() {
    const { min, max, step } = range();
    const pct = max > min ? Math.max(0, Math.min(100, (props.value - min) / (max - min) * 100)) : 0;
    fill.style.width = `${pct}%`;
    handle.style.left = `max(5px, calc(${pct}% - 9px))`;
    const active = hovered || !!drag;
    const width = wrapper.offsetWidth;
    const dodge = width > 0 && (pct < (18 + label.offsetWidth) / width * 100 || pct > (width - 20 - display.offsetWidth) / width * 100);
    handle.style.opacity = active ? String(dodge ? 0.1 : drag?.moved ? 0.9 : 0.5) : '0';
    handle.style.transform = `translateY(-50%) scale(${active ? 1 : 0.25}, ${active && dodge ? 0.75 : 1})`;
    handle.style.transition = 'opacity 150ms, transform 200ms';
    track.classList.toggle('dialkit-slider-active', active);
    track.setAttribute('aria-label', props.label);
    track.setAttribute('aria-valuemin', String(min));
    track.setAttribute('aria-valuemax', String(max));
    track.setAttribute('aria-valuenow', String(props.value));
    track.setAttribute('aria-valuetext', `${formatted()}${props.unit ? ` ${props.unit}` : ''}`);
    label.textContent = props.label;
    appendShortcut(label, props.shortcut, props.shortcutActive);
    display.textContent = formatted();
    input.setAttribute('aria-label', `${props.label} value`);
    const signature = `${min}:${max}:${step}`;
    if (signature !== hashSignature) {
      hashSignature = signature;
      hashes.replaceChildren();
      const count = (max - min) / step;
      for (let i = 1; i < (count <= 10 ? count : 10); i++) {
        const hash = element('div', 'dialkit-slider-hashmark');
        hash.style.left = `${count <= 10 ? i / count * 100 : i * 10}%`;
        hashes.append(hash);
      }
    }
  }
  const commit = (value: number) => {
    props = { ...props, value };
    render();
    props.onChange(value);
  };
  const position = (x: number) => {
    const { min, max } = range();
    const rect = drag?.rect ?? wrapper.getBoundingClientRect();
    return min + Math.max(0, Math.min(1, (x - rect.left) / (rect.width || 1))) * (max - min);
  };
  function endDrag() {
    const id = drag?.id;
    drag = undefined;
    track.style.width = '';
    track.style.transform = '';
    if (id !== undefined && track.hasPointerCapture(id))
      track.releasePointerCapture(id);
    render();
  }
  function edit() {
    endDrag();
    editing = true;
    input.value = formatted();
    input.style.display = '';
    display.style.display = 'none';
    track.tabIndex = -1;
    input.focus();
    input.select();
  }
  function finishEdit(cancel = false) {
    if (!editing)
      return;
    editing = false;
    const value = input.value.trim() ? Number(input.value) : NaN;
    if (cancel && nudgeOrigin !== undefined) commit(nudgeOrigin);
    else if (!cancel && Number.isFinite(value)) {
      const { min, max, step } = range();
      commit(roundValue(Math.max(min, Math.min(max, value)), step, min, max));
    }
    nudgeOrigin = undefined;
    input.style.display = 'none';
    display.style.display = '';
    track.tabIndex = 0;
    editable = false;
    display.classList.remove('dialkit-slider-value-editable');
  }
  track.addEventListener('keydown', event => {
    const { min, max, step } = range();
    handleSliderKey(event, props.value, min, max, step, commit, edit);
  });
  track.addEventListener('pointerdown', event => {
    if (editing || event.button !== 0)
      return;
    event.preventDefault();
    cancelClick();
    track.focus({ preventScroll: true });
    track.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rect: wrapper.getBoundingClientRect(), moved: false };
    render();
  });
  track.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId)
      return;
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3;
    if (!drag.moved)
      return;
    const { min, max, step } = range();
    const overflow = event.clientX < drag.rect.left ? event.clientX - drag.rect.left : event.clientX > drag.rect.right ? event.clientX - drag.rect.right : 0;
    const stretch = Math.sign(overflow) * 8 * Math.sqrt(Math.min(Math.max(0, Math.abs(overflow) - 32) / 200, 1));
    track.style.width = `calc(100% + ${Math.abs(stretch)}px)`;
    track.style.transform = `translateX(${Math.min(0, stretch)}px)`;
    commit(roundValue(position(event.clientX), step, min, max));
  });
  track.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId)
      return;
    if (!drag.moved) {
      const { min, max, step } = range();
      const raw = position(event.clientX);
      const next = (max - min) / step <= 10 ? min + Math.round((raw - min) / step) * step : snapToDecile(raw, min, max);
      const from = props.value;
      commit(roundValue(next, step, min, max));
      const startPct = (from - min) / (max - min) * 100;
      const endPct = (props.value - min) / (max - min) * 100;
      if (max > min)
        clickAnimations = [
          animateSpring(fill, p => ({ width: `${startPct + (endPct - startPct) * p}%` }), 0.25),
          animateSpring(handle, p => ({ left: `max(5px, calc(${startPct + (endPct - startPct) * p}% - 9px))` }), 0.25),
        ];
    }
    endDrag();
  });
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('lostpointercapture', endDrag);
  track.addEventListener('mouseenter', () => {
    hovered = true;
    render();
  });
  track.addEventListener('mouseleave', () => {
    hovered = false;
    render();
  });
  display.addEventListener('mouseenter', () => {
    timer = setTimeout(() => {
      editable = true;
      display.classList.add('dialkit-slider-value-editable');
    }, 800);
  });
  display.addEventListener('mouseleave', () => {
    clearTimeout(timer);
    editable = false;
    display.classList.remove('dialkit-slider-value-editable');
  });
  display.addEventListener('pointerdown', event => {
    if (editable)
      event.stopPropagation();
  });
  display.addEventListener('click', event => {
    if (editable) {
      event.stopPropagation();
      edit();
    }
  });
  input.addEventListener('pointerdown', event => event.stopPropagation());
  input.addEventListener('keydown', event => {
    event.stopPropagation();
    const { min, max, step } = range();
    if (handleInputNudge(event, input.value, min, max, step, (text, next) => { nudgeOrigin ??= props.value; input.value = text; commit(next); })) return;
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      finishEdit(event.key === 'Escape');
      track.focus({ preventScroll: true });
    }
  });
  input.addEventListener('blur', () => finishEdit());
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      clearTimeout(timer);
      cancelClick();
      endDrag();
      wrapper.remove();
    }
  };
}
export interface TextControlProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}
export function mountTextControl(host: HTMLElement, initial: TextControlProps): Mounted<TextControlProps> {
  let props = initial;
  const row = element('label', 'dialkit-text-control');
  const label = element('span', 'dialkit-text-label');
  const input = element('textarea', 'dialkit-text-input');
  input.rows = 1;
  row.append(label, input);
  host.append(row);
  const size = observeTextSize(input);
  function render() {
    label.textContent = props.label;
    if (input.value !== props.value)
      input.value = props.value;
    input.placeholder = props.placeholder ?? '';
    size.update();
  }
  input.addEventListener('input', () => {
    props = { ...props, value: input.value };
    size.update();
    props.onChange(input.value);
  });
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      size.destroy();
      row.remove();
    }
  };
}
export interface ButtonGroupProps {
  buttons: {
    label: string;
    onClick: () => void;
  }[];
}
export function mountButtonGroup(host: HTMLElement, initial: ButtonGroupProps): Mounted<ButtonGroupProps> {
  const group = element('div', 'dialkit-button-group');
  host.append(group);
  function update(props: ButtonGroupProps) {
    group.replaceChildren(...props.buttons.map(item => {
      const b = element('button', 'dialkit-button', item.label);
      b.addEventListener('click', item.onClick);
      return b;
    }));
  }
  update(initial);
  return {
    update, destroy() {
      group.remove();
    }
  };
}
