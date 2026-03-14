<script lang="ts">
  import { Spring } from 'svelte/motion';
  import Portal from '../Portal.svelte';
  import { DialStore } from 'dialkit/store';
  import type { Preset } from 'dialkit/store';
  import { dropdownTransition } from './transitions';
  import { ICON_CHEVRON, ICON_TRASH } from '../../icons';

  let { panelId, presets, activePresetId } = $props<{
    panelId: string;
    presets: Preset[];
    activePresetId: string | null;
  }>();

  let isOpen = $state(false);
  let pos = $state({ top: 0, left: 0, width: 0 });
  let portalTarget = $state<HTMLElement | null>(null);
  let triggerRef = $state<HTMLButtonElement | null>(null);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  const chevronRotation = new Spring(0, { stiffness: 0.2, damping: 0.6 });
  const chevronOpacity = new Spring(0.25, { stiffness: 0.2, damping: 0.6 });

  const hasPresets = $derived(presets.length > 0);
  const activePreset = $derived(presets.find((p: Preset) => p.id === activePresetId));

  const updatePos = () => {
    const rect = triggerRef?.getBoundingClientRect();
    if (!rect) return;
    pos = { top: rect.bottom + 4, left: rect.left, width: rect.width };
  };

  const openDropdown = () => {
    if (!hasPresets) return;
    updatePos();
    isOpen = true;
  };

  const closeDropdown = () => {
    isOpen = false;
  };

  $effect(() => {
    if (typeof document === 'undefined' || !triggerRef) return;
    portalTarget = (triggerRef.closest('.dialkit-root') as HTMLElement | null) ?? document.body;
  });

  $effect(() => {
    chevronRotation.set(isOpen ? 180 : 0);
    chevronOpacity.set(hasPresets ? 0.6 : 0.25);
  });

  $effect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleViewportChange = () => updatePos();
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.contains(target) || dropdownRef?.contains(target)) return;
      closeDropdown();
    };

    updatePos();
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  });

  const handleSelect = (presetId: string | null) => {
    if (presetId) DialStore.loadPreset(panelId, presetId);
    else DialStore.clearActivePreset(panelId);
    closeDropdown();
  };

  const handleDelete = (e: MouseEvent, presetId: string) => {
    e.stopPropagation();
    DialStore.deletePreset(panelId, presetId);
  };
</script>

<div class="dialkit-preset-manager">
  <button
    bind:this={triggerRef}
    class="dialkit-preset-trigger"
    onclick={() => (isOpen ? closeDropdown() : openDropdown())}
    data-open={String(isOpen)}
    data-has-preset={String(!!activePreset)}
    data-disabled={String(!hasPresets)}
  >
    <span class="dialkit-preset-label">
      {activePreset ? activePreset.name : 'Version 1'}
    </span>
    <svg
      class="dialkit-select-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      style:transform={`rotate(${chevronRotation.current}deg)`}
      style:opacity={chevronOpacity.current}
    >
      <path d={ICON_CHEVRON} />
    </svg>
  </button>

  {#if portalTarget}
    <Portal target={portalTarget}>
      {#if isOpen}
        <div
          bind:this={dropdownRef}
          class="dialkit-root dialkit-preset-dropdown"
          style={`position:fixed;top:${pos.top}px;left:${pos.left}px;min-width:${pos.width}px;`}
          transition:dropdownTransition={{ above: false }}
        >
          <div
            class="dialkit-preset-item"
            data-active={String(!activePresetId)}
            onclick={() => handleSelect(null)}
          >
            <span class="dialkit-preset-name">Version 1</span>
          </div>

          {#each presets as preset (preset.id)}
            <div
              class="dialkit-preset-item"
              data-active={String(preset.id === activePresetId)}
              onclick={() => handleSelect(preset.id)}
            >
              <span class="dialkit-preset-name">{preset.name}</span>
              <button
                class="dialkit-preset-delete"
                onclick={(e) => handleDelete(e, preset.id)}
                title="Delete preset"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d={ICON_TRASH[0]} />
                  <path d={ICON_TRASH[1]} />
                  <path d={ICON_TRASH[2]} />
                  <path d={ICON_TRASH[3]} />
                  <path d={ICON_TRASH[4]} />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </Portal>
  {/if}
</div>
