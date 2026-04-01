import { useRef } from 'react';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const PADDING = 2;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const hasAnimated = useRef(false);
  const activeIndex = options.findIndex((o) => o.value === value);
  const count = options.length;

  const pillLeft = `calc(${PADDING}px + ${activeIndex} * (100% - ${PADDING * 2}px) / ${count})`;
  const pillWidth = `calc((100% - ${PADDING * 2}px) / ${count})`;

  // Enable transition after first render
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  return (
    <div className="dialkit-segmented">
      <div
        className="dialkit-segmented-pill"
        style={{
          left: pillLeft,
          width: pillWidth,
          transition: shouldAnimate
            ? 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            : 'none',
        }}
      />

      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className="dialkit-segmented-button"
            data-active={String(isActive)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
