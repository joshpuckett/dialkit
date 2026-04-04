<script lang="ts">
  import { Spring } from 'svelte/motion';
  import Portal from '../Portal.svelte';
  import { dropdownTransition } from './transitions';
  import { ICON_CHEVRON } from '../../icons';

  type SelectOption = string | { value: string; label: string };

  let { label, value, options, onChange } = $props<{
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
  }>();

  let isOpen = $state(false);
  let pos = $state<{ top: number; left: number; width: number; above: boolean } | null>(null);
  let portalTarget = $state<HTMLElement | null>(null);
  let triggerRef: HTMLButtonElement | undefined;
  let dropdownRef: HTMLDivElement | undefined;

  const chevronRotation = new Spring(0, { stiffness: 0.2, damping: 0.6 });

  const toTitleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  const normalized = $derived(
    options.map((opt: SelectOption) =>
      typeof opt === 'string' ? { value: opt, label: toTitleCase(opt) } : opt
    )
  );

  const selectedOption = $derived(normalized.find((o: { value: string; label: string }) => o.value === value));

  const updatePos = () => {
    if (!triggerRef || typeof window === 'undefined') return;
    const rect = triggerRef.getBoundingClientRect();
    const dropdownHeight = 8 + normalized.length * 36;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const above = spaceBelow < dropdownHeight && rect.top > spaceBelow;

    pos = {
      top: above ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      above,
    };
  };

  const openDropdown = () => {
    updatePos();
    isOpen = true;
  };

  const closeDropdown = () => {
    isOpen = false;
  };

  const dropdownStyle = $derived.by(() => {
    if (!pos || typeof window === 'undefined') return '';

    if (pos.above) {
      return `position:fixed;left:${pos.left}px;width:${pos.width}px;bottom:${window.innerHeight - pos.top}px;transform-origin:bottom;`;
    }

    return `position:fixed;left:${pos.left}px;width:${pos.width}px;top:${pos.top}px;transform-origin:top;`;
  });

  $effect(() => {
    if (typeof document === 'undefined' || !triggerRef) return;

    portalTarget = (triggerRef.closest('.dialkit-root') as HTMLElement | null) ?? document.body;
  });

  $effect(() => {
    chevronRotation.set(isOpen ? 180 : 0);
  });

  $effect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleViewportChange = () => updatePos();

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.contains(target) || dropdownRef?.contains(target)) return;
      closeDropdown();
    };

    updatePos();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<div class="dialkit-select-row">
  <button
    bind:this={triggerRef}
    class="dialkit-select-trigger"
    onclick={() => (isOpen ? closeDropdown() : openDropdown())}
    data-open={String(isOpen)}
  >
    <span class="dialkit-select-label">{label}</span>
    <div class="dialkit-select-right">
      <span class="dialkit-select-value">{selectedOption?.label ?? value}</span>
      <svg
        class="dialkit-select-chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        style:transform={`rotate(${chevronRotation.current}deg)`}
      >
        <path d={ICON_CHEVRON} />
      </svg>
    </div>
  </button>

  {#if portalTarget}
    <Portal target={portalTarget}>
      {#if isOpen && pos}
        <div
          bind:this={dropdownRef}
          class="dialkit-select-dropdown"
          style={dropdownStyle}
          transition:dropdownTransition={{ above: pos.above }}
        >
          {#each normalized as option (option.value)}
            <button
              class="dialkit-select-option"
              data-selected={String(option.value === value)}
              onclick={() => {
                onChange(option.value);
                closeDropdown();
              }}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
    </Portal>
  {/if}
</div>
