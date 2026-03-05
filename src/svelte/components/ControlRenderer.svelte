<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { ControlMeta, DialValue, SpringConfig, TransitionConfig } from 'dialkit/store';
  import Slider from './Slider.svelte';
  import Toggle from './Toggle.svelte';
  import Folder from './Folder.svelte';
  import SpringControl from './SpringControl.svelte';
  import TransitionControl from './TransitionControl.svelte';
  import TextControl from './TextControl.svelte';
  import SelectControl from './SelectControl.svelte';
  import ColorControl from './ColorControl.svelte';
  import ControlRenderer from './ControlRenderer.svelte';

  let { panelId, control, values } = $props<{
    panelId: string;
    control: ControlMeta;
    values: Record<string, DialValue>;
  }>();

  const controlValue = $derived(values[control.path]);
</script>

{#if control.type === 'slider'}
  <Slider
    label={control.label}
    value={controlValue as number}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
    min={control.min}
    max={control.max}
    step={control.step}
  />
{:else if control.type === 'toggle'}
  <Toggle
    label={control.label}
    checked={controlValue as boolean}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
  />
{:else if control.type === 'spring'}
  <SpringControl
    {panelId}
    path={control.path}
    label={control.label}
    spring={controlValue as SpringConfig}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
  />
{:else if control.type === 'transition'}
  <TransitionControl
    {panelId}
    path={control.path}
    label={control.label}
    value={controlValue as TransitionConfig}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
  />
{:else if control.type === 'folder'}
  <Folder title={control.label} defaultOpen={control.defaultOpen ?? true}>
    {#each control.children ?? [] as child (child.path)}
      <ControlRenderer {panelId} control={child} {values} />
    {/each}
  </Folder>
{:else if control.type === 'text'}
  <TextControl
    label={control.label}
    value={controlValue as string}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
    placeholder={control.placeholder}
  />
{:else if control.type === 'select'}
  <SelectControl
    label={control.label}
    value={controlValue as string}
    options={control.options ?? []}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
  />
{:else if control.type === 'color'}
  <ColorControl
    label={control.label}
    value={controlValue as string}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
  />
{:else if control.type === 'action'}
  <button class="dialkit-button" onclick={() => DialStore.triggerAction(panelId, control.path)}>
    {control.label}
  </button>
{/if}
