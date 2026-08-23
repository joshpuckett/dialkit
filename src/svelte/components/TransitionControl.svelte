<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { EasingConfig, SpringConfig, TransitionConfig } from 'dialkit/store';
  import Folder from './Folder.svelte';
  import Slider from './Slider.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import SpringVisualization from './SpringVisualization.svelte';
  import EasingVisualization from './EasingVisualization.svelte';
  import MidiBadge from './MidiBadge.svelte';
  import type { MidiController, MidiMappingOwner } from 'dialkit/midi';

  type CurveMode = 'easing' | 'simple' | 'advanced';

  export type TransitionDurationControl = {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  };

  let { panelId, path, label, value, onChange, hideDuration = false, durationControl, midi, midiOwner } = $props<{
    panelId: string;
    path: string;
    label: string;
    value: TransitionConfig;
    onChange: (value: TransitionConfig) => void;
    hideDuration?: boolean;
    durationControl?: TransitionDurationControl;
    midi?: MidiController;
    midiOwner?: MidiMappingOwner;
  }>();

  let mode = $state<CurveMode>(DialStore.getTransitionMode(panelId, path));
  let editingEase = $state(false);
  let easeDraft = $state('');

  $effect(() => {
    const unsub = DialStore.subscribe(panelId, () => {
      mode = DialStore.getTransitionMode(panelId, path);
    });
    return unsub;
  });

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
  $effect(() => {
    if (isEasing && value.type === 'easing') {
      cache.easing = value;
    } else if (isSimpleSpring && value.type === 'spring') {
      cache.simple = value;
    } else if (mode === 'advanced' && value.type === 'spring') {
      cache.advanced = value;
    }
  });

  const formatEase = (ease: [number, number, number, number]) =>
    ease.map((v) => Number(v.toFixed(2))).join(', ');

  const parseEase = (text: string): [number, number, number, number] | null => {
    const parts = text.split(',').map((s) => Number.parseFloat(s.trim()));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    return parts as [number, number, number, number];
  };

  const handleModeChange = (nextMode: string) => {
    const typed = nextMode as CurveMode;
    DialStore.updateTransitionMode(panelId, path, typed);

    if (typed === 'easing') {
      onChange(cache.easing);
    } else if (typed === 'simple') {
      onChange(cache.simple);
    } else {
      onChange(cache.advanced);
    }
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

  const updateEase = (index: number, val: number) => {
    const next = [...easing.ease] as [number, number, number, number];
    next[index] = val;
    onChange({ ...easing, ease: next });
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
      <EasingVisualization {easing} />
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
      <Slider label="x1" value={easing.ease[0]} onChange={(v) => updateEase(0, v)} min={0} max={1} step={0.01}>
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.x1`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
      <Slider label="y1" value={easing.ease[1]} onChange={(v) => updateEase(1, v)} min={-1} max={2} step={0.01}>
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.y1`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
      <Slider label="x2" value={easing.ease[2]} onChange={(v) => updateEase(2, v)} min={0} max={1} step={0.01}>
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.x2`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
      <Slider label="y2" value={easing.ease[3]} onChange={(v) => updateEase(3, v)} min={-1} max={2} step={0.01}>
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.y2`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>

      <div class="dialkit-labeled-control">
        <span class="dialkit-labeled-control-label">Ease</span>
        <input
          type="text"
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
        value={spring.bounce ?? 0.2}
        onChange={(v) => handleSpringUpdate('bounce', v)}
        min={0}
        max={1}
        step={0.05}
      >
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.bounce`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
    {:else}
      <Slider
        label="Stiffness"
        value={spring.stiffness ?? 400}
        onChange={(v) => handleSpringUpdate('stiffness', v)}
        min={1}
        max={1000}
        step={10}
      >
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.stiffness`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
      <Slider
        label="Damping"
        value={spring.damping ?? 17}
        onChange={(v) => handleSpringUpdate('damping', v)}
        min={1}
        max={100}
        step={1}
      >
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.damping`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
      <Slider
        label="Mass"
        value={spring.mass ?? 1}
        onChange={(v) => handleSpringUpdate('mass', v)}
        min={0.1}
        max={10}
        step={0.1}
      >
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.mass`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
    {/if}

    {#if !hideDuration && (isEasing || isSimpleSpring)}
      <Slider
        label="Duration"
        value={durationControl?.value ?? (isEasing ? easing.duration : spring.visualDuration ?? 0.3)}
        onChange={durationControl?.onChange ?? ((next) => {
          if (isEasing) onChange({ ...easing, duration: next });
          else handleSpringUpdate('visualDuration', next);
        })}
        min={durationControl?.min ?? 0.1}
        max={durationControl?.max ?? (isEasing ? 2 : 1)}
        step={durationControl?.step ?? 0.05}
        unit="s"
      >
        {#snippet midiSlot()}{#if midi}<MidiBadge controller={midi} {panelId} path={`${path}.duration`} ownerToken={midiOwner} />{/if}{/snippet}
      </Slider>
    {/if}
  </div>
</Folder>
