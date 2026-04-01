<script lang="ts">
  import { Spring } from 'svelte/motion';
  import { DialStore, DIAL_POSITIONS } from 'dialkit/store';
  import type { DialValue, PanelConfig, Preset, DialPosition } from 'dialkit/store';
  import Folder from './Folder.svelte';
  import PresetManager from './PresetManager.svelte';
  import ControlRenderer from './ControlRenderer.svelte';

  let { panel, defaultOpen = true, inline = false, growDirection, currentPosition, onPositionChange } = $props<{ panel: PanelConfig; defaultOpen?: boolean; inline?: boolean; growDirection?: 'up' | 'down'; currentPosition?: DialPosition; onPositionChange?: (pos: DialPosition) => void }>();

  let copied = $state(false);
  let isPanelOpen = $state(defaultOpen);
  let values = $state<Record<string, DialValue>>(DialStore.getValues(panel.id));
  let presets = $state<Preset[]>(DialStore.getPresets(panel.id));
  let activePresetId = $state<string | null>(DialStore.getActivePresetId(panel.id));

  const addScale = new Spring(1, { stiffness: 0.25, damping: 0.7 });
  const copyScale = new Spring(1, { stiffness: 0.25, damping: 0.7 });
  const clipboardOpacity = new Spring(1, { stiffness: 0.25, damping: 0.7 });
  const clipboardScale = new Spring(1, { stiffness: 0.2, damping: 0.6 });
  const checkOpacity = new Spring(0, { stiffness: 0.25, damping: 0.7 });
  const checkScale = new Spring(0.5, { stiffness: 0.2, damping: 0.6 });

  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const unsub = DialStore.subscribe(panel.id, () => {
      values = DialStore.getValues(panel.id);
      presets = DialStore.getPresets(panel.id);
      activePresetId = DialStore.getActivePresetId(panel.id);
    });

    return () => {
      unsub();
      if (copyTimeout) clearTimeout(copyTimeout);
    };
  });

  $effect(() => {
    if (copied) {
      clipboardOpacity.set(0);
      clipboardScale.set(0.5);
      checkOpacity.set(1);
      checkScale.set(1);
      return;
    }

    clipboardOpacity.set(1);
    clipboardScale.set(1);
    checkOpacity.set(0);
    checkScale.set(0.5);
  });

  const handleAddPreset = () => {
    const nextNum = presets.length + 2;
    DialStore.savePreset(panel.id, `Version ${nextNum}`);
  };

  const handleCopy = async () => {
    const jsonStr = JSON.stringify(values, null, 2);
    const instruction = `Update the createDialKit configuration for "${panel.name}" with these values:\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n\nApply these values as the new defaults in the createDialKit call.`;

    await navigator.clipboard.writeText(instruction);
    copied = true;

    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copied = false;
    }, 1500);
  };
</script>

<div class="dialkit-panel-wrapper">
  <Folder title={panel.name} {defaultOpen} isRoot={true} {inline} onOpenChange={(open) => (isPanelOpen = open)} {growDirection} compactToolbar={!!currentPosition}>
    {#snippet toolbar()}
      {#if currentPosition && onPositionChange}
        <div class="dialkit-position-picker" title="Panel position">
          {#each DIAL_POSITIONS as pos}
            <button
              class="dialkit-position-dot"
              data-active={currentPosition === pos ? 'true' : undefined}
              onclick={() => onPositionChange(pos)}
            ></button>
          {/each}
        </div>
      {/if}
      <button
        class="dialkit-toolbar-add"
        onclick={handleAddPreset}
        onpointerdown={() => addScale.set(0.9)}
        onpointerup={() => addScale.set(1)}
        onpointercancel={() => addScale.set(1)}
        onpointerleave={() => addScale.set(1)}
        title="Add preset"
        style:transform={`scale(${addScale.current})`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6H20" />
          <path d="M4 12H10" />
          <path d="M15 15L21 15" />
          <path d="M18 12V18" />
          <path d="M4 18H10" />
        </svg>
      </button>

      <PresetManager panelId={panel.id} {presets} {activePresetId} />

      <button
        class="dialkit-toolbar-copy"
        onclick={handleCopy}
        onpointerdown={() => copyScale.set(0.95)}
        onpointerup={() => copyScale.set(1)}
        onpointercancel={() => copyScale.set(1)}
        onpointerleave={() => copyScale.set(1)}
        title="Copy parameters"
        style:transform={`scale(${copyScale.current})`}
      >
        <span class="dialkit-toolbar-copy-icon-wrap">
          <svg
            class="dialkit-toolbar-copy-icon"
            viewBox="0 0 24 24"
            fill="none"
            style:opacity={clipboardOpacity.current}
            style:transform={`scale(${clipboardScale.current})`}
            style:filter={`blur(${(1 - clipboardOpacity.current) * 4}px)`}
          >
            <path d="M8 6C8 4.34315 9.34315 3 11 3H13C14.6569 3 16 4.34315 16 6V7H8V6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M19.2405 16.1852L18.5436 14.3733C18.4571 14.1484 18.241 14 18 14C17.759 14 17.5429 14.1484 17.4564 14.3733L16.7595 16.1852C16.658 16.4493 16.4493 16.658 16.1852 16.7595L14.3733 17.4564C14.1484 17.5429 14 17.759 14 18C14 18.241 14.1484 18.4571 14.3733 18.5436L16.1852 19.2405C16.4493 19.342 16.658 19.5507 16.7595 19.8148L17.4564 21.6267C17.5429 21.8516 17.759 22 18 22C18.241 22 18.4571 21.8516 18.5436 21.6267L19.2405 19.8148C19.342 19.5507 19.5507 19.342 19.8148 19.2405L21.6267 18.5436C21.8516 18.4571 22 18.241 22 18C22 17.759 21.8516 17.5429 21.6267 17.4564L19.8148 16.7595C19.5507 16.658 19.342 16.4493 19.2405 16.1852Z" fill="currentColor"/>
            <path d="M16 5H17C18.6569 5 20 6.34315 20 8V11M8 5H7C5.34315 5 4 6.34315 4 8V18C4 19.6569 5.34315 21 7 21H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>

          <svg
            class="dialkit-toolbar-copy-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style:opacity={checkOpacity.current}
            style:transform={`scale(${checkScale.current})`}
            style:filter={`blur(${(1 - checkOpacity.current) * 4}px)`}
          >
            <path d="M5 12.75L10 19L19 5" />
          </svg>
        </span>
        Copy
      </button>
    {/snippet}

    {#each panel.controls as control (control.path)}
      <ControlRenderer panelId={panel.id} {control} {values} />
    {/each}
  </Folder>
</div>
