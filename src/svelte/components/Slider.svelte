<script lang="ts">
  import { handleSliderKey } from '../../control-keyboard';

  import { tick, untrack } from 'svelte';
  import { Spring } from 'svelte/motion';
  import type { ShortcutConfig } from 'dialkit/store';
  import { decimalsForStep, roundValue, snapToDecile, formatSliderShortcut } from '../../shortcut-utils';
  import { startPointerGesture, type StopGesture } from '../../pointer-gesture';

  let {
    label,
    value,
    onChange,
    min = 0,
    max = 1,
    step = 0.01,
    unit,
    shortcut,
    shortcutActive = false,
  } = $props<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    shortcut?: ShortcutConfig;
    shortcutActive?: boolean;
  }>();

  const CLICK_THRESHOLD = 3;
  const DEAD_ZONE = 32;
  const MAX_CURSOR_RANGE = 200;
  const MAX_STRETCH = 8;
  const HANDLE_BUFFER = 8;
  const LABEL_CSS_LEFT = 10;
  const VALUE_CSS_RIGHT = 12;

  let wrapperRef: HTMLDivElement | undefined;
  let labelRef: HTMLSpanElement | undefined;
  let valueSpanRef: HTMLSpanElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  let trackRef: HTMLDivElement | undefined;
  let editingEnded = false;

  let isInteracting = $state(false);
  let isDragging = $state(false);
  let isHovered = $state(false);
  let isValueHovered = $state(false);
  let isValueEditable = $state(false);
  let showInput = $state(false);
  let inputValue = $state('');

  const percentFromValue = (nextValue: number) => {
    const range = max - min;
    return range > 0 ? ((nextValue - min) / range) * 100 : 0;
  };

  const fillPercent = new Spring(untrack(() => percentFromValue(value)), { stiffness: 0.25, damping: 0.7 });
  const rubberStretchPx = new Spring(0, { stiffness: 0.2, damping: 0.65 });
  const handleOpacityMv = new Spring(0, { stiffness: 0.3, damping: 0.75 });
  const handleScaleXMv = new Spring(0.25, { stiffness: 0.2, damping: 0.6 });
  const handleScaleYMv = new Spring(1, { stiffness: 0.2, damping: 0.6 });

  let stopGesture: StopGesture | null = null;
  let wrapperRect: DOMRect | null = null;
  let scaleVal = 1;
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const positionToValue = (clientX: number) => {
    if (!wrapperRect || !wrapperRef) return value;
    const screenX = clientX - wrapperRect.left;
    const sceneX = screenX / scaleVal;
    const nativeWidth = wrapperRef.offsetWidth || wrapperRect.width;
    const percent = Math.max(0, Math.min(1, sceneX / nativeWidth));
    const rawValue = min + percent * (max - min);
    return Math.max(min, Math.min(max, rawValue));
  };

  const computeRubberStretch = (clientX: number, sign: number) => {
    if (!wrapperRect) return 0;
    const distancePast = sign < 0 ? wrapperRect.left - clientX : clientX - wrapperRect.right;
    const overflow = Math.max(0, distancePast - DEAD_ZONE);
    return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1));
  };

  // Sync from props when not interacting. A click's spring keeps running only
  // while the value is still the one it is heading to; a value that arrives from
  // anywhere else (a version switch, a shortcut) takes over at once.
  $effect(() => {
    const next = percentage;
    if (isInteracting) return;
    untrack(() => {
      if (fillPercent.current !== fillPercent.target && fillPercent.target === next) return;
      fillPercent.set(next, { instant: true });
    });
  });

  $effect(() => () => stopGesture?.(false));

  $effect(() => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }

    if (isValueHovered && !showInput && !isValueEditable) {
      hoverTimeout = setTimeout(() => {
        isValueEditable = true;
      }, 800);
    } else if (!isValueHovered && !showInput) {
      isValueEditable = false;
    }

    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
    };
  });

  $effect(() => {
    if (showInput) {
      tick().then(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  });

  const percentage = $derived(percentFromValue(value));
  const isActive = $derived(isInteracting || isHovered);

  const leftThreshold = $derived.by(() => {
    const trackWidth = wrapperRef?.offsetWidth;
    if (trackWidth && labelRef) {
      return ((LABEL_CSS_LEFT + labelRef.offsetWidth + HANDLE_BUFFER) / trackWidth) * 100;
    }
    return 30;
  });

  const rightThreshold = $derived.by(() => {
    const trackWidth = wrapperRef?.offsetWidth;
    if (trackWidth && valueSpanRef) {
      return ((trackWidth - VALUE_CSS_RIGHT - valueSpanRef.offsetWidth - HANDLE_BUFFER) / trackWidth) * 100;
    }
    return 78;
  });

  const valueDodge = $derived(percentage < leftThreshold || percentage > rightThreshold);

  const handleOpacity = $derived.by(() => {
    if (!isActive) return 0;
    if (valueDodge) return 0.1;
    if (isDragging) return 0.9;
    return 0.5;
  });

  $effect(() => {
    handleOpacityMv.set(handleOpacity);
    handleScaleXMv.set(isActive ? 1 : 0.25);
    handleScaleYMv.set(isActive && valueDodge ? 0.75 : 1);
  });

  const discreteSteps = $derived((max - min) / step);

  const hashMarks = $derived.by(() => {
    if (discreteSteps <= 10) {
      return Array.from({ length: Math.max(discreteSteps - 1, 0) }, (_, i) => ({
        key: `d-${i + 1}`,
        left: (((i + 1) * step) / (max - min)) * 100,
      }));
    }

    return Array.from({ length: 9 }, (_, i) => ({
      key: `t-${i + 1}`,
      left: (i + 1) * 10,
    }));
  });

  const handlePointerDown = (e: PointerEvent) => {
    if (showInput || stopGesture) return;
    const startValue = value;
    const startX = e.clientX;
    const startY = e.clientY;
    let isClick = true;

    stopGesture = startPointerGesture(e, e.currentTarget as HTMLElement, {
      move(next) {
        const distance = Math.hypot(next.clientX - startX, next.clientY - startY);
        if (isClick && distance > CLICK_THRESHOLD) {
          isClick = false;
          isDragging = true;
        }
        if (isClick) return;

        if (wrapperRect) {
          if (next.clientX < wrapperRect.left) {
            rubberStretchPx.set(computeRubberStretch(next.clientX, -1), { instant: true });
          } else if (next.clientX > wrapperRect.right) {
            rubberStretchPx.set(computeRubberStretch(next.clientX, 1), { instant: true });
          } else {
            rubberStretchPx.set(0, { instant: true });
          }
        }

        const newValue = positionToValue(next.clientX);
        fillPercent.set(percentFromValue(newValue), { instant: true });
        onChange(roundValue(newValue, step, min, max));
      },
      end(cancelled, last) {
        stopGesture = null;
        if (cancelled) {
          rubberStretchPx.set(0, { instant: true });
          if (!isClick) onChange(startValue);
        } else {
          if (isClick && last) {
            const rawValue = positionToValue(last.clientX);
            const steps = (max - min) / step;
            const snappedValue = steps <= 10
              ? Math.max(min, Math.min(max, min + Math.round((rawValue - min) / step) * step))
              : snapToDecile(rawValue, min, max);
            const committed = roundValue(snappedValue, step, min, max);

            fillPercent.set(percentFromValue(committed));
            onChange(committed);
          }

          if (rubberStretchPx.current !== 0) {
            rubberStretchPx.set(0);
          }
        }

        isInteracting = false;
        isDragging = false;
      },
    });
    if (!stopGesture) return;

    e.preventDefault();
    isInteracting = true;
    if (wrapperRef) {
      wrapperRect = wrapperRef.getBoundingClientRect();
      scaleVal = wrapperRect.width / wrapperRef.offsetWidth;
    }
  };

  const handleInputSubmit = () => {
    if (editingEnded) return;
    editingEnded = true;
    const parsed = Number.parseFloat(inputValue);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(roundValue(clamped, step, min, max));
    }

    showInput = false;
    isValueHovered = false;
    isValueEditable = false;
  };

  const handleValueClick = (e: MouseEvent) => {
    if (!isValueEditable) return;
    e.stopPropagation();
    e.preventDefault();
    editingEnded = false;
    showInput = true;
    inputValue = value.toFixed(decimalsForStep(step, min, max));
  };

  const displayValue = $derived(value.toFixed(decimalsForStep(step, min, max)));

  const trackStyle = $derived(`width:calc(100% + ${Math.abs(rubberStretchPx.current)}px);transform:translateX(${rubberStretchPx.current < 0 ? rubberStretchPx.current : 0}px);`);
  const fillStyle = $derived(`width:${fillPercent.current}%;`);
  const handleStyle = $derived(`left:max(5px, calc(${fillPercent.current}% - 9px));opacity:${handleOpacityMv.current};transform:translateY(-50%) scaleX(${handleScaleXMv.current}) scaleY(${handleScaleYMv.current});`);
</script>

<div bind:this={wrapperRef} class="dialkit-slider-wrapper">
  <div
    class={`dialkit-slider ${isActive ? 'dialkit-slider-active' : ''}`}
    bind:this={trackRef}
    role="slider"
    tabindex={showInput ? -1 : 0}
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={`${displayValue}${unit ? ` ${unit}` : ''}`}
    onkeydown={(event) => handleSliderKey(event, value, min, max, step, (next) => {
      fillPercent.set(percentFromValue(next), { instant: true }); onChange(next);
    }, () => {
      editingEnded = false;
      inputValue = value.toFixed(decimalsForStep(step, min, max)); showInput = true;
    })}
    style={trackStyle}
    onpointerdown={handlePointerDown}
    onmouseenter={() => (isHovered = true)}
    onmouseleave={() => (isHovered = false)}
  >
    <div class="dialkit-slider-hashmarks">
      {#each hashMarks as mark (mark.key)}
        <div class="dialkit-slider-hashmark" style:left={`${mark.left}%`} />
      {/each}
    </div>

    <div class="dialkit-slider-fill" style={fillStyle} />

    <div class="dialkit-slider-handle" style={handleStyle} />

    <span bind:this={labelRef} class="dialkit-slider-label">
      {label}
      {#if shortcut}
        <span class={`dialkit-shortcut-pill${shortcutActive ? ' dialkit-shortcut-pill-active' : ''}`}>
          {formatSliderShortcut(shortcut)}
        </span>
      {/if}
    </span>

    {#if showInput}
      <input
        bind:this={inputRef}
        type="text"
        class="dialkit-slider-input"
        aria-label={`${label} value`}
        value={inputValue}
        oninput={(e) => (inputValue = (e.currentTarget as HTMLInputElement).value)}
        onkeydown={(e) => {
          e.stopPropagation();
          if (e.key !== 'Enter' && e.key !== 'Escape') return;
          e.preventDefault();
          if (e.key === 'Enter') handleInputSubmit();
          else { editingEnded = true; showInput = false; isValueHovered = false; }
          tick().then(() => trackRef?.focus({ preventScroll: true }));
        }}
        onblur={handleInputSubmit}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => e.stopPropagation()}
        onmousedown={(e) => e.stopPropagation()}
      />
    {:else}
      <span
        bind:this={valueSpanRef}
        class={`dialkit-slider-value ${isValueEditable ? 'dialkit-slider-value-editable' : ''}`}
        onmouseenter={() => (isValueHovered = true)}
        onmouseleave={() => (isValueHovered = false)}
        onclick={handleValueClick}
        onpointerdown={(e) => isValueEditable && e.stopPropagation()}
        onmousedown={(e) => isValueEditable && e.stopPropagation()}
        style:cursor={isValueEditable ? 'text' : 'default'}
      >
        {displayValue}
      </span>
    {/if}
  </div>
</div>
