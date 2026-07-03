<script lang="ts">
  export interface SegmentedControlOption<T extends string = string> {
    value: T;
    label: string;
  }

  let { options, value, onChange, label } = $props<{
    options: SegmentedControlOption[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
  }>();

  let containerRef = $state<HTMLDivElement | undefined>(undefined);
  let buttonRefs = $state<(HTMLButtonElement | null)[]>([]);
  let hasAnimated = false;
  let pillLeft = $state<number | null>(null);
  let pillWidth = $state<number | null>(null);

  function measure() {
    if (!containerRef) return;
    const activeButton = containerRef.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!activeButton) return;
    pillLeft = activeButton.offsetLeft;
    pillWidth = activeButton.offsetWidth;
  }

  $effect(() => {
    void value;
    void options.length;
    measure();
  });

  let shouldAnimate = $derived.by(() => {
    if (!hasAnimated) {
      hasAnimated = true;
      return false;
    }
    return true;
  });

  const activeIndex = $derived(
    Math.max(0, options.findIndex((o: SegmentedControlOption) => o.value === value))
  );

  // Radiogroup arrow-key navigation: moving focus also moves selection,
  // matching the WAI-ARIA radio pattern.
  function handleKeyDown(e: KeyboardEvent, index: number) {
    let nextIndex: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % options.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + options.length) % options.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = options.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(options[nextIndex].value);
    buttonRefs[nextIndex]?.focus();
  }
</script>

<div
  class="dialkit-segmented"
  bind:this={containerRef}
  role="radiogroup"
  aria-label={label}
>
  {#if pillLeft !== null && pillWidth !== null}
    <div
      class="dialkit-segmented-pill"
      style:left="{pillLeft}px"
      style:width="{pillWidth}px"
      style:transition={shouldAnimate
        ? 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
        : 'none'}
    ></div>
  {/if}

  {#each options as option, index (option.value)}
    <button
      bind:this={buttonRefs[index]}
      type="button"
      role="radio"
      aria-checked={value === option.value}
      tabindex={index === activeIndex ? 0 : -1}
      onclick={() => onChange(option.value)}
      onkeydown={(e) => handleKeyDown(e, index)}
      class="dialkit-segmented-button"
      data-active={String(value === option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>
