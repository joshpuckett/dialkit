<script lang="ts">
  import { getContext } from 'svelte';
  import { DialStore } from 'dialkit/store';
  import type { ControlMeta, DialValue, SpringConfig, TransitionConfig } from 'dialkit/store';
  import type { MidiController, MidiMappingOwner } from 'dialkit/midi';
  import MidiBadge from './MidiBadge.svelte';
  import Slider from './Slider.svelte';
  import Toggle from './Toggle.svelte';
  import Folder from './Folder.svelte';
  import SpringControl from './SpringControl.svelte';
  import TransitionControl from './TransitionControl.svelte';
  import TextControl from './TextControl.svelte';
  import SelectControl from './SelectControl.svelte';
  import ColorControl from './ColorControl.svelte';
  import ControlRenderer from './ControlRenderer.svelte';
  import { SHORTCUT_CTX } from './ShortcutListener.svelte';
  import type { ShortcutContextValue } from './ShortcutListener.svelte';
  import type { TransitionDurationControl } from './TransitionControl.svelte';

  let { panelId, control, values, midi, midiOwner, transitionDuration } = $props<{
    panelId: string;
    control: ControlMeta;
    values: Record<string, DialValue>;
    midi?: MidiController;
    midiOwner?: MidiMappingOwner;
    transitionDuration?: TransitionDurationControl;
  }>();

  const shortcutCtx = getContext<ShortcutContextValue | undefined>(SHORTCUT_CTX);

  const controlValue = $derived(values[control.path]);
  const isShortcutActive = $derived(
    shortcutCtx ? shortcutCtx.activePanelId === panelId && shortcutCtx.activePath === control.path : false
  );
</script>

{#if control.type === 'slider'}
  <Slider
    label={control.label}
    value={controlValue as number}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
    min={control.min}
    max={control.max}
    step={control.step}
    shortcut={control.shortcut}
    shortcutActive={isShortcutActive}
  >
    {#snippet midiSlot()}
      {#if midi}
        <MidiBadge controller={midi} {panelId} path={control.path} ownerToken={midiOwner} />
      {/if}
    {/snippet}
  </Slider>
{:else if control.type === 'toggle'}
  <Toggle
    label={control.label}
    checked={controlValue as boolean}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
    shortcut={control.shortcut}
    shortcutActive={isShortcutActive}
  >
    {#snippet midiSlot()}
      {#if midi}<MidiBadge controller={midi} {panelId} path={control.path} ownerToken={midiOwner} />{/if}
    {/snippet}
  </Toggle>
{:else if control.type === 'spring'}
  <SpringControl
    {panelId}
    path={control.path}
    label={control.label}
    spring={controlValue as SpringConfig}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
    {midi}
    {midiOwner}
  />
{:else if control.type === 'transition'}
  <TransitionControl
    {panelId}
    path={control.path}
    label={control.label}
    value={controlValue as TransitionConfig}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
    durationControl={transitionDuration}
    {midi}
    {midiOwner}
  />
{:else if control.type === 'folder'}
  <Folder title={control.label} defaultOpen={control.defaultOpen ?? true}>
    {#each control.children ?? [] as child (child.path)}
      <ControlRenderer {panelId} control={child} {values} {midi} {midiOwner} {transitionDuration} />
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
  >
    {#snippet midiSlot()}{#if midi && (control.options?.length ?? 0) > 1}<MidiBadge controller={midi} {panelId} path={control.path} ownerToken={midiOwner} />{/if}{/snippet}
  </SelectControl>
{:else if control.type === 'color'}
  <ColorControl
    label={control.label}
    value={controlValue as string}
    onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
  />
{:else if control.type === 'action'}
  <div class="dialkit-midi-action-target">
    <button
      type="button"
      class="dialkit-button dialkit-midi-action-control"
      onclick={() => DialStore.triggerAction(panelId, control.path)}
    >
      {control.label}
    </button>
    {#if midi}<MidiBadge controller={midi} {panelId} path={control.path} ownerToken={midiOwner} />{/if}
  </div>
{/if}
