import { DialStore, type SpringConfig, type EasingConfig, type TransitionConfig } from '../store/DialStore';
import { mountEasingVisualization } from '../easing-control';
import { formatEase, parseEase } from '../easing-geometry';
import { springParams, springProgress } from '../transition-math';
import { getActiveElement } from '../shortcut-utils';
import { mountFolder, mountSegmentedControl, mountSlider, type SliderProps } from './controls';
import { element, svg, type Mounted } from './dom';
export interface SpringVisualizationProps {
  spring: SpringConfig;
  isSimpleMode: boolean;
}
export function mountSpringVisualization(host: HTMLElement, initial: SpringVisualizationProps): Mounted<SpringVisualizationProps> {
  const root = svg('svg', { viewBox: '0 0 256 140', class: 'dialkit-spring-viz', role: 'img', 'aria-label': 'Spring response curve' });
  for (let i = 1; i < 4; i++) {
    root.append(svg('line', { x1: i * 64, y1: 0, x2: i * 64, y2: 140, stroke: 'var(--dial-surface-active)' }), svg('line', { x1: 0, y1: i * 35, x2: 256, y2: i * 35, stroke: 'var(--dial-surface-active)' }));
  }
  root.append(svg('line', { x1: 0, y1: 70, x2: 256, y2: 70, stroke: 'var(--dial-border-hover)', 'stroke-dasharray': '4,4' }));
  const path = svg('path', { fill: 'none', stroke: 'var(--dial-text-label)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  root.append(path);
  host.append(root);
  function update({ spring, isSimpleMode }: SpringVisualizationProps) {
    const params = springParams(isSimpleMode ? { type: 'spring', visualDuration: spring.visualDuration ?? 0.3, bounce: spring.bounce ?? 0.2 } : { type: 'spring', stiffness: spring.stiffness ?? 400, damping: spring.damping ?? 17, mass: spring.mass ?? 1 });
    const values = Array.from({ length: 101 }, (_, i) => springProgress(i / 50, params));
    const min = Math.min(...values), range = Math.max(...values) - min || 1;
    path.setAttribute('d', values.map((v, i) => `${i ? 'L' : 'M'} ${i * 2.56} ${140 - ((v - min) / range * 84 + 28)}`).join(' '));
  }
  update(initial);
  return {
    update, destroy() {
      root.remove();
    }
  };
}
export interface TransitionControlProps {
  panelId: string;
  path: string;
  label: string;
  value: TransitionConfig;
  onChange: (value: TransitionConfig) => void;
  hideDuration?: boolean;
  durationControl?: {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  };
}
export function mountTransitionControl(host: HTMLElement, initial: TransitionControlProps, springOnly = false): Mounted<TransitionControlProps> {
  let props = initial;
  const folder = mountFolder(host, { title: props.label });
  const body = element('div');
  Object.assign(body.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
  folder.body.append(body);
  type Mode = 'easing' | 'simple' | 'advanced';
  let mode: Mode;
  let controls: {
    destroy(): void;
  }[] = [];
  let refresh = () => {
  };
  const cache: {
    easing: EasingConfig;
    simple: SpringConfig;
    advanced: SpringConfig;
  } = {
    easing: props.value.type === 'easing' ? props.value : { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] },
    simple: props.value.type === 'spring' && props.value.visualDuration !== undefined ? props.value : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: props.value.type === 'spring' && props.value.stiffness !== undefined ? props.value : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  };
  const currentMode = (): Mode => springOnly ? DialStore.getSpringMode(props.panelId, props.path) : DialStore.getTransitionMode(props.panelId, props.path);
  function render() {
    const nextMode = currentMode();
    if (nextMode === 'easing' && props.value.type === 'easing')
      cache.easing = props.value;
    if (nextMode !== 'easing' && props.value.type === 'spring')
      cache[nextMode] = props.value;
    if (mode !== nextMode) {
      mode = nextMode;
      rebuild();
    }
    folder.update({ title: props.label });
    refresh();
  }
  function rebuild() {
    controls.forEach(c => c.destroy());
    controls = [];
    body.replaceChildren();
    const updates: (() => void)[] = [];
    const change = (value: TransitionConfig) => props.onChange(value);
    if (mode === 'easing') {
      const vizProps = () => ({ easing: cache.easing, onChange: (ease: EasingConfig['ease']) => change({ ...cache.easing, ease }) });
      const viz = mountEasingVisualization(body, vizProps());
      controls.push(viz);
      updates.push(() => viz.update(vizProps()));
    }
    else {
      const vizProps = () => ({ spring: cache[mode as 'simple' | 'advanced'], isSimpleMode: mode === 'simple' });
      const viz = mountSpringVisualization(body, vizProps());
      controls.push(viz);
      updates.push(() => viz.update(vizProps()));
    }
    const typeRow = element('div', 'dialkit-labeled-control');
    typeRow.append(element('span', 'dialkit-labeled-control-label', 'Type'));
    body.append(typeRow);
    const segment = mountSegmentedControl<Mode>(typeRow, {
      options: [...(springOnly ? [] : [{ value: 'easing' as const, label: 'Easing' }]), { value: 'simple', label: 'Time' }, { value: 'advanced', label: 'Physics' }], value: mode, onChange(next) {
        const value = { ...cache[next] } as TransitionConfig;
        // Store notifications are synchronous; retain the target before changing modes.
        if (springOnly)
          DialStore.updateSpringMode(props.panelId, props.path, next as 'simple' | 'advanced');
        else
          DialStore.updateTransitionMode(props.panelId, props.path, next);
        props.onChange(value);
      }
    });
    controls.push(segment);
    function slider(label: string, key: string, fallback: number, min: number, max: number, step: number, duration = false) {
      const getProps = (): SliderProps => {
        const value = cache[mode] as unknown as Record<string, number>;
        const external = duration ? props.durationControl : undefined;
        return {
          label, value: external?.value ?? value[key] ?? fallback, min: external?.min ?? min, max: external?.max ?? max, step: external?.step ?? step, unit: duration ? 's' : undefined,
          onChange: external?.onChange ?? (v => {
            const next = { ...cache[mode], [key]: v };
            if (mode === 'simple') {
              delete (next as SpringConfig).stiffness;
              delete (next as SpringConfig).damping;
              delete (next as SpringConfig).mass;
            }
            else if (mode === 'advanced') {
              delete (next as SpringConfig).visualDuration;
              delete (next as SpringConfig).bounce;
            }
            change(next);
          })
        };
      };
      const control = mountSlider(body, getProps());
      controls.push(control);
      updates.push(() => control.update(getProps()));
    }
    if (mode === 'easing') {
      const row = element('div', 'dialkit-labeled-control');
      row.append(element('span', 'dialkit-labeled-control-label', 'Ease'));
      const input = element('input', 'dialkit-text-input');
      input.setAttribute('aria-label', 'Bézier coordinates');
      input.spellcheck = false;
      row.append(input);
      body.append(row);
      const commit = () => {
        const ease = parseEase(input.value);
        if (ease)
          change({ ...cache.easing, ease });
        input.value = formatEase(cache.easing.ease);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape')
          input.value = formatEase(cache.easing.ease);
        if (event.key === 'Escape' || event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        }
        event.stopPropagation();
      });
      updates.push(() => {
        if (getActiveElement(input) !== input)
          input.value = formatEase(cache.easing.ease);
      });
    }
    else if (mode === 'simple') {
      if (springOnly && !props.hideDuration)
        slider('Duration', 'visualDuration', 0.3, 0.1, 1, 0.05, true);
      slider('Bounce', 'bounce', 0.2, 0, 1, 0.05);
    }
    else {
      slider('Stiffness', 'stiffness', 400, 1, 1000, 10);
      slider('Damping', 'damping', 17, 1, 100, 1);
      slider('Mass', 'mass', 1, 0.1, 10, 0.1);
    }
    if (!springOnly && !props.hideDuration && mode !== 'advanced')
      slider('Duration', mode === 'easing' ? 'duration' : 'visualDuration', 0.3, 0.1, mode === 'easing' ? 2 : 1, 0.05, true);
    refresh = () => updates.forEach(update => update());
  }
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      controls.forEach(c => c.destroy());
      folder.destroy();
    }
  };
}
export interface SpringControlProps {
  panelId: string;
  path: string;
  label: string;
  spring: SpringConfig;
  onChange: (value: SpringConfig) => void;
}
export function mountSpringControl(host: HTMLElement, props: SpringControlProps): Mounted<SpringControlProps> {
  const convert = (p: SpringControlProps): TransitionControlProps => ({ ...p, value: p.spring, onChange: value => p.onChange(value as SpringConfig) });
  const mounted = mountTransitionControl(host, convert(props), true);
  return {
    update(next) {
      mounted.update(convert(next));
    }, destroy: mounted.destroy
  };
}
