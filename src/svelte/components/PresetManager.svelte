<script lang="ts">
  import { Spring } from 'svelte/motion';
  import Portal from '../Portal.svelte';
  import { DialStore } from 'dialkit/store';
  import type { Preset } from 'dialkit/store';
  import { dropdownTransition } from './transitions';
  import { getDialKitPortalRoot, attachDropdown } from '../../dropdown-position';
  import { ICON_CHEVRON, ICON_TRASH } from '../../icons';

  let { panelId, presets, activePresetId } = $props<{
    panelId: string;
    presets: Preset[];
    activePresetId: string | null;
  }>();

  const baseId = `dialkit-preset-${Math.random().toString(36).slice(2, 9)}`;

  let isOpen = $state(false);
  let activeIndex = $state(-1);
  let portalTarget = $state<HTMLElement | null>(null);
  let triggerRef = $state<HTMLButtonElement | undefined>(undefined);
  let dropdownRef = $state<HTMLDivElement | undefined>(undefined);

  const chevronRotation = new Spring(0, { stiffness: 0.2, damping: 0.6 });
  const chevronOpacity = new Spring(0.25, { stiffness: 0.2, damping: 0.6 });

  const hasPresets = $derived(presets.length > 0);
  const activePreset = $derived(presets.find((p: Preset) => p.id === activePresetId));

  // Flat selectable list: the implicit "Version 1" (no preset) plus each preset.
  const items = $derived<{ id: string | null; name: string }[]>([
    { id: null, name: 'Version 1' },
    ...presets.map((p: Preset) => ({ id: p.id, name: p.name })),
  ]);
  const selectedIndex = $derived(
    Math.max(0, items.findIndex((it) => it.id === activePresetId))
  );
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const close = () => (isOpen = false);

  const openMenu = (toIndex: number) => {
    if (!hasPresets) return;
    activeIndex = toIndex;
    isOpen = true;
    // macOS Safari/Firefox don't focus a <button> on click — force it so the
    // trigger's key handler receives arrow keys.
    triggerRef?.focus();
  };

  const handleSelect = (presetId: string | null) => {
    if (presetId) DialStore.loadPreset(panelId, presetId);
    else DialStore.clearActivePreset(panelId);
    close();
  };

  const handleDelete = (e: MouseEvent, presetId: string) => {
    e.stopPropagation();
    DialStore.deletePreset(panelId, presetId);
  };

  $effect(() => {
    if (typeof document === 'undefined' || !triggerRef) return;
    portalTarget = getDialKitPortalRoot(triggerRef) ?? document.body;
  });

  $effect(() => {
    chevronRotation.set(isOpen ? 180 : 0);
    chevronOpacity.set(hasPresets ? 0.6 : 0.25);
  });

  // Tether the floating dropdown to the trigger via Floating UI while open.
  $effect(() => {
    if (!isOpen || !triggerRef || !dropdownRef) return;
    return attachDropdown(triggerRef, dropdownRef, {
      placement: 'bottom-start',
      matchWidth: true,
    });
  });

  // Keep the active item scrolled into view.
  $effect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    }
  });

  // Close on mousedown outside trigger + dropdown.
  $effect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.contains(target) || dropdownRef?.contains(target)) return;
      close();
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });

  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(selectedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(items.length - 1);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        e.preventDefault();
        activeIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        activeIndex = items.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) handleSelect(items[activeIndex].id);
        break;
      case 'Delete':
      case 'Backspace': {
        const target = items[activeIndex];
        if (target?.id) {
          e.preventDefault();
          DialStore.deletePreset(panelId, target.id);
          activeIndex = Math.max(0, activeIndex - 1);
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  };

  // Close when focus leaves the trigger.
  const handleTriggerBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && dropdownRef?.contains(next)) return;
    close();
  };
</script>

<div class="dialkit-preset-manager">
  <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
  <button
    bind:this={triggerRef}
    class="dialkit-preset-trigger"
    onclick={() => (isOpen ? close() : openMenu(selectedIndex))}
    onkeydown={handleTriggerKeyDown}
    onblur={handleTriggerBlur}
    data-open={String(isOpen)}
    data-has-preset={String(!!activePreset)}
    data-disabled={String(!hasPresets)}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-controls={isOpen ? `${baseId}-listbox` : undefined}
    aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
          id={`${baseId}-listbox`}
          class="dialkit-root dialkit-preset-dropdown"
          role="listbox"
          style="position:fixed;top:0;left:0;"
          transition:dropdownTransition={{ above: false }}
        >
          {#each items as item, index (item.id ?? '__none__')}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              id={optionId(index)}
              class="dialkit-preset-item"
              role="option"
              tabindex={-1}
              aria-selected={index === selectedIndex}
              data-active={String(index === activeIndex)}
              data-selected={String(index === selectedIndex)}
              onmousedown={(e) => e.preventDefault()}
              onmouseenter={() => (activeIndex = index)}
              onclick={() => handleSelect(item.id)}
            >
              <span class="dialkit-preset-name">{item.name}</span>
              {#if item.id}
                <button
                  class="dialkit-preset-delete"
                  onmousedown={(e) => e.preventDefault()}
                  onclick={(e) => handleDelete(e, item.id!)}
                  title="Delete preset"
                  tabindex={-1}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d={ICON_TRASH[0]} />
                    <path d={ICON_TRASH[1]} />
                    <path d={ICON_TRASH[2]} />
                    <path d={ICON_TRASH[3]} />
                    <path d={ICON_TRASH[4]} />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </Portal>
  {/if}
</div>
