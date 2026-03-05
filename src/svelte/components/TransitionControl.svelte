<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { EasingConfig, SpringConfig, TransitionConfig } from 'dialkit/store';
  import Folder from './Folder.svelte';
  import Slider from './Slider.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import SpringVisualization from './SpringVisualization.svelte';
  import EasingVisualization from './EasingVisualization.svelte';

  type CurveMode = 'easing' | 'simple' | 'advanced';

  let { panelId, path, label, value, onChange } = $props<{
    panelId: string;
    path: string;
    label: string;
    value: TransitionConfig;
    onChange: (value: TransitionConfig) => void;
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

  const spring = $derived<SpringConfig>(
    value.type === 'spring'
      ? value
      : { type: 'spring', visualDuration: 0.3, bounce: 0.2 }
  );

  const easing = $derived<EasingConfig>(
    value.type === 'easing'
      ? value
      : { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] }
  );

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
      const duration = value.type === 'spring' ? (value.visualDuration ?? 0.3) : value.duration;
      onChange({ type: 'easing', duration, ease: easing.ease });
      return;
    }

    if (typed === 'simple') {
      onChange({
        type: 'spring',
        visualDuration: spring.visualDuration ?? (value.type === 'easing' ? value.duration : 0.3),
        bounce: spring.bounce ?? 0.2,
      });
      return;
    }

    onChange({
      type: 'spring',
      stiffness: spring.stiffness ?? 200,
      damping: spring.damping ?? 25,
      mass: spring.mass ?? 1,
    });
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
      <Slider label="x1" value={easing.ease[0]} onChange={(v) => updateEase(0, v)} min={0} max={1} step={0.01} />
      <Slider label="y1" value={easing.ease[1]} onChange={(v) => updateEase(1, v)} min={-1} max={2} step={0.01} />
      <Slider label="x2" value={easing.ease[2]} onChange={(v) => updateEase(2, v)} min={0} max={1} step={0.01} />
      <Slider label="y2" value={easing.ease[3]} onChange={(v) => updateEase(3, v)} min={-1} max={2} step={0.01} />
      <Slider label="Duration" value={easing.duration} onChange={(v) => onChange({ ...easing, duration: v })} min={0.1} max={2} step={0.05} unit="s" />

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
        label="Duration"
        value={spring.visualDuration ?? 0.3}
        onChange={(v) => handleSpringUpdate('visualDuration', v)}
        min={0.1}
        max={1}
        step={0.05}
        unit="s"
      />
      <Slider
        label="Bounce"
        value={spring.bounce ?? 0.2}
        onChange={(v) => handleSpringUpdate('bounce', v)}
        min={0}
        max={1}
        step={0.05}
      />
    {:else}
      <Slider
        label="Stiffness"
        value={spring.stiffness ?? 400}
        onChange={(v) => handleSpringUpdate('stiffness', v)}
        min={1}
        max={1000}
        step={10}
      />
      <Slider
        label="Damping"
        value={spring.damping ?? 17}
        onChange={(v) => handleSpringUpdate('damping', v)}
        min={1}
        max={100}
        step={1}
      />
      <Slider
        label="Mass"
        value={spring.mass ?? 1}
        onChange={(v) => handleSpringUpdate('mass', v)}
        min={0.1}
        max={10}
        step={0.1}
      />
    {/if}
  </div>
</Folder>
