import { useRef, useState, useLayoutEffect, useCallback } from 'react';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeButton = container.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!activeButton) return;
    setPillStyle({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [value, options.length, measure]);

  // Enable transition after first render
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  return (
    <div className="dialkit-segmented" ref={containerRef}>
      {pillStyle && (
        <div
          className="dialkit-segmented-pill"
          style={{
            left: pillStyle.left,
            width: pillStyle.width,
            transition: shouldAnimate
              ? 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
              : 'none',
          }}
        />
      )}

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
