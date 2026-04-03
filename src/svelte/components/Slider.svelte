<script lang="ts">
  import { tick } from 'svelte';
  import { Spring } from 'svelte/motion';

  let {
    label,
    value,
    onChange,
    min = 0,
    max = 1,
    step = 0.01,
  } = $props<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  }>();

  const CLICK_THRESHOLD = 3;
  const DEAD_ZONE = 32;
  const MAX_CURSOR_RANGE = 200;
  const MAX_STRETCH = 8;
  const HANDLE_BUFFER = 8;
  const LABEL_CSS_LEFT = 10;
  const VALUE_CSS_RIGHT = 10;

  let wrapperRef: HTMLDivElement | undefined;
  let labelRef: HTMLSpanElement | undefined;
  let valueSpanRef: HTMLSpanElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  let isInteracting = $state(false);
  let isDragging = $state(false);
  let isHovered = $state(false);
  let isValueHovered = $state(false);
  let isValueEditable = $state(false);
  let showInput = $state(false);
  let inputValue = $state('');

  const fillPercent = new Spring(((value - min) / (max - min)) * 100, { stiffness: 0.25, damping: 0.7 });
  const rubberStretchPx = new Spring(0, { stiffness: 0.2, damping: 0.65 });
  const handleOpacityMv = new Spring(0, { stiffness: 0.3, damping: 0.75 });
  const handleScaleXMv = new Spring(0.25, { stiffness: 0.2, damping: 0.6 });
  const handleScaleYMv = new Spring(1, { stiffness: 0.2, damping: 0.6 });

  let pointerDownPos: { x: number; y: number } | null = null;
  let isClickFlag = true;
  let wrapperRect: DOMRect | null = null;
  let scaleVal = 1;
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const decimalsForStep = (s: number) => {
    const text = s.toString();
    const dot = text.indexOf('.');
    return dot === -1 ? 0 : text.length - dot - 1;
  };

  const roundValue = (val: number, s: number) => {
    const raw = Math.round(val / s) * s;
    return Number.parseFloat(raw.toFixed(decimalsForStep(s)));
  };

  const snapToDecile = (rawValue: number, minValue: number, maxValue: number) => {
    const normalized = (rawValue - minValue) / (maxValue - minValue);
    const nearest = Math.round(normalized * 10) / 10;

    if (Math.abs(normalized - nearest) <= 0.03125) {
      return minValue + nearest * (maxValue - minValue);
    }

    return rawValue;
  };

  const percentFromValue = (nextValue: number) => ((nextValue - min) / (max - min)) * 100;

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

  $effect(() => {
    value;
    if (!isInteracting) {
      fillPercent.set(((value - min) / (max - min)) * 100, { instant: true });
    }
  });

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

  const percentage = $derived(((value - min) / (max - min)) * 100);
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

  const fillBackground = $derived(
    isActive ? 'var(--dial-slider-fill-active)' : 'var(--dial-slider-fill)'
  );

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
    if (showInput) return;
    e.preventDefault();

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerDownPos = { x: e.clientX, y: e.clientY };
    isClickFlag = true;
    isInteracting = true;

    if (wrapperRef) {
      wrapperRect = wrapperRef.getBoundingClientRect();
      scaleVal = wrapperRect.width / wrapperRef.offsetWidth;
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isInteracting || !pointerDownPos) return;

    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (isClickFlag && distance > CLICK_THRESHOLD) {
      isClickFlag = false;
      isDragging = true;
    }

    if (!isClickFlag) {
      if (wrapperRect) {
        if (e.clientX < wrapperRect.left) {
          rubberStretchPx.set(computeRubberStretch(e.clientX, -1), { instant: true });
        } else if (e.clientX > wrapperRect.right) {
          rubberStretchPx.set(computeRubberStretch(e.clientX, 1), { instant: true });
        } else {
          rubberStretchPx.set(0, { instant: true });
        }
      }

      const newValue = positionToValue(e.clientX);
      fillPercent.set(percentFromValue(newValue), { instant: true });
      onChange(roundValue(newValue, step));
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!isInteracting) return;

    if (isClickFlag) {
      const rawValue = positionToValue(e.clientX);
      const steps = (max - min) / step;
      const snappedValue = steps <= 10
        ? Math.max(min, Math.min(max, min + Math.round((rawValue - min) / step) * step))
        : snapToDecile(rawValue, min, max);

      fillPercent.set(percentFromValue(snappedValue));
      onChange(roundValue(snappedValue, step));
    }

    if (rubberStretchPx.current !== 0) {
      rubberStretchPx.set(0);
    }

    isInteracting = false;
    isDragging = false;
    pointerDownPos = null;
  };

  const handlePointerCancel = () => {
    if (!isInteracting) return;
    isInteracting = false;
    isDragging = false;
    rubberStretchPx.set(0, { instant: true });
    pointerDownPos = null;
  };

  const handleInputSubmit = () => {
    const parsed = Number.parseFloat(inputValue);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(roundValue(clamped, step));
    }

    showInput = false;
    isValueHovered = false;
    isValueEditable = false;
  };

  const handleValueClick = (e: MouseEvent) => {
    if (!isValueEditable) return;
    e.stopPropagation();
    e.preventDefault();
    showInput = true;
    inputValue = value.toFixed(decimalsForStep(step));
  };

  const displayValue = $derived(value.toFixed(decimalsForStep(step)));

  const trackStyle = $derived(`width:calc(100% + ${Math.abs(rubberStretchPx.current)}px);transform:translateX(${rubberStretchPx.current < 0 ? rubberStretchPx.current : 0}px);`);
  const fillStyle = $derived(`background:${fillBackground};width:${fillPercent.current}%;transition:background 0.15s;`);
  const handleStyle = $derived(`left:max(5px, calc(${fillPercent.current}% - 9px));opacity:${handleOpacityMv.current};transform:translateY(-50%) scaleX(${handleScaleXMv.current}) scaleY(${handleScaleYMv.current});background:var(--dial-slider-handle);`);
</script>

<div bind:this={wrapperRef} class="dialkit-slider-wrapper">
  <div
    class={`dialkit-slider ${isActive ? 'dialkit-slider-active' : ''}`}
    style={trackStyle}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
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

    <span bind:this={labelRef} class="dialkit-slider-label">{label}</span>

    {#if showInput}
      <input
        bind:this={inputRef}
        type="text"
        class="dialkit-slider-input"
        value={inputValue}
        oninput={(e) => (inputValue = (e.currentTarget as HTMLInputElement).value)}
        onkeydown={(e) => {
          if (e.key === 'Enter') handleInputSubmit();
          else if (e.key === 'Escape') {
            showInput = false;
            isValueHovered = false;
          }
        }}
        onblur={handleInputSubmit}
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
        onmousedown={(e) => isValueEditable && e.stopPropagation()}
        style:cursor={isValueEditable ? 'text' : 'default'}
      >
        {displayValue}
      </span>
    {/if}
  </div>
</div>
