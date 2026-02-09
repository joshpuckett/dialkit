import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const CLICK_THRESHOLD = 3;
const DEAD_ZONE = 32;
const MAX_CURSOR_RANGE = 200;
const MAX_STRETCH = 8;

function roundValue(val: number, step: number): number {
  const decimals = step >= 1 ? 0 : 2;
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function snapToDecile(rawValue: number, min: number, max: number): number {
  const normalized = (rawValue - min) / (max - min);
  const nearest = Math.round(normalized * 10) / 10;
  if (Math.abs(normalized - nearest) <= 0.03125) {
    return min + nearest * (max - min);
  }
  return rawValue;
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  unit,
}: SliderProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Click-vs-drag detection refs
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const isClickRef = useRef(true);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);
  const wrapperRectRef = useRef<DOMRect | null>(null);
  const scaleRef = useRef(1);

  const percentage = ((value - min) / (max - min)) * 100;
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

  // Sync from props when not interacting (skip if spring animation is active)
  useEffect(() => {
    if (!isInteracting && !animRef.current) {
      fillPercent.jump(percentage);
    }
  }, [percentage, isInteracting, fillPercent]);

  const positionToValue = useCallback(
    (clientX: number) => {
      const rect = wrapperRectRef.current;
      if (!rect) return value;
      const screenX = clientX - rect.left;
      const sceneX = screenX / scaleRef.current;
      const nativeWidth = wrapperRef.current ? wrapperRef.current.offsetWidth : rect.width;
      const percent = Math.max(0, Math.min(1, sceneX / nativeWidth));
      const rawValue = min + percent * (max - min);
      return Math.max(min, Math.min(max, rawValue));
    },
    [min, max, value]
  );

  const percentFromValue = useCallback(
    (v: number) => ((v - min) / (max - min)) * 100,
    [min, max]
  );

  const computeRubberStretch = useCallback(
    (clientX: number, sign: number) => {
      const rect = wrapperRectRef.current;
      if (!rect) return 0;
      const distancePast =
        sign < 0 ? rect.left - clientX : clientX - rect.right;
      const overflow = Math.max(0, distancePast - DEAD_ZONE);
      return (
        sign *
        MAX_STRETCH *
        Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1.0))
      );
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (showInput) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      isClickRef.current = true;
      setIsInteracting(true);

      // Capture wrapper rect at pointer down for stable reference
      if (wrapperRef.current) {
        wrapperRectRef.current = wrapperRef.current.getBoundingClientRect();
        const nativeWidth = wrapperRef.current.offsetWidth;
        scaleRef.current = wrapperRectRef.current.width / nativeWidth;
      }
    },
    [showInput]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isInteracting || !pointerDownPos.current) return;

      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (isClickRef.current && distance > CLICK_THRESHOLD) {
        isClickRef.current = false;
        setIsDragging(true);
      }

      if (!isClickRef.current) {
        // Drag mode — instant update
        const rect = wrapperRectRef.current;
        if (rect) {
          if (e.clientX < rect.left) {
            rubberStretchPx.jump(computeRubberStretch(e.clientX, -1));
          } else if (e.clientX > rect.right) {
            rubberStretchPx.jump(computeRubberStretch(e.clientX, 1));
          } else {
            rubberStretchPx.jump(0);
          }
        }

        const newValue = positionToValue(e.clientX);
        const newPct = percentFromValue(newValue);
        if (animRef.current) {
          animRef.current.stop();
          animRef.current = null;
        }
        fillPercent.jump(newPct);
        onChange(roundValue(newValue, step));
      }
    },
    [
      isInteracting,
      positionToValue,
      percentFromValue,
      onChange,
      fillPercent,
      rubberStretchPx,
      computeRubberStretch,
    ]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isInteracting) return;

      if (isClickRef.current) {
        // Click — snap to decile and spring animate
        const rawValue = positionToValue(e.clientX);
        const snappedValue = snapToDecile(rawValue, min, max);
        const newPct = percentFromValue(snappedValue);

        if (animRef.current) {
          animRef.current.stop();
        }
        animRef.current = animate(fillPercent, newPct, {
          type: 'spring',
          stiffness: 300,
          damping: 25,
          mass: 0.8,
          onComplete: () => { animRef.current = null; },
        });
        onChange(roundValue(snappedValue, step));
      }

      // Spring rubber band back
      if (rubberStretchPx.get() !== 0) {
        animate(rubberStretchPx, 0, {
          type: 'spring',
          visualDuration: 0.35,
          bounce: 0.15,
        });
      }

      setIsInteracting(false);
      setIsDragging(false);
      pointerDownPos.current = null;
    },
    [
      isInteracting,
      positionToValue,
      percentFromValue,
      onChange,
      min,
      max,
      fillPercent,
      rubberStretchPx,
    ]
  );

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
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(roundValue(clamped, step));
    }
    setShowInput(false);
    setIsValueHovered(false);
    setIsValueEditable(false);
  };

  const handleValueClick = (e: React.MouseEvent) => {
    if (isValueEditable) {
      e.stopPropagation();
      e.preventDefault();
      setShowInput(true);
      setInputValue(step >= 1 ? value.toFixed(0) : value.toFixed(2));
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputSubmit();
    } else if (e.key === 'Escape') {
      setShowInput(false);
      setIsValueHovered(false);
    }
  };

  const handleInputBlur = () => {
    handleInputSubmit();
  };

  const displayValue = step >= 1 ? value.toFixed(0) : value.toFixed(2);

  // Handle opacity: not active → 0, active → 0.5, dragging → 0.9
  // Value dodge: fade when handle overlaps label (left) or value (right)
  const HANDLE_BUFFER = 8;
  const LABEL_CSS_LEFT = 10;
  const VALUE_CSS_RIGHT = 10;
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

  const fillBackground = isActive
    ? 'rgba(255, 255, 255, 0.15)'
    : 'rgba(255, 255, 255, 0.11)';

  const hashMarks = Array.from({ length: 9 }, (_, i) => {
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ width: rubberBandWidth, x: rubberBandX }}
      >
        <div className="dialkit-slider-hashmarks">{hashMarks}</div>

        <motion.div
          className="dialkit-slider-fill"
          style={{
            background: fillBackground,
            width: fillWidth,
            transition: 'background 0.15s',
          }}
        />

        <motion.div
          className="dialkit-slider-handle"
          style={{
            left: handleLeft,
            y: '-50%',
            background: 'rgba(255, 255, 255, 0.9)',
          }}
          animate={{
            opacity: handleOpacity,
            scaleX: isActive ? 1 : 0.25,
          }}
          transition={{
            scaleX: { type: 'spring', visualDuration: 0.25, bounce: 0.15 },
            opacity: { duration: 0.15 },
          }}
        />

        <span ref={labelRef} className="dialkit-slider-label">{label}</span>

        {showInput ? (
          <input
            ref={inputRef}
            type="text"
            className="dialkit-slider-input"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
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
