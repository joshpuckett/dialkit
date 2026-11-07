<script lang="ts">
  import { formatEase, parseEase } from '../../easing-geometry';
  import { SPRING_DEFAULTS, isPhysicsSpring, transitionModeOf } from 'dialkit/store';
  import type { EasingConfig, SpringConfig, TransitionConfig } from 'dialkit/store';
  import Folder from './Folder.svelte';
  import Slider from './Slider.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import SpringVisualization from './SpringVisualization.svelte';
  import EasingVisualization from './EasingVisualization.svelte';

  type CurveMode = 'easing' | 'simple' | 'advanced';

  export type TransitionDurationControl = {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  };

  let { label, value, onChange, hideDuration = false, durationControl } = $props<{
    panelId: string;
    path: string;
    label: string;
    value: TransitionConfig;
    onChange: (value: TransitionConfig) => void;
    hideDuration?: boolean;
    durationControl?: TransitionDurationControl;
  }>();

  // The mode describes the value, so it can't disagree with the value it is read from.
  const mode = $derived<CurveMode>(transitionModeOf(value));
  let editingEase = $state(false);
  let easeDraft = $state('');

  const isEasing = $derived(mode === 'easing');
  const isSimpleSpring = $derived(mode === 'simple');

  const cache: {
    easing: EasingConfig;
    simple: SpringConfig;
    advanced: SpringConfig;
  } = {
    easing: value.type === 'easing' ? value : { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] },
    simple: value.type === 'spring' && value.visualDuration !== undefined ? value : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: value.type === 'spring' && value.stiffness !== undefined ? value : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  };

  const spring = $derived<SpringConfig>(
    value.type === 'spring' ? value : cache.simple
  );

  const easing = $derived<EasingConfig>(
    value.type === 'easing' ? value : cache.easing
  );

  // Keep cache updated with current edits
  $effect.pre(() => {
    const current: TransitionConfig = value;
    if (current.type === 'easing') cache.easing = current;
    else if (isPhysicsSpring(current)) cache.advanced = current;
    else cache.simple = current;
  });

  // The mode follows the value, so switching mode is writing that mode's value.
  const handleModeChange = (nextMode: string) => {
    onChange(cache[nextMode as CurveMode]);
  };

  const handleSpringUpdate = (key: keyof SpringConfig, val: number) => {
    if (isSimpleSpring) {
      const { stiffness, damping, mass, ...rest } = spring;
      onChange({ ...rest, [key]: val });
    } else {
      const { visualDuration, bounce, ...rest } = spring;
      onChange({ ...rest, [key]: val });
    }
  };

  const handleEaseFocus = () => {
    easeDraft = formatEase(easing.ease);
    editingEase = true;
  };

  const handleEaseBlur = () => {
    const parsed = parseEase(easeDraft);
    if (parsed) onChange({ ...easing, ease: parsed });
    editingEase = false;
  };
</script>

<Folder title={label} defaultOpen={true}>
  <div style="display: flex; flex-direction: column; gap: 6px;">
    {#if isEasing}
      <EasingVisualization {easing} onChange={(ease) => onChange({ ...easing, ease })} />
    {:else}
      <SpringVisualization spring={spring} isSimpleMode={isSimpleSpring} />
    {/if}

    <div class="dialkit-labeled-control">
      <span class="dialkit-labeled-control-label">Type</span>
      <SegmentedControl
        options={[
          { value: 'easing', label: 'Easing' },
          { value: 'simple', label: 'Time' },
          { value: 'advanced', label: 'Physics' },
        ]}
        value={mode}
        onChange={handleModeChange}
      />
    </div>

    {#if isEasing}

      <div class="dialkit-labeled-control">
        <span class="dialkit-labeled-control-label">Ease</span>
        <input
          type="text"
          aria-label="Bézier coordinates"
          class="dialkit-text-input"
          value={editingEase ? easeDraft : formatEase(easing.ease)}
          oninput={(e) => (easeDraft = (e.currentTarget as HTMLInputElement).value)}
          onfocus={handleEaseFocus}
          onblur={handleEaseBlur}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          spellcheck={false}
        />
      </div>
    {:else if isSimpleSpring}
      <Slider
        label="Bounce"
        value={spring.bounce ?? SPRING_DEFAULTS.bounce}
        onChange={(v) => handleSpringUpdate('bounce', v)}
        min={0}
        max={1}
        step={0.05}
      />
    {:else}
      <Slider
        label="Stiffness"
        value={spring.stiffness ?? SPRING_DEFAULTS.stiffness}
        onChange={(v) => handleSpringUpdate('stiffness', v)}
        min={1}
        max={1000}
        step={10}
      />
      <Slider
        label="Damping"
        value={spring.damping ?? SPRING_DEFAULTS.damping}
        onChange={(v) => handleSpringUpdate('damping', v)}
        min={1}
        max={100}
        step={1}
      />
      <Slider
        label="Mass"
        value={spring.mass ?? SPRING_DEFAULTS.mass}
        onChange={(v) => handleSpringUpdate('mass', v)}
        min={0.1}
        max={10}
        step={0.1}
      />
    {/if}

    {#if !hideDuration && (isEasing || isSimpleSpring)}
      <Slider
        label="Duration"
        value={durationControl?.value ?? (isEasing ? easing.duration : spring.visualDuration ?? SPRING_DEFAULTS.visualDuration)}
        onChange={durationControl?.onChange ?? ((next) => {
          if (isEasing) onChange({ ...easing, duration: next });
          else handleSpringUpdate('visualDuration', next);
        })}
        min={durationControl?.min ?? 0.1}
        max={durationControl?.max ?? (isEasing ? 2 : 1)}
        step={durationControl?.step ?? 0.05}
        unit="s"
      />
    {/if}
  </div>
</Folder>
