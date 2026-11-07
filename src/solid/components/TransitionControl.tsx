import { formatEase, parseEase } from '../../easing-geometry';
import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { isPhysicsSpring, SPRING_DEFAULTS, transitionModeOf } from '../../store/DialStore';
import type { EasingConfig, SpringConfig, TransitionConfig } from '../../store/DialStore';
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
}

type CurveMode = 'easing' | 'simple' | 'advanced';

export function TransitionControl(props: TransitionControlProps) {
  // Read from the value: a store subscription can fire before the prop updates.
  const mode = createMemo<CurveMode>(() => transitionModeOf(props.value));
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

  // Cache per-mode values so switching back restores previous edits
  createEffect(() => {
    const value = props.value;
    if (value.type === 'easing') cache.easing = value;
    else if (isPhysicsSpring(value)) cache.advanced = value;
    else cache.simple = value;
  });

  const isEasing = () => mode() === 'easing';
  const isSimple = () => mode() === 'simple';
  const spring = (): SpringConfig => (props.value.type === 'spring' ? props.value : cache.simple);
  const easing = (): EasingConfig => (props.value.type === 'easing' ? props.value : cache.easing);

  // The mode follows the value, so switching mode is writing that mode's value.
  const handleModeChange = (next: CurveMode) => props.onChange(cache[next]);

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

  const commitEase = () => {
    const parts = parseEase(easeDraft());
    if (parts) {
      props.onChange({ ...easing(), ease: parts as [number, number, number, number] });
    }
    setEditingEase(false);
  };

  return (
    <Folder title={props.label} defaultOpen={true}>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <Show when={isEasing()} fallback={<SpringVisualization spring={spring()} isSimpleMode={isSimple()} />}>
          <EasingVisualization easing={easing()} onChange={(ease) => props.onChange({ ...easing(), ease })} />
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
          <div class="dialkit-labeled-control">
            <span class="dialkit-labeled-control-label">Ease</span>
            <input
              type="text"
              aria-label="Bézier coordinates"
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
          <Slider label="Bounce" value={spring().bounce ?? SPRING_DEFAULTS.bounce} onChange={(value) => handleSpringUpdate('bounce', value)} min={0} max={1} step={0.05} />
        </Show>
        <Show when={!isEasing() && !isSimple()}>
          <Slider label="Stiffness" value={spring().stiffness ?? SPRING_DEFAULTS.stiffness} onChange={(value) => handleSpringUpdate('stiffness', value)} min={1} max={1000} step={10} />
          <Slider label="Damping" value={spring().damping ?? SPRING_DEFAULTS.damping} onChange={(value) => handleSpringUpdate('damping', value)} min={1} max={100} step={1} />
          <Slider label="Mass" value={spring().mass ?? SPRING_DEFAULTS.mass} onChange={(value) => handleSpringUpdate('mass', value)} min={0.1} max={10} step={0.1} />
        </Show>
        <Show when={!props.hideDuration && (isEasing() || isSimple())}>
          <Slider
            label="Duration"
            value={props.durationControl?.value ?? (isEasing() ? easing().duration : spring().visualDuration ?? SPRING_DEFAULTS.visualDuration)}
            onChange={(value) => {
              if (props.durationControl) props.durationControl.onChange(value);
              else if (isEasing()) props.onChange({ ...easing(), duration: value });
              else handleSpringUpdate('visualDuration', value);
            }}
            min={props.durationControl?.min ?? 0.1}
            max={props.durationControl?.max ?? (isEasing() ? 2 : 1)}
            step={props.durationControl?.step ?? 0.05}
            unit="s"
          />
        </Show>
      </div>
    </Folder>
  );
}
