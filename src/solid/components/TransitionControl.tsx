import { createSignal, Show, type JSX } from 'solid-js';
import { DialStore } from '../../store/DialStore';
import type { EasingConfig, SpringConfig, TransitionConfig } from '../../store/DialStore';
import { fromStore } from '../primitives';
import { EasingVisualization } from './EasingVisualization';
import { Folder } from './Folder';
import { SegmentedControl } from './SegmentedControl';
import { Slider } from './Slider';
import { SpringVisualization } from './SpringVisualization';

export interface TransitionDurationControl {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

interface TransitionControlProps {
  panelId: string;
  path: string;
  label: string;
  value: TransitionConfig;
  onChange: (value: TransitionConfig) => void;
  hideDuration?: boolean;
  durationControl?: TransitionDurationControl;
  midiSlot?: (path: string) => JSX.Element;
}

type CurveMode = 'easing' | 'simple' | 'advanced';

export function TransitionControl(props: TransitionControlProps) {
  const mode = fromStore(
    () => DialStore.getTransitionMode(props.panelId, props.path),
    (notify) => DialStore.subscribe(props.panelId, notify)
  );
  const [editingEase, setEditingEase] = createSignal(false);
  const [easeDraft, setEaseDraft] = createSignal('');
  const cache: { easing: EasingConfig; simple: SpringConfig; advanced: SpringConfig } = {
    easing: props.value.type === 'easing'
      ? props.value
      : { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] },
    simple: props.value.type === 'spring' && props.value.visualDuration !== undefined
      ? props.value
      : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: props.value.type === 'spring' && props.value.stiffness !== undefined
      ? props.value
      : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  };

  const isEasing = () => mode() === 'easing';
  const isSimple = () => mode() === 'simple';
  const spring = () => {
    if (props.value.type === 'spring') {
      if (isSimple()) cache.simple = props.value;
      else if (mode() === 'advanced') cache.advanced = props.value;
      return props.value;
    }
    return cache.simple;
  };
  const easing = () => {
    if (props.value.type === 'easing') {
      cache.easing = props.value;
      return props.value;
    }
    return cache.easing;
  };

  const handleModeChange = (next: CurveMode) => {
    DialStore.updateTransitionMode(props.panelId, props.path, next);
    props.onChange(next === 'easing' ? cache.easing : next === 'simple' ? cache.simple : cache.advanced);
  };

  const handleSpringUpdate = (key: keyof SpringConfig, value: number) => {
    const current = spring();
    if (isSimple()) {
      const { stiffness, damping, mass, ...rest } = current;
      props.onChange({ ...rest, [key]: value });
    } else {
      const { visualDuration, bounce, ...rest } = current;
      props.onChange({ ...rest, [key]: value });
    }
  };

  const updateEase = (index: number, value: number) => {
    const current = easing();
    const next = [...current.ease] as [number, number, number, number];
    next[index] = value;
    props.onChange({ ...current, ease: next });
  };

  const formatEase = (value: [number, number, number, number]) =>
    value.map((part) => Number(part.toFixed(2))).join(', ');
  const commitEase = () => {
    const parts = easeDraft().split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      props.onChange({ ...easing(), ease: parts as [number, number, number, number] });
    }
    setEditingEase(false);
  };

  const durationSlider = () => {
    if (props.hideDuration || (!isEasing() && !isSimple())) return null;
    const external = props.durationControl;
    return (
      <Slider
        label="Duration"
        value={external?.value ?? (isEasing() ? easing().duration : spring().visualDuration ?? 0.3)}
        onChange={external?.onChange ?? ((value) => {
          if (isEasing()) props.onChange({ ...easing(), duration: value });
          else handleSpringUpdate('visualDuration', value);
        })}
        min={external?.min ?? 0.1}
        max={external?.max ?? (isEasing() ? 2 : 1)}
        step={external?.step ?? 0.05}
        unit="s"
        midiSlot={props.midiSlot?.(`${props.path}.duration`)}
      />
    );
  };

  return (
    <Folder title={props.label} defaultOpen={true}>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <Show when={isEasing()} fallback={<SpringVisualization spring={spring()} isSimpleMode={isSimple()} />}>
          <EasingVisualization easing={easing()} />
        </Show>

        <div class="dialkit-labeled-control">
          <span class="dialkit-labeled-control-label">Type</span>
          <SegmentedControl
            options={[
              { value: 'easing', label: 'Easing' },
              { value: 'simple', label: 'Time' },
              { value: 'advanced', label: 'Physics' },
            ]}
            value={mode()}
            onChange={handleModeChange}
          />
        </div>

        <Show when={isEasing()}>
          <Slider label="x1" value={easing().ease[0]} onChange={(value) => updateEase(0, value)} min={0} max={1} step={0.01} midiSlot={props.midiSlot?.(`${props.path}.x1`)} />
          <Slider label="y1" value={easing().ease[1]} onChange={(value) => updateEase(1, value)} min={-1} max={2} step={0.01} midiSlot={props.midiSlot?.(`${props.path}.y1`)} />
          <Slider label="x2" value={easing().ease[2]} onChange={(value) => updateEase(2, value)} min={0} max={1} step={0.01} midiSlot={props.midiSlot?.(`${props.path}.x2`)} />
          <Slider label="y2" value={easing().ease[3]} onChange={(value) => updateEase(3, value)} min={-1} max={2} step={0.01} midiSlot={props.midiSlot?.(`${props.path}.y2`)} />
          <div class="dialkit-labeled-control">
            <span class="dialkit-labeled-control-label">Ease</span>
            <input
              type="text"
              class="dialkit-text-input"
              value={editingEase() ? easeDraft() : formatEase(easing().ease)}
              onInput={(event) => setEaseDraft(event.currentTarget.value)}
              onFocus={() => {
                setEaseDraft(formatEase(easing().ease));
                setEditingEase(true);
              }}
              onBlur={commitEase}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              spellcheck={false}
            />
          </div>
        </Show>

        <Show when={isSimple()}>
          <Slider label="Bounce" value={spring().bounce ?? 0.2} onChange={(value) => handleSpringUpdate('bounce', value)} min={0} max={1} step={0.05} midiSlot={props.midiSlot?.(`${props.path}.bounce`)} />
        </Show>
        <Show when={!isEasing() && !isSimple()}>
          <Slider label="Stiffness" value={spring().stiffness ?? 400} onChange={(value) => handleSpringUpdate('stiffness', value)} min={1} max={1000} step={10} midiSlot={props.midiSlot?.(`${props.path}.stiffness`)} />
          <Slider label="Damping" value={spring().damping ?? 17} onChange={(value) => handleSpringUpdate('damping', value)} min={1} max={100} step={1} midiSlot={props.midiSlot?.(`${props.path}.damping`)} />
          <Slider label="Mass" value={spring().mass ?? 1} onChange={(value) => handleSpringUpdate('mass', value)} min={0.1} max={10} step={0.1} midiSlot={props.midiSlot?.(`${props.path}.mass`)} />
        </Show>
        {durationSlider()}
      </div>
    </Folder>
  );
}
