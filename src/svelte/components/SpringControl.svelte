<script lang="ts">
  import { SPRING_DEFAULTS, isPhysicsSpring } from 'dialkit/store';
  import type { SpringConfig } from 'dialkit/store';
  import Folder from './Folder.svelte';
  import Slider from './Slider.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import SpringVisualization from './SpringVisualization.svelte';

  let { label, spring, onChange } = $props<{
    panelId: string;
    path: string;
    label: string;
    spring: SpringConfig;
    onChange: (spring: SpringConfig) => void;
  }>();

  // The mode describes the value, so it can't disagree with the value it is read from.
  const isSimpleMode = $derived(!isPhysicsSpring(spring));
  const mode = $derived<'simple' | 'advanced'>(isSimpleMode ? 'simple' : 'advanced');

  const cache: {
    simple: SpringConfig;
    advanced: SpringConfig;
  } = {
    simple: spring.visualDuration !== undefined ? spring : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: spring.stiffness !== undefined ? spring : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  };

  $effect.pre(() => {
    cache[mode] = spring;
  });

  const handleModeChange = (newMode: string) => {
    onChange(cache[newMode as 'simple' | 'advanced']);
  };

  const handleUpdate = (key: keyof SpringConfig, value: number) => {
    if (isSimpleMode) {
      const { stiffness, damping, mass, ...rest } = spring;
      onChange({ ...rest, [key]: value });
    } else {
      const { visualDuration, bounce, ...rest } = spring;
      onChange({ ...rest, [key]: value });
    }
  };
</script>

<Folder title={label} defaultOpen={true}>
  <div style="display: flex; flex-direction: column; gap: 6px;">
    <SpringVisualization {spring} isSimpleMode={isSimpleMode} />

    <div class="dialkit-labeled-control">
      <span class="dialkit-labeled-control-label">Type</span>
      <SegmentedControl
        options={[
          { value: 'simple', label: 'Time' },
          { value: 'advanced', label: 'Physics' },
        ]}
        value={mode}
        onChange={handleModeChange}
      />
    </div>

    {#if isSimpleMode}
      <Slider
        label="Duration"
        value={spring.visualDuration ?? SPRING_DEFAULTS.visualDuration}
        onChange={(v) => handleUpdate('visualDuration', v)}
        min={0.1}
        max={1}
        step={0.05}
        unit="s"
      />
      <Slider
        label="Bounce"
        value={spring.bounce ?? SPRING_DEFAULTS.bounce}
        onChange={(v) => handleUpdate('bounce', v)}
        min={0}
        max={1}
        step={0.05}
      />
    {:else}
      <Slider
        label="Stiffness"
        value={spring.stiffness ?? SPRING_DEFAULTS.stiffness}
        onChange={(v) => handleUpdate('stiffness', v)}
        min={1}
        max={1000}
        step={10}
      />
      <Slider
        label="Damping"
        value={spring.damping ?? SPRING_DEFAULTS.damping}
        onChange={(v) => handleUpdate('damping', v)}
        min={1}
        max={100}
        step={1}
      />
      <Slider
        label="Mass"
        value={spring.mass ?? SPRING_DEFAULTS.mass}
        onChange={(v) => handleUpdate('mass', v)}
        min={0.1}
        max={10}
        step={0.1}
      />
    {/if}
  </div>
</Folder>
