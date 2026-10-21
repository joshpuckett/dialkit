<script lang="ts">
  import { observeDropdownKeyboard } from '../../dropdown-keyboard';
  import { openDropdownOnKey } from '../../control-keyboard';

  import { Spring } from 'svelte/motion';
  import Portal from '../Portal.svelte';
  import { DialStore } from 'dialkit/store';
  import type { Preset } from 'dialkit/store';
  import { dropdownTransition } from './transitions';
  import { getDialKitPortalRoot, getDropdownPosition } from '../../dropdown-position';
  import { ICON_CHEVRON, ICON_TRASH, ICON_PLUS, ICON_CHECK } from '../../icons';

  let { panelId, presets, activePresetId } = $props<{
    panelId: string;
    presets: Preset[];
    activePresetId: string | null;
  }>();

  let isOpen = $state(false);
  let pos = $state({ top: 0, left: 0, width: 0 });
  let portalTarget = $state<HTMLElement | null>(null);
  let triggerRef: HTMLButtonElement | undefined;
  let dropdownRef = $state<HTMLDivElement | undefined>(undefined);

  const chevronRotation = new Spring(0, { stiffness: 0.2, damping: 0.6 });
  const chevronOpacity = new Spring(0.6, { stiffness: 0.2, damping: 0.6 });

  const activePreset = $derived(presets.find((p: Preset) => p.id === activePresetId));
  const activeName = $derived(activePreset ? activePreset.name : 'Version 1');

  const updatePos = () => {
    if (!triggerRef || !portalTarget) return;
    pos = getDropdownPosition(triggerRef, portalTarget, { fixed: true, dropdownHeight: (dropdownRef?.scrollHeight ?? 0) + 2 });
  };

  const openDropdown = () => {
    updatePos();
    isOpen = true;
  };

  const closeDropdown = () => {
    isOpen = false;
  };

  $effect(() => {
    if (typeof document === 'undefined' || !triggerRef) return;
    portalTarget = getDialKitPortalRoot(triggerRef) ?? document.body;
  });

  $effect(() => {
    chevronRotation.set(isOpen ? 180 : 0);
    chevronOpacity.set(0.6);
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
    const stopKeyboard = observeDropdownKeyboard(triggerRef!, () => dropdownRef, closeDropdown, 'presets');
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      stopKeyboard();
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
    type="button" aria-haspopup="menu" aria-expanded={isOpen}
    aria-label={`Versions: ${activeName}`} onkeydown={(e) => openDropdownOnKey(e, openDropdown)}
  >
    <span class="dialkit-preset-label">
      {activeName}
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
            <svg class="dialkit-preset-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">{#if !activePresetId}<path d={ICON_CHECK} />{/if}</svg>
            <button type="button" class="dialkit-preset-name">Version 1</button>
          </div>

          {#each presets as preset (preset.id)}
            <div
              class="dialkit-preset-item"
              data-active={String(preset.id === activePresetId)}
              onclick={() => handleSelect(preset.id)}
            >
              <svg class="dialkit-preset-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">{#if preset.id === activePresetId}<path d={ICON_CHECK} />{/if}</svg>
              <button type="button" class="dialkit-preset-name">{preset.name}</button>
              <button
                class="dialkit-preset-delete"
                onclick={(e) => handleDelete(e, preset.id)}
                type="button" title={`Delete ${preset.name}`} aria-label={`Delete ${preset.name}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d={ICON_TRASH[0]} />
                  <path d={ICON_TRASH[1]} />
                  <path d={ICON_TRASH[2]} />
                  <path d={ICON_TRASH[3]} />
                  <path d={ICON_TRASH[4]} />
                </svg>
              </button>
            </div>
          {/each}
          <div class="dialkit-preset-divider" role="separator"></div>
          <button type="button" class="dialkit-preset-create" onclick={() => { DialStore.saveNewPreset(panelId); closeDropdown(); triggerRef?.focus(); }}>
            <svg class="dialkit-preset-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d={ICON_PLUS[0]} /></svg>
            New version
          </button>
        </div>
      {/if}
    </Portal>
  {/if}
</div>
