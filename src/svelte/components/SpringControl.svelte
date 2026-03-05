<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { SpringConfig } from 'dialkit/store';
  import Folder from './Folder.svelte';
  import Slider from './Slider.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import SpringVisualization from './SpringVisualization.svelte';

  let { panelId, path, label, spring, onChange } = $props<{
    panelId: string;
    path: string;
    label: string;
    spring: SpringConfig;
    onChange: (spring: SpringConfig) => void;
  }>();

  let mode = $state<'simple' | 'advanced'>(DialStore.getSpringMode(panelId, path));

  $effect(() => {
    const unsub = DialStore.subscribe(panelId, () => {
      mode = DialStore.getSpringMode(panelId, path);
    });
    return unsub;
  });

  const isSimpleMode = $derived(mode === 'simple');

  const handleModeChange = (newMode: string) => {
    const typedMode = newMode as 'simple' | 'advanced';
    DialStore.updateSpringMode(panelId, path, typedMode);

    if (typedMode === 'simple') {
      const { stiffness, damping, mass, ...rest } = spring;
      onChange({
        ...rest,
        type: 'spring',
        visualDuration: spring.visualDuration ?? 0.3,
        bounce: spring.bounce ?? 0.2,
      });
    } else {
      const { visualDuration, bounce, ...rest } = spring;
      onChange({
        ...rest,
        type: 'spring',
        stiffness: spring.stiffness ?? 200,
        damping: spring.damping ?? 25,
        mass: spring.mass ?? 1,
      });
    }
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
        value={spring.visualDuration ?? 0.3}
        onChange={(v) => handleUpdate('visualDuration', v)}
        min={0.1}
        max={1}
        step={0.05}
        unit="s"
      />
      <Slider
        label="Bounce"
        value={spring.bounce ?? 0.2}
        onChange={(v) => handleUpdate('bounce', v)}
        min={0}
        max={1}
        step={0.05}
      />
    {:else}
      <Slider
        label="Stiffness"
        value={spring.stiffness ?? 400}
        onChange={(v) => handleUpdate('stiffness', v)}
        min={1}
        max={1000}
        step={10}
      />
      <Slider
        label="Damping"
        value={spring.damping ?? 17}
        onChange={(v) => handleUpdate('damping', v)}
        min={1}
        max={100}
        step={1}
      />
      <Slider
        label="Mass"
        value={spring.mass ?? 1}
        onChange={(v) => handleUpdate('mass', v)}
        min={0.1}
        max={10}
        step={0.1}
      />
    {/if}
  </div>
</Folder>
