import { createSignal, createEffect, For, Show } from 'solid-js';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  let containerRef: HTMLDivElement | undefined;
  const buttonRefs: (HTMLButtonElement | undefined)[] = [];
  let hasAnimated = false;
  const [pillStyle, setPillStyle] = createSignal<{ left: number; width: number } | null>(null);

  const measure = () => {
    if (!containerRef) return;
    const activeButton = containerRef.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!activeButton) return;
    setPillStyle({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    });
  };

  createEffect(() => {
    void props.value;
    void props.options.length;
    measure();
  });

  const transition = (): string => {
    void props.value;
    if (!hasAnimated) {
      hasAnimated = true;
      return 'none';
    }
    return 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)';
  };

  const activeIndex = () =>
    Math.max(0, props.options.findIndex((o) => o.value === props.value));

  // Radiogroup arrow-key navigation: moving focus also moves selection,
  // matching the WAI-ARIA radio pattern.
  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % props.options.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + props.options.length) % props.options.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = props.options.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    props.onChange(props.options[nextIndex].value);
    buttonRefs[nextIndex]?.focus();
  };

  return (
    <div
      class="dialkit-segmented"
      ref={containerRef}
      role="radiogroup"
      aria-label={props.label}
    >
      <Show when={pillStyle()}>
        {(style) => (
          <div
            class="dialkit-segmented-pill"
            style={{
              left: `${style().left}px`,
              width: `${style().width}px`,
              transition: transition(),
            }}
          />
        )}
      </Show>
      <For each={props.options}>
        {(option, index) => (
          <button
            ref={(el) => { buttonRefs[index()] = el; }}
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            tabindex={index() === activeIndex() ? 0 : -1}
            onClick={() => props.onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index())}
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
