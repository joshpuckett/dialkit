<script lang="ts">
  import { Spring } from 'svelte/motion';
  import Portal from '../Portal.svelte';
  import { dropdownTransition } from './transitions';
  import { getDialKitPortalRoot, attachDropdown } from '../../dropdown-position';
  import { ICON_CHEVRON } from '../../icons';

  type SelectOption = string | { value: string; label: string };

  let { label, value, options, onChange } = $props<{
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
  }>();

  const baseId = `dialkit-select-${Math.random().toString(36).slice(2, 9)}`;

  let isOpen = $state(false);
  let activeIndex = $state(-1);
  let portalTarget = $state<HTMLElement | null>(null);
  let triggerRef = $state<HTMLButtonElement | undefined>(undefined);
  let dropdownRef = $state<HTMLDivElement | undefined>(undefined);
  let optionRefs = $state<(HTMLButtonElement | null)[]>([]);

  const chevronRotation = new Spring(0, { stiffness: 0.2, damping: 0.6 });

  const toTitleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  const normalized = $derived(
    options.map((opt: SelectOption) =>
      typeof opt === 'string' ? { value: opt, label: toTitleCase(opt) } : opt
    )
  );

  const selectedIndex = $derived(
    normalized.findIndex((o: { value: string; label: string }) => o.value === value)
  );
  const selectedOption = $derived(normalized[selectedIndex]);
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const openMenu = (toIndex: number) => {
    activeIndex = toIndex;
    isOpen = true;
    // macOS Safari/Firefox don't focus a <button> on click, so force it —
    // otherwise arrow keys hit the page instead of the trigger's handler.
    triggerRef?.focus();
  };

  const closeDropdown = () => {
    isOpen = false;
  };

  const commit = (index: number) => {
    onChange(normalized[index].value);
    isOpen = false;
  };

  // Resolve portal target (closest .dialkit-root) so theme vars apply.
  $effect(() => {
    if (typeof document === 'undefined' || !triggerRef) return;
    portalTarget = getDialKitPortalRoot(triggerRef) ?? document.body;
  });

  $effect(() => {
    chevronRotation.set(isOpen ? 180 : 0);
  });

  // Tether the floating dropdown to the trigger via Floating UI while open.
  $effect(() => {
    if (!isOpen || !triggerRef || !dropdownRef) return;
    return attachDropdown(triggerRef, dropdownRef, {
      placement: 'bottom-start',
      matchWidth: true,
    });
  });

  // Focus never leaves the trigger — the active option is tracked with
  // aria-activedescendant. Keep the active option scrolled into view.
  $effect(() => {
    if (isOpen && activeIndex >= 0) {
      optionRefs[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  });

  // Close on click outside (covers clicks on non-focusable areas that don't
  // blur the trigger).
  $effect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.contains(target) || dropdownRef?.contains(target)) return;
      closeDropdown();
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });

  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(selectedIndex >= 0 ? selectedIndex : 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(selectedIndex >= 0 ? selectedIndex : normalized.length - 1);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = (activeIndex + 1) % normalized.length;
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = (activeIndex - 1 + normalized.length) % normalized.length;
        break;
      case 'Home':
        e.preventDefault();
        activeIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        activeIndex = normalized.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'Tab':
        closeDropdown();
        break;
    }
  };

  // Close when focus leaves the trigger (Tab away, or focus moves elsewhere).
  const handleTriggerBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && dropdownRef?.contains(next)) return;
    closeDropdown();
  };
</script>

<div class="dialkit-select-row">
  <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
  <button
    bind:this={triggerRef}
    class="dialkit-select-trigger"
    onclick={() => (isOpen ? closeDropdown() : openMenu(selectedIndex >= 0 ? selectedIndex : 0))}
    onkeydown={handleTriggerKeyDown}
    onblur={handleTriggerBlur}
    data-open={String(isOpen)}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-controls={isOpen ? `${baseId}-listbox` : undefined}
    aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
      {#if isOpen}
        <div
          bind:this={dropdownRef}
          id={`${baseId}-listbox`}
          class="dialkit-select-dropdown"
          role="listbox"
          style="position:fixed;top:0;left:0;"
          transition:dropdownTransition={{ above: false }}
        >
          {#each normalized as option, index (option.value)}
            <button
              bind:this={optionRefs[index]}
              id={optionId(index)}
              type="button"
              class="dialkit-select-option"
              role="option"
              aria-selected={option.value === value}
              tabindex={-1}
              data-selected={String(option.value === value)}
              data-active={String(index === activeIndex)}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => commit(index)}
              onmouseenter={() => (activeIndex = index)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
    </Portal>
  {/if}
</div>
