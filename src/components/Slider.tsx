import { handleSliderKey } from '../control-keyboard';
import { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import type { ShortcutConfig } from '../store/DialStore';
import { decimalsForStep, roundValue, snapToDecile, formatSliderShortcut } from '../shortcut-utils';
import { startPointerGesture, type StopGesture } from '../pointer-gesture';

interface SliderProps {
  label: string;
  value: number;
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

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  unit,
  shortcut,
  shortcutActive,
}: SliderProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editingEnded = useRef(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  const valueSpanRef = useRef<HTMLSpanElement>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isValueHovered, setIsValueHovered] = useState(false);
  const [isValueEditable, setIsValueEditable] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gestureRef = useRef<StopGesture | null>(null);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);
  const springTargetRef = useRef<number | null>(null);
  const wrapperRectRef = useRef<DOMRect | null>(null);
  const scaleRef = useRef(1);
  // A gesture's handlers outlive the render that started them.
  const latest = useRef({ onChange, min, max, step });
  latest.current = { onChange, min, max, step };

  const percentFromValue = (v: number) => {
    const range = latest.current.max - latest.current.min;
    return range > 0 ? ((v - latest.current.min) / range) * 100 : 0;
  };
  const percentage = percentFromValue(value);
  const isActive = isInteracting || isHovered;

  // Motion values for imperative animation
  const fillPercent = useMotionValue(percentage);
  const fillWidth = useTransform(fillPercent, (pct) => `${pct}%`);
  const handleLeft = useTransform(fillPercent, (pct) =>
    `max(5px, calc(${pct}% - 9px))`
  );

  // Rubber band motion values
  const rubberStretchPx = useMotionValue(0);
  const rubberBandWidth = useTransform(
    rubberStretchPx,
    (stretch) => `calc(100% + ${Math.abs(stretch)}px)`
  );
  const rubberBandX = useTransform(
    rubberStretchPx,
    (stretch) => (stretch < 0 ? stretch : 0)
  );

  // Sync from props when not interacting. A click's spring keeps running only
  // while the value is still the one it is heading to; a value that arrives from
  // anywhere else (a version switch, a shortcut) takes over at once.
  useEffect(() => {
    if (isInteracting) return;
    if (animRef.current) {
      if (springTargetRef.current === percentage) return;
      animRef.current.stop();
      animRef.current = null;
    }
    fillPercent.jump(percentage);
  }, [percentage, isInteracting, fillPercent]);

  const positionToValue = (clientX: number) => {
    const { min, max } = latest.current;
    const rect = wrapperRectRef.current;
    if (!rect) return value;
    const screenX = clientX - rect.left;
    const sceneX = screenX / scaleRef.current;
    const nativeWidth = wrapperRef.current ? wrapperRef.current.offsetWidth : rect.width;
    const percent = Math.max(0, Math.min(1, sceneX / nativeWidth));
    return Math.max(min, Math.min(max, min + percent * (max - min)));
  };

  const computeRubberStretch = (clientX: number, sign: number) => {
    const rect = wrapperRectRef.current;
    if (!rect) return 0;
    const distancePast = sign < 0 ? rect.left - clientX : clientX - rect.right;
    const overflow = Math.max(0, distancePast - DEAD_ZONE);
    return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1.0));
  };

  const stopSpring = () => {
    animRef.current?.stop();
    animRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (showInput || gestureRef.current) return;
    const startValue = value;
    const startX = e.clientX;
    const startY = e.clientY;
    let isClick = true;

    gestureRef.current = startPointerGesture(e.nativeEvent, e.currentTarget, {
      move(next) {
        const distance = Math.hypot(next.clientX - startX, next.clientY - startY);
        if (isClick && distance > CLICK_THRESHOLD) {
          isClick = false;
          setIsDragging(true);
        }
        if (isClick) return;

        // Drag mode: instant update
        const rect = wrapperRectRef.current;
        if (rect) {
          if (next.clientX < rect.left) rubberStretchPx.jump(computeRubberStretch(next.clientX, -1));
          else if (next.clientX > rect.right) rubberStretchPx.jump(computeRubberStretch(next.clientX, 1));
          else rubberStretchPx.jump(0);
        }
        const { min, max, step, onChange } = latest.current;
        const newValue = positionToValue(next.clientX);
        stopSpring();
        fillPercent.jump(percentFromValue(newValue));
        onChange(roundValue(newValue, step, min, max));
      },
      end(cancelled, last) {
        gestureRef.current = null;
        const { min, max, step, onChange } = latest.current;
        if (cancelled) {
          rubberStretchPx.jump(0);
          if (!isClick) onChange(startValue);
        } else {
          if (isClick && last) {
            // When steps are coarse (≤10 positions), click snaps to the nearest step.
            // Otherwise, the original decile-magnetic behavior is preserved
            const rawValue = positionToValue(last.clientX);
            const discreteSteps = (max - min) / step;
            const snappedValue = discreteSteps <= 10
              ? Math.max(min, Math.min(max, min + Math.round((rawValue - min) / step) * step))
              : snapToDecile(rawValue, min, max);
            const committed = roundValue(snappedValue, step, min, max);

            stopSpring();
            springTargetRef.current = percentFromValue(committed);
            animRef.current = animate(fillPercent, springTargetRef.current, {
              type: 'spring',
              stiffness: 300,
              damping: 25,
              mass: 0.8,
              onComplete: () => { animRef.current = null; },
            });
            onChange(committed);
          }

          // Spring rubber band back
          if (rubberStretchPx.get() !== 0) {
            animate(rubberStretchPx, 0, {
              type: 'spring',
              visualDuration: 0.35,
              bounce: 0.15,
            });
          }
        }

        setIsInteracting(false);
        setIsDragging(false);
      },
    });
    if (!gestureRef.current) return;

    e.preventDefault();
    setIsInteracting(true);
    // Capture wrapper rect at pointer down for stable reference
    if (wrapperRef.current) {
      wrapperRectRef.current = wrapperRef.current.getBoundingClientRect();
      scaleRef.current = wrapperRectRef.current.width / wrapperRef.current.offsetWidth;
    }
  };

  useEffect(() => () => {
    animRef.current?.stop();
    gestureRef.current?.(false);
  }, []);

  // Handle value hover delay for editable state
  useEffect(() => {
    if (isValueHovered && !showInput && !isValueEditable) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsValueEditable(true);
      }, 800);
    } else if (!isValueHovered && !showInput) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsValueEditable(false);
    }
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isValueHovered, showInput, isValueEditable]);

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [showInput]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputSubmit = () => {
    if (editingEnded.current) return;
    editingEnded.current = true;
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(roundValue(clamped, step, min, max));
    }
    setShowInput(false);
    setIsValueHovered(false);
    setIsValueEditable(false);
  };

  const handleValueClick = (e: React.MouseEvent) => {
    if (isValueEditable) {
      e.stopPropagation();
      e.preventDefault();
      editingEnded.current = false;
      setShowInput(true);
      setInputValue(value.toFixed(decimalsForStep(step, min, max)));
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    if (e.key === 'Enter') handleInputSubmit();
    else {
      editingEnded.current = true;
      setShowInput(false);
      setIsValueHovered(false);
    }
    queueMicrotask(() => trackRef.current?.focus({ preventScroll: true }));
  };

  const handleInputBlur = () => {
    handleInputSubmit();
  };

  const displayValue = value.toFixed(decimalsForStep(step, min, max));

  // Handle opacity: not active → 0, active → 0.5, dragging → 0.9
  // Value dodge: fade when handle overlaps label (left) or value (right)
  const HANDLE_BUFFER = 8;
  const LABEL_CSS_LEFT = 10;
  const VALUE_CSS_RIGHT = 12;
  let leftThreshold = 30;
  let rightThreshold = 78;
  const trackWidth = wrapperRef.current?.offsetWidth;
  if (trackWidth && trackWidth > 0) {
    if (labelRef.current) {
      leftThreshold = ((LABEL_CSS_LEFT + labelRef.current.offsetWidth + HANDLE_BUFFER) / trackWidth) * 100;
    }
    if (valueSpanRef.current) {
      rightThreshold = ((trackWidth - VALUE_CSS_RIGHT - valueSpanRef.current.offsetWidth - HANDLE_BUFFER) / trackWidth) * 100;
    }
  }
  const valueDodge = percentage < leftThreshold || percentage > rightThreshold;
  const handleOpacity = !isActive
    ? 0
    : valueDodge
      ? 0.1
      : isDragging
        ? 0.9
        : 0.5;

  // The ≤ 10 threshold separates discrete sliders
  // (like step=2 on a 0–10 range → 5 steps) from continuous ones.
  const discreteSteps = (max - min) / step;
  const hashMarks = discreteSteps <= 10
    ? Array.from({ length: discreteSteps - 1 }, (_, i) => {
        const pct = ((i + 1) * step) / (max - min) * 100;
        return (
          <div
            key={i}
            className="dialkit-slider-hashmark"
            style={{ left: `${pct}%` }}
          />
        );
      })
    : Array.from({ length: 9 }, (_, i) => {
        const pct = (i + 1) * 10;
        return (
          <div
            key={i}
            className="dialkit-slider-hashmark"
            style={{ left: `${pct}%` }}
          />
        );
      });

  return (
    <div ref={wrapperRef} className="dialkit-slider-wrapper">
      <motion.div
        ref={trackRef}
        className={`dialkit-slider ${isActive ? 'dialkit-slider-active' : ''}`}
        role="slider"
        tabIndex={showInput ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${displayValue}${unit ? ` ${unit}` : ''}`}
        onKeyDown={(e) => handleSliderKey(e, value, min, max, step, (next) => {
          stopSpring();
          fillPercent.jump(percentFromValue(next)); onChange(next);
        }, () => {
          editingEnded.current = false;
          setInputValue(value.toFixed(decimalsForStep(step, min, max))); setShowInput(true);
        })}
        onPointerDown={handlePointerDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ width: rubberBandWidth, x: rubberBandX }}
      >
        <div className="dialkit-slider-hashmarks">{hashMarks}</div>

        <motion.div
          className="dialkit-slider-fill"
          style={{
            width: fillWidth,
          }}
        />

        <motion.div
          className="dialkit-slider-handle"
          style={{
            left: handleLeft,
            y: '-50%',
          }}
          animate={{
            opacity: handleOpacity,
            scaleX: isActive ? 1 : 0.25,
            scaleY: isActive && valueDodge ? 0.75 : 1,
          }}
          transition={{
            scaleX: { type: 'spring', visualDuration: 0.25, bounce: 0.15 },
            scaleY: { type: 'spring', visualDuration: 0.2, bounce: 0.1 },
            opacity: { duration: 0.15 },
          }}
        />

        <span ref={labelRef} className="dialkit-slider-label">
          {label}
          {shortcut && (
            <span className={`dialkit-shortcut-pill${shortcutActive ? ' dialkit-shortcut-pill-active' : ''}`}>
              {formatSliderShortcut(shortcut)}
            </span>
          )}
        </span>

        {showInput ? (
          <input
            ref={inputRef}
            type="text"
            className="dialkit-slider-input"
            aria-label={`${label} value`}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            ref={valueSpanRef}
            className={`dialkit-slider-value ${isValueEditable ? 'dialkit-slider-value-editable' : ''}`}
            onMouseEnter={() => setIsValueHovered(true)}
            onMouseLeave={() => setIsValueHovered(false)}
            onClick={handleValueClick}
            onPointerDown={(e) => isValueEditable && e.stopPropagation()}
            onMouseDown={(e) => isValueEditable && e.stopPropagation()}
            style={{ cursor: isValueEditable ? 'text' : 'default' }}
          >
            {displayValue}
          </span>
        )}
      </motion.div>
    </div>
  );
}
