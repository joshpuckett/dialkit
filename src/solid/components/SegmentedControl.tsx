import { For, createMemo } from 'solid-js';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: [SegmentedControlOption<T>, SegmentedControlOption<T>];
  value: T;
  onChange: (value: T) => void;
}

const PADDING = 2;

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  let hasAnimated = false;

  const activeIndex = createMemo(() =>
    props.options.findIndex((o) => o.value === props.value)
  );

  const pillLeft = createMemo(() =>
    `calc(${PADDING}px + ${activeIndex()} * (100% - ${PADDING * 2}px) / ${props.options.length})`
  );

  const pillWidth = `calc((100% - ${PADDING * 2}px) / 2)`;

  const transition = createMemo(() => {
    // Track value to re-evaluate on change
    activeIndex();
    if (!hasAnimated) {
      hasAnimated = true;
      return 'none';
    }
    return 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)';
  });

  return (
    <div class="dialkit-segmented">
      <div
        class="dialkit-segmented-pill"
        style={{
          left: pillLeft(),
          width: pillWidth,
          transition: transition(),
        }}
      />
      <For each={props.options}>
        {(option) => (
          <button
            onClick={() => props.onChange(option.value)}
            class="dialkit-segmented-button"
            data-active={String(props.value === option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}
