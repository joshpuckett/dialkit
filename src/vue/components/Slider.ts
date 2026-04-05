import { defineComponent, h, computed, nextTick, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { animate, motionValue } from 'motion-v';
import type { ShortcutConfig } from '../../store/DialStore';
import { decimalsForStep, roundValue, snapToDecile, formatSliderShortcut } from '../../shortcut-utils';

const CLICK_THRESHOLD = 3;
const DEAD_ZONE = 32;
const MAX_CURSOR_RANGE = 200;
const MAX_STRETCH = 8;

export const Slider = defineComponent({
  name: 'DialKitSlider',
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    min: { type: Number, required: false },
    max: { type: Number, required: false },
    step: { type: Number, required: false },
    unit: { type: String, required: false },
    shortcut: { type: Object as PropType<ShortcutConfig>, default: undefined },
    shortcutActive: { type: Boolean, default: false },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const min = computed(() => props.min ?? 0);
    const max = computed(() => props.max ?? 1);
    const step = computed(() => props.step ?? 0.01);

    const wrapperRef = ref<HTMLElement | null>(null);
    const trackRef = ref<HTMLElement | null>(null);
    const fillRef = ref<HTMLElement | null>(null);
    const handleRef = ref<HTMLElement | null>(null);
    const labelRef = ref<HTMLElement | null>(null);
    const valueSpanRef = ref<HTMLElement | null>(null);
    const inputRef = ref<HTMLInputElement | null>(null);

    const isInteracting = ref(false);
    const isDragging = ref(false);
    const isHovered = ref(false);
    const isValueHovered = ref(false);
    const isValueEditable = ref(false);
    const showInput = ref(false);
    const inputValue = ref('');

    const fillPercent = motionValue(((props.value - min.value) / (max.value - min.value)) * 100);
    const rubberStretchPx = motionValue(0);
    const handleOpacityMv = motionValue(0);
    const handleScaleXMv = motionValue(0.25);
    const handleScaleYMv = motionValue(1);

    const percentage = computed(() => ((props.value - min.value) / (max.value - min.value)) * 100);
    const isActive = computed(() => isInteracting.value || isHovered.value);
    const displayValue = computed(() => props.value.toFixed(decimalsForStep(step.value)));
    const fillBackground = computed(() =>
      isActive.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.11)'
    );

    let pointerDownPos: { x: number; y: number } | null = null;
    let isClickFlag = true;
    let wrapperRect: DOMRect | null = null;
    let scaleVal = 1;
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

    let snapAnim: ReturnType<typeof animate> | null = null;
    let rubberAnim: ReturnType<typeof animate> | null = null;
    let handleOpacityAnim: ReturnType<typeof animate> | null = null;
    let handleScaleXAnim: ReturnType<typeof animate> | null = null;
    let handleScaleYAnim: ReturnType<typeof animate> | null = null;

    const applyFillStyles = (pct: number) => {
      if (fillRef.value) fillRef.value.style.width = `${pct}%`;
      if (handleRef.value) handleRef.value.style.left = `max(5px, calc(${pct}% - 9px))`;
    };

    const applyRubberStyles = (stretch: number) => {
      if (!trackRef.value) return;
      trackRef.value.style.width = `calc(100% + ${Math.abs(stretch)}px)`;
      trackRef.value.style.transform = `translateX(${stretch < 0 ? stretch : 0}px)`;
    };

    const applyHandleVisualStyles = () => {
      if (!handleRef.value) return;
      handleRef.value.style.opacity = String(handleOpacityMv.get());
      handleRef.value.style.transform = `translateY(-50%) scaleX(${handleScaleXMv.get()}) scaleY(${handleScaleYMv.get()})`;
    };

    const positionToValue = (clientX: number) => {
      if (!wrapperRect) return props.value;
      const screenX = clientX - wrapperRect.left;
      const sceneX = screenX / scaleVal;
      const nativeWidth = wrapperRef.value ? wrapperRef.value.offsetWidth : wrapperRect.width;
      const pct = Math.max(0, Math.min(1, sceneX / nativeWidth));
      const rawValue = min.value + pct * (max.value - min.value);
      return Math.max(min.value, Math.min(max.value, rawValue));
    };

    const percentFromValue = (value: number) => ((value - min.value) / (max.value - min.value)) * 100;

    const computeRubberStretch = (clientX: number, sign: number) => {
      if (!wrapperRect) return 0;
      const distancePast = sign < 0 ? wrapperRect.left - clientX : clientX - wrapperRect.right;
      const overflow = Math.max(0, distancePast - DEAD_ZONE);
      return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1));
    };

    const leftThreshold = () => {
      const HANDLE_BUFFER = 8;
      const LABEL_CSS_LEFT = 10;
      const trackWidth = wrapperRef.value?.offsetWidth;
      if (trackWidth && labelRef.value) {
        return ((LABEL_CSS_LEFT + labelRef.value.offsetWidth + HANDLE_BUFFER) / trackWidth) * 100;
      }
      return 30;
    };

    const rightThreshold = () => {
      const HANDLE_BUFFER = 8;
      const VALUE_CSS_RIGHT = 10;
      const trackWidth = wrapperRef.value?.offsetWidth;
      if (trackWidth && valueSpanRef.value) {
        return ((trackWidth - VALUE_CSS_RIGHT - valueSpanRef.value.offsetWidth - HANDLE_BUFFER) / trackWidth) * 100;
      }
      return 78;
    };

    const valueDodge = () => percentage.value < leftThreshold() || percentage.value > rightThreshold();

    const handleOpacity = () => {
      if (!isActive.value) return 0;
      if (valueDodge()) return 0.1;
      if (isDragging.value) return 0.9;
      return 0.5;
    };

    const animateHandleState = () => {
      const targetOpacity = handleOpacity();
      const targetScaleX = isActive.value ? 1 : 0.25;
      const targetScaleY = isActive.value && valueDodge() ? 0.75 : 1;

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
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (showInput.value) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      pointerDownPos = { x: event.clientX, y: event.clientY };
      isClickFlag = true;
      isInteracting.value = true;

      if (wrapperRef.value) {
        wrapperRect = wrapperRef.value.getBoundingClientRect();
        scaleVal = wrapperRect.width / wrapperRef.value.offsetWidth;
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isInteracting.value || !pointerDownPos) return;

      const dx = event.clientX - pointerDownPos.x;
      const dy = event.clientY - pointerDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (isClickFlag && distance > CLICK_THRESHOLD) {
        isClickFlag = false;
        isDragging.value = true;
      }

      if (!isClickFlag) {
        if (wrapperRect) {
          if (event.clientX < wrapperRect.left) {
            rubberStretchPx.jump(computeRubberStretch(event.clientX, -1));
          } else if (event.clientX > wrapperRect.right) {
            rubberStretchPx.jump(computeRubberStretch(event.clientX, 1));
          } else {
            rubberStretchPx.jump(0);
          }
        }

        const nextValue = positionToValue(event.clientX);
        const nextPct = percentFromValue(nextValue);
        if (snapAnim) {
          snapAnim.stop();
          snapAnim = null;
        }
        fillPercent.jump(nextPct);
        emit('change', roundValue(nextValue, step.value));
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!isInteracting.value) return;

      if (isClickFlag) {
        const rawValue = positionToValue(event.clientX);
        const discreteSteps = (max.value - min.value) / step.value;
        const snappedValue = discreteSteps <= 10
          ? Math.max(min.value, Math.min(max.value, min.value + Math.round((rawValue - min.value) / step.value) * step.value))
          : snapToDecile(rawValue, min.value, max.value);

        const nextPct = percentFromValue(snappedValue);

        snapAnim?.stop();
        snapAnim = animate(fillPercent, nextPct, {
          type: 'spring',
          stiffness: 300,
          damping: 25,
          mass: 0.8,
          onComplete: () => {
            snapAnim = null;
          },
        });

        emit('change', roundValue(snappedValue, step.value));
      }

      if (rubberStretchPx.get() !== 0) {
        rubberAnim?.stop();
        rubberAnim = animate(rubberStretchPx, 0, {
          type: 'spring',
          visualDuration: 0.35,
          bounce: 0.15,
        });
      }

      isInteracting.value = false;
      isDragging.value = false;
      pointerDownPos = null;
    };

    const handlePointerCancel = () => {
      if (!isInteracting.value) return;
      isInteracting.value = false;
      isDragging.value = false;
      rubberStretchPx.jump(0);
      pointerDownPos = null;
    };

    const handleInputSubmit = () => {
      const parsed = parseFloat(inputValue.value);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.max(min.value, Math.min(max.value, parsed));
        emit('change', roundValue(clamped, step.value));
      }
      showInput.value = false;
      isValueHovered.value = false;
      isValueEditable.value = false;
    };

    const handleValueClick = (event: MouseEvent) => {
      if (!isValueEditable.value) return;
      event.stopPropagation();
      event.preventDefault();
      showInput.value = true;
      inputValue.value = props.value.toFixed(decimalsForStep(step.value));
    };

    const handleInputKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        handleInputSubmit();
      } else if (event.key === 'Escape') {
        showInput.value = false;
        isValueHovered.value = false;
      }
    };

    watch(() => props.value, () => {
      if (!isInteracting.value && !snapAnim) {
        fillPercent.jump(percentage.value);
      }
    });

    watch([isInteracting, isHovered, isDragging, () => props.value], () => {
      animateHandleState();
    });

    watch([isValueHovered, showInput, isValueEditable], () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }

      if (isValueHovered.value && !showInput.value && !isValueEditable.value) {
        hoverTimeout = setTimeout(() => {
          isValueEditable.value = true;
          animateHandleState();
        }, 800);
      } else if (!isValueHovered.value && !showInput.value) {
        isValueEditable.value = false;
      }
    });

    watch(showInput, async (visible) => {
      if (!visible) return;
      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select();
    });

    const discreteSteps = computed(() => (max.value - min.value) / step.value);
    const hashMarks = computed(() => {
      const marks: ReturnType<typeof h>[] = [];
      if (discreteSteps.value <= 10) {
        const count = Math.max(0, Math.floor(discreteSteps.value) - 1);
        for (let i = 0; i < count; i += 1) {
          const pct = ((i + 1) * step.value) / (max.value - min.value) * 100;
          marks.push(h('div', { class: 'dialkit-slider-hashmark', style: { left: `${pct}%` } }));
        }
        return marks;
      }

      for (let i = 0; i < 9; i += 1) {
        const pct = (i + 1) * 10;
        marks.push(h('div', { class: 'dialkit-slider-hashmark', style: { left: `${pct}%` } }));
      }
      return marks;
    });

    let unsubFill: (() => void) | null = null;
    let unsubRubber: (() => void) | null = null;
    let unsubHandleOpacity: (() => void) | null = null;
    let unsubHandleScaleX: (() => void) | null = null;
    let unsubHandleScaleY: (() => void) | null = null;

    onMounted(() => {
      unsubFill = fillPercent.on('change', applyFillStyles);
      unsubRubber = rubberStretchPx.on('change', applyRubberStyles);
      unsubHandleOpacity = handleOpacityMv.on('change', applyHandleVisualStyles);
      unsubHandleScaleX = handleScaleXMv.on('change', applyHandleVisualStyles);
      unsubHandleScaleY = handleScaleYMv.on('change', applyHandleVisualStyles);

      applyFillStyles(fillPercent.get());
      applyRubberStyles(rubberStretchPx.get());
      applyHandleVisualStyles();
      animateHandleState();
    });

    onUnmounted(() => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      snapAnim?.stop();
      rubberAnim?.stop();
      handleOpacityAnim?.stop();
      handleScaleXAnim?.stop();
      handleScaleYAnim?.stop();

      unsubFill?.();
      unsubRubber?.();
      unsubHandleOpacity?.();
      unsubHandleScaleX?.();
      unsubHandleScaleY?.();
    });

    return () => h('div', { ref: wrapperRef, class: 'dialkit-slider-wrapper' }, [
      h('div', {
        ref: trackRef,
        class: `dialkit-slider ${isActive.value ? 'dialkit-slider-active' : ''}`,
        onPointerdown: handlePointerDown,
        onPointermove: handlePointerMove,
        onPointerup: handlePointerUp,
        onPointercancel: handlePointerCancel,
        onMouseenter: () => {
          isHovered.value = true;
          animateHandleState();
        },
        onMouseleave: () => {
          isHovered.value = false;
          animateHandleState();
        },
      }, [
        h('div', { class: 'dialkit-slider-hashmarks' }, hashMarks.value),
        h('div', {
          ref: fillRef,
          class: 'dialkit-slider-fill',
          style: {
            background: fillBackground.value,
            width: `${fillPercent.get()}%`,
            transition: 'background 0.15s',
          },
        }),
        h('div', {
          ref: handleRef,
          class: 'dialkit-slider-handle',
          style: {
            left: `max(5px, calc(${fillPercent.get()}% - 9px))`,
            transform: 'translateY(-50%) scaleX(0.25) scaleY(1)',
            opacity: 0,
            background: 'rgba(255, 255, 255, 0.9)',
          },
        }),
        h('span', { ref: labelRef, class: 'dialkit-slider-label' }, [
          props.label,
          props.shortcut
            ? h('span', {
                class: `dialkit-shortcut-pill${props.shortcutActive ? ' dialkit-shortcut-pill-active' : ''}`,
              }, formatSliderShortcut(props.shortcut))
            : null,
        ]),
        showInput.value
          ? h('input', {
            ref: inputRef,
            type: 'text',
            class: 'dialkit-slider-input',
            value: inputValue.value,
            onInput: (event: Event) => {
              inputValue.value = (event.target as HTMLInputElement).value;
            },
            onKeydown: handleInputKeydown,
            onBlur: handleInputSubmit,
            onClick: (event: MouseEvent) => event.stopPropagation(),
            onMousedown: (event: MouseEvent) => event.stopPropagation(),
          })
          : h('span', {
            ref: valueSpanRef,
            class: `dialkit-slider-value ${isValueEditable.value ? 'dialkit-slider-value-editable' : ''}`,
            onMouseenter: () => {
              isValueHovered.value = true;
            },
            onMouseleave: () => {
              isValueHovered.value = false;
            },
            onClick: handleValueClick,
            onMousedown: (event: MouseEvent) => {
              if (isValueEditable.value) event.stopPropagation();
            },
            style: { cursor: isValueEditable.value ? 'text' : 'default' },
          }, displayValue.value),
      ]),
    ]);
  },
});
