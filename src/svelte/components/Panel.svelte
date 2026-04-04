<script lang="ts">
  import { Spring } from 'svelte/motion';
  import { DialStore } from 'dialkit/store';
  import type { DialValue, PanelConfig, Preset } from 'dialkit/store';
  import Folder from './Folder.svelte';
  import PresetManager from './PresetManager.svelte';
  import ControlRenderer from './ControlRenderer.svelte';
  import { ICON_CLIPBOARD, ICON_CHECK, ICON_ADD_PRESET } from '../../icons';

  let { panel, defaultOpen = true, inline = false } = $props<{ panel: PanelConfig; defaultOpen?: boolean; inline?: boolean }>();

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
  <Folder title={panel.name} {defaultOpen} isRoot={true} {inline} onOpenChange={(open) => (isPanelOpen = open)}>
    {#snippet toolbar()}
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
          <path d={ICON_ADD_PRESET[0]} />
          <path d={ICON_ADD_PRESET[1]} />
          <path d={ICON_ADD_PRESET[2]} />
          <path d={ICON_ADD_PRESET[3]} />
          <path d={ICON_ADD_PRESET[4]} />
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
            <path d={ICON_CLIPBOARD.board} stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d={ICON_CLIPBOARD.sparkle} fill="currentColor"/>
            <path d={ICON_CLIPBOARD.body} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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
            <path d={ICON_CHECK} />
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
