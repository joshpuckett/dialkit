import { beginSliderDrag, evaluateNumber, formatEditableValue, handleSliderKey, numericInputKeyValue, updateSliderDrag, type SliderDragState } from '../../control-keyboard';
import { announce } from '../../announce';
import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { animate, motionValue } from 'motion';
import type { ShortcutConfig } from '../../store/DialStore';
import type { AnimationHandle } from '../primitives';
import {
  roundValue,
  snapToDecile,
  formatSliderShortcut,
} from '../../shortcut-utils';

interface SliderProps {
  label: string;
  value: number;
  defaultValue?: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  shortcut?: ShortcutConfig;
  shortcutActive?: boolean;
}

const CLICK_THRESHOLD = 3;
const DEAD_ZONE = 32;
const MAX_CURSOR_RANGE = 200;
const MAX_STRETCH = 8;

export function Slider(props: SliderProps) {
  const min = () => props.min ?? 0;
  const max = () => props.max ?? 1;
  const step = () => props.step ?? 0.01;

  let wrapperRef!: HTMLDivElement;
  let trackRef!: HTMLDivElement;
  let fillRef!: HTMLDivElement;
  let handleRef!: HTMLDivElement;
  let labelRef!: HTMLSpanElement;
  let valueSpanRef!: HTMLSpanElement;
  let inputRef!: HTMLInputElement;
  let editingEnded = false;

  const [isInteracting, setIsInteracting] = createSignal(false);
  const [isDragging, setIsDragging] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);
  const [isFocusVisible, setIsFocusVisible] = createSignal(false);
  const [isValueHovered, setIsValueHovered] = createSignal(false);
  const [isValueEditable, setIsValueEditable] = createSignal(false);
  const [showInput, setShowInput] = createSignal(false);
  const [inputValue, setInputValue] = createSignal('');
  const [inputInvalid, setInputInvalid] = createSignal(false);

  const fillPercent = motionValue(((props.value - min()) / (max() - min())) * 100);
  const rubberStretchPx = motionValue(0);
  const handleOpacityMv = motionValue(0);
  const handleScaleXMv = motionValue(0.25);
  const handleScaleYMv = motionValue(1);

  const applyFillStyles = (pct: number) => {
    if (fillRef) fillRef.style.width = `${pct}%`;
    if (handleRef) handleRef.style.left = `max(5px, calc(${pct}% - 9px))`;
  };

  const applyRubberStyles = (stretch: number) => {
    if (!trackRef) return;
    trackRef.style.width = `calc(100% + ${Math.abs(stretch)}px)`;
    trackRef.style.transform = `translateX(${stretch < 0 ? stretch : 0}px)`;
  };

  const applyHandleVisualStyles = () => {
    if (!handleRef) return;
    handleRef.style.opacity = String(handleOpacityMv.get());
    handleRef.style.transform = `translateY(-50%) scaleX(${handleScaleXMv.get()}) scaleY(${handleScaleYMv.get()})`;
  };

  // Sync fill from props when not interacting
  createEffect(() => {
    if (!isInteracting() && !snapAnim) {
      fillPercent.jump(((props.value - min()) / (max() - min())) * 100);
    }
  });

  const percentage = () => ((props.value - min()) / (max() - min())) * 100;
  const isActive = () => isInteracting() || isHovered() || isFocusVisible();

  let pointerDownPos: { x: number; y: number } | null = null;
  let isClickFlag = true;
  let dragState: SliderDragState | null = null;
  let wrapperRect: DOMRect | null = null;
  let scaleVal = 1;
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let snapAnim: AnimationHandle | null = null;
  let rubberAnim: AnimationHandle | null = null;
  let handleOpacityAnim: AnimationHandle | null = null;
  let handleScaleXAnim: AnimationHandle | null = null;
  let handleScaleYAnim: AnimationHandle | null = null;

  const positionToValue = (clientX: number) => {
    if (!wrapperRect) return props.value;
    const screenX = clientX - wrapperRect.left;
    const sceneX = screenX / scaleVal;
    const nativeWidth = wrapperRef ? wrapperRef.offsetWidth : wrapperRect.width;
    const percent = Math.max(0, Math.min(1, sceneX / nativeWidth));
    const rawValue = min() + percent * (max() - min());
    return Math.max(min(), Math.min(max(), rawValue));
  };

  const percentFromValue = (v: number) => ((v - min()) / (max() - min())) * 100;

  const computeRubberStretch = (clientX: number, sign: number) => {
    if (!wrapperRect) return 0;
    const distancePast = sign < 0 ? wrapperRect.left - clientX : clientX - wrapperRect.right;
    const overflow = Math.max(0, distancePast - DEAD_ZONE);
    return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1.0));
  };

  const cancelInteraction = () => {
    if (!isInteracting()) return;
    setIsInteracting(false);
    setIsDragging(false);
    rubberStretchPx.jump(0);
    pointerDownPos = null;
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (showInput()) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerDownPos = { x: e.clientX, y: e.clientY };
    isClickFlag = true;
    setIsInteracting(true);

    if (wrapperRef) {
      wrapperRect = wrapperRef.getBoundingClientRect();
      scaleVal = wrapperRect.width / wrapperRef.offsetWidth;
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isInteracting() || !pointerDownPos) return;

    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (isClickFlag && distance > CLICK_THRESHOLD) {
      isClickFlag = false;
      setIsDragging(true);
      dragState = beginSliderDrag(positionToValue(pointerDownPos.x), pointerDownPos.x);
    }

    if (!isClickFlag && dragState) {
      if (wrapperRect) {
        if (e.clientX < wrapperRect.left) {
          rubberStretchPx.jump(computeRubberStretch(e.clientX, -1));
        } else if (e.clientX > wrapperRect.right) {
          rubberStretchPx.jump(computeRubberStretch(e.clientX, 1));
        } else {
          rubberStretchPx.jump(0);
        }
      }

      const newValue = updateSliderDrag(dragState, e.clientX, wrapperRect?.width ?? 0, min(), max(), step(), e);
      // Keep the fill continuous unless Shift is snapping to ticks
      const newPct = percentFromValue(e.shiftKey ? newValue : Math.max(min(), Math.min(max(), dragState.raw)));
      if (snapAnim) { snapAnim.stop(); snapAnim = null; }
      fillPercent.jump(newPct);
      props.onChange(newValue);
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!isInteracting()) return;

    if (isClickFlag) {
      const rawValue = positionToValue(e.clientX);
      const discreteSteps = (max() - min()) / step();
      const snappedValue = discreteSteps <= 10
        ? Math.max(min(), Math.min(max(), min() + Math.round((rawValue - min()) / step()) * step()))
        : snapToDecile(rawValue, min(), max());

      const newPct = percentFromValue(snappedValue);

      if (snapAnim) snapAnim.stop();
      snapAnim = animate(fillPercent, newPct, {
        type: 'spring',
        stiffness: 300,
        damping: 25,
        mass: 0.8,
        onComplete: () => {
          snapAnim = null;
        },
      });

      props.onChange(roundValue(snappedValue, step(), min(), max()));
    }

    if (rubberStretchPx.get() !== 0) {
      if (rubberAnim) rubberAnim.stop();
      rubberAnim = animate(rubberStretchPx, 0, {
        type: 'spring',
        visualDuration: 0.35,
        bounce: 0.15,
      });
    }

    setIsInteracting(false);
    setIsDragging(false);
    pointerDownPos = null;
  };

  const handlePointerCancel = () => {
    cancelInteraction();
  };

  // Handle value hover delay — clear pending timer on each re-run
  createEffect(() => {
    const hovered = isValueHovered();
    const editing = showInput();
    const editable = isValueEditable();

    onCleanup(() => {
      if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null; }
    });

    if (hovered && !editing && !editable) {
      hoverTimeout = setTimeout(() => setIsValueEditable(true), 800);
    } else if (!hovered && !editing) {
      setIsValueEditable(false);
    }
  });

  onCleanup(() => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    snapAnim?.stop();
    rubberAnim?.stop();
    handleOpacityAnim?.stop();
    handleScaleXAnim?.stop();
    handleScaleYAnim?.stop();
  });

  onMount(() => {
    const unsubFill = fillPercent.on('change', applyFillStyles);
    const unsubRubber = rubberStretchPx.on('change', applyRubberStyles);
    const unsubHandleOpacity = handleOpacityMv.on('change', applyHandleVisualStyles);
    const unsubHandleScaleX = handleScaleXMv.on('change', applyHandleVisualStyles);
    const unsubHandleScaleY = handleScaleYMv.on('change', applyHandleVisualStyles);
    applyFillStyles(fillPercent.get());
    applyRubberStyles(rubberStretchPx.get());
    applyHandleVisualStyles();

    onCleanup(() => {
      unsubFill();
      unsubRubber();
      unsubHandleOpacity();
      unsubHandleScaleX();
      unsubHandleScaleY();
    });
  });

  // Focus input when it appears
  createEffect(() => {
    if (showInput() && inputRef) {
      inputRef.focus();
      inputRef.select();
    }
  });

  const formatValue = (v: number) => `${formatEditableValue(v, step(), min(), max())}${props.unit ? ` ${props.unit}` : ''}`;

  const setValueNow = (next: number) => {
    snapAnim?.stop();
    snapAnim = null;
    fillPercent.jump(percentFromValue(next));
    props.onChange(next);
  };

  const reset = () => {
    const defaultValue = props.defaultValue;
    if (defaultValue === undefined) return;
    setValueNow(defaultValue);
    announce(`${props.label} reset to ${formatValue(defaultValue)}`);
  };

  const openInput = () => {
    editingEnded = false;
    setInputInvalid(false);
    setInputValue(formatEditableValue(props.value, step(), min(), max()));
    setShowInput(true);
  };

  const handleInputSubmit = () => {
    if (editingEnded) return;
    editingEnded = true;
    const next = evaluateNumber(inputValue(), props.value, min(), max(), props.unit);
    if (next !== undefined) props.onChange(roundValue(next, step(), min(), max()));
    setShowInput(false);
    setIsValueHovered(false);
    setIsValueEditable(false);
  };

  const handleValueClick = (e: MouseEvent) => {
    if (isValueEditable()) {
      e.stopPropagation();
      e.preventDefault();
      openInput();
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    e.stopPropagation();
    const stepped = numericInputKeyValue(e, inputValue(), props.value, min(), max(), step(), props.unit);
    if (stepped !== undefined) {
      e.preventDefault();
      e.currentTarget.value = formatEditableValue(stepped, step(), min(), max());
      setInputValue(e.currentTarget.value);
      e.currentTarget.select();
      setInputInvalid(false);
      return;
    }
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    if (e.key === 'Enter' && evaluateNumber(inputValue(), props.value, min(), max(), props.unit) === undefined) {
      setInputInvalid(true);
      e.currentTarget.select();
      announce(`${props.label}: enter a number, for example 24 or 24*2`);
      return;
    }
    if (e.key === 'Enter') handleInputSubmit();
    else { editingEnded = true; setShowInput(false); setIsValueHovered(false); }
    queueMicrotask(() => trackRef?.focus({ preventScroll: true }));
  };

  const displayValue = () => formatEditableValue(props.value, step(), min(), max());

  // Value dodge: fade handle when it overlaps label or value text
  const HANDLE_BUFFER = 8;
  const LABEL_CSS_LEFT = 10;
  const VALUE_CSS_RIGHT = 12;

  const leftThreshold = () => {
    const trackWidth = wrapperRef?.offsetWidth;
    if (trackWidth && labelRef) {
      return ((LABEL_CSS_LEFT + labelRef.offsetWidth + HANDLE_BUFFER) / trackWidth) * 100;
    }
    return 30;
  };

  const rightThreshold = () => {
    const trackWidth = wrapperRef?.offsetWidth;
    if (trackWidth && valueSpanRef) {
      return ((trackWidth - VALUE_CSS_RIGHT - valueSpanRef.offsetWidth - HANDLE_BUFFER) / trackWidth) * 100;
    }
    return 78;
  };

  const valueDodge = () => percentage() < leftThreshold() || percentage() > rightThreshold();

  const handleOpacity = () => {
    if (!isActive()) return 0;
    if (valueDodge()) return 0.1;
    if (isDragging()) return 0.9;
    return 0.5;
  };

  createEffect(() => {
    const targetOpacity = handleOpacity();
    const targetScaleX = isActive() ? 1 : 0.25;
    const targetScaleY = isActive() && valueDodge() ? 0.75 : 1;

    handleOpacityAnim?.stop();
    handleScaleXAnim?.stop();
    handleScaleYAnim?.stop();

    handleOpacityAnim = animate(handleOpacityMv, targetOpacity, { duration: 0.15 });
    handleScaleXAnim = animate(handleScaleXMv, targetScaleX, {
      type: 'spring',
      visualDuration: 0.25,
      bounce: 0.15,
    });
    handleScaleYAnim = animate(handleScaleYMv, targetScaleY, {
      type: 'spring',
      visualDuration: 0.2,
      bounce: 0.1,
    });
  });

  const discreteSteps = () => (max() - min()) / step();

  const hashMarks = () => {
    const ds = discreteSteps();
    if (ds <= 10) {
      return Array.from({ length: ds - 1 }, (_, i) => {
        const pct = ((i + 1) * step()) / (max() - min()) * 100;
        return <div class="dialkit-slider-hashmark" style={{ left: `${pct}%` }} />;
      });
    }
    return Array.from({ length: 9 }, (_, i) => {
      const pct = (i + 1) * 10;
      return <div class="dialkit-slider-hashmark" style={{ left: `${pct}%` }} />;
    });
  };

  return (
    <div ref={wrapperRef} class="dialkit-slider-wrapper">
      <div
        ref={trackRef}
        class={`dialkit-slider ${isActive() ? 'dialkit-slider-active' : ''}`}
        role="slider"
        tabIndex={showInput() ? -1 : 0}
        aria-label={props.label}
        aria-valuemin={min()}
        aria-valuemax={max()}
        aria-valuenow={props.value}
        aria-valuetext={formatValue(props.value)}
        onKeyDown={(e) => handleSliderKey(e, props.value, min(), max(), step(), setValueNow, openInput, props.defaultValue === undefined ? undefined : reset)}
        onFocus={(e) => setIsFocusVisible(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setIsFocusVisible(false)}
        onDblClick={() => { if (!showInput()) reset(); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div class="dialkit-slider-hashmarks">{hashMarks()}</div>

        <div
          ref={fillRef}
          class="dialkit-slider-fill"
          style={{
            width: `${fillPercent.get()}%`,
          }}
        />

        <div
          ref={handleRef}
          class="dialkit-slider-handle"
          style={{
            left: `max(5px, calc(${fillPercent.get()}% - 9px))`,
            transform: 'translateY(-50%) scaleX(0.25) scaleY(1)',
            opacity: 0,
          }}
        />

        <span ref={labelRef} class="dialkit-slider-label">
          {props.label}
          <Show when={props.shortcut}>
            <span class={`dialkit-shortcut-pill${props.shortcutActive ? ' dialkit-shortcut-pill-active' : ''}`}>
              {formatSliderShortcut(props.shortcut!)}
            </span>
          </Show>
        </span>

        {showInput() ? (
          <input
            ref={inputRef}
            type="text"
            class="dialkit-slider-input"
            aria-label={`${props.label} value`}
            aria-invalid={inputInvalid() || undefined}
            value={inputValue()}
            onInput={(e) => { setInputValue(e.currentTarget.value); setInputInvalid(false); }}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputSubmit}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            ref={valueSpanRef}
            class={`dialkit-slider-value ${isValueEditable() ? 'dialkit-slider-value-editable' : ''}`}
            onMouseEnter={() => setIsValueHovered(true)}
            onMouseLeave={() => setIsValueHovered(false)}
            onClick={handleValueClick}
            onPointerDown={(e) => isValueEditable() && e.stopPropagation()}
            onMouseDown={(e) => isValueEditable() && e.stopPropagation()}
            style={{ cursor: isValueEditable() ? 'text' : 'default' }}
          >
            {displayValue()}
          </span>
        )}
      </div>
    </div>
  );
}
