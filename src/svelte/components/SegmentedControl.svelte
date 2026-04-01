<script lang="ts">
  export interface SegmentedControlOption<T extends string = string> {
    value: T;
    label: string;
  }

  let { options, value, onChange } = $props<{
    options: SegmentedControlOption[];
    value: string;
    onChange: (value: string) => void;
  }>();

  const PADDING = 2;

  let hasAnimated = false;

  let pillLeft = $derived.by(() => {
    const i = options.findIndex((o: SegmentedControlOption) => o.value === value);
    return `calc(${PADDING}px + ${i} * (100% - ${PADDING * 2}px) / ${options.length})`;
  });

  let pillWidth = $derived(`calc((100% - ${PADDING * 2}px) / ${options.length})`);

  let transition = $derived.by(() => {
    if (!hasAnimated) {
      hasAnimated = true;
      return 'none';
    }
    return 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)';
  });
</script>

<div class="dialkit-segmented">
  <div
    class="dialkit-segmented-pill"
    style:left={pillLeft}
    style:width={pillWidth}
    style:transition={transition}
  ></div>

  {#each options as option (option.value)}
    <button
      onclick={() => onChange(option.value)}
      class="dialkit-segmented-button"
      data-active={String(value === option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>
