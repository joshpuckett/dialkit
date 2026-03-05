<script lang="ts">
  import { Spring } from 'svelte/motion';
  import Portal from '../Portal.svelte';
  import { DialStore } from 'dialkit/store';
  import type { Preset } from 'dialkit/store';
  import { dropdownTransition } from './transitions';

  let { panelId, presets, activePresetId } = $props<{
    panelId: string;
    presets: Preset[];
    activePresetId: string | null;
  }>();

  let isOpen = $state(false);
  let pos = $state({ top: 0, left: 0, width: 0 });
  let portalTarget = $state<HTMLElement | null>(null);
  let triggerRef: HTMLButtonElement | undefined;
  let dropdownRef: HTMLDivElement | undefined;

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
      <path d="M6 9.5L12 15.5L18 9.5" />
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
                  <path d="M5 6.5L5.80734 18.2064C5.91582 19.7794 7.22348 21 8.80023 21H15.1998C16.7765 21 18.0842 19.7794 18.1927 18.2064L19 6.5" />
                  <path d="M10 11V16" />
                  <path d="M14 11V16" />
                  <path d="M3.5 6H20.5" />
                  <path d="M8.07092 5.74621C8.42348 3.89745 10.0485 2.5 12 2.5C13.9515 2.5 15.5765 3.89745 15.9291 5.74621" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </Portal>
  {/if}
</div>
