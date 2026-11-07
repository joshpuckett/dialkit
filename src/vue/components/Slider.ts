import { handleSliderKey } from '../../control-keyboard';
import { defineComponent, h, computed, nextTick, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { animate, motionValue } from 'motion-v';
import type { ShortcutConfig } from '../../store/DialStore';
import { decimalsForStep, roundValue, snapToDecile, formatSliderShortcut } from '../../shortcut-utils';
import { startPointerGesture, type StopGesture } from '../../pointer-gesture';

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
    let editingEnded = false;

    const percentFromValue = (value: number) => {
      const range = max.value - min.value;
      return range > 0 ? ((value - min.value) / range) * 100 : 0;
    };

    const fillPercent = motionValue(percentFromValue(props.value));
    const rubberStretchPx = motionValue(0);
    const handleOpacityMv = motionValue(0);
    const handleScaleXMv = motionValue(0.25);
    const handleScaleYMv = motionValue(1);

    const percentage = computed(() => percentFromValue(props.value));
    const isActive = computed(() => isInteracting.value || isHovered.value);
    const displayValue = computed(() => props.value.toFixed(decimalsForStep(step.value, min.value, max.value)));
    let stopGesture: StopGesture | null = null;
    let wrapperRect: DOMRect | null = null;
    let scaleVal = 1;
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

    let snapAnim: ReturnType<typeof animate> | null = null;
    let springTarget: number | null = null;
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

    const handleTransform = () => `translateY(-50%) scaleX(${handleScaleXMv.get()}) scaleY(${handleScaleYMv.get()})`;

    const applyHandleVisualStyles = () => {
      if (!handleRef.value) return;
      handleRef.value.style.opacity = String(handleOpacityMv.get());
      handleRef.value.style.transform = handleTransform();
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
      const VALUE_CSS_RIGHT = 12;
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

    const stopSpring = () => {
      snapAnim?.stop();
      snapAnim = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (showInput.value || stopGesture) return;
      const startValue = props.value;
      const startX = event.clientX;
      const startY = event.clientY;
      let isClick = true;

      stopGesture = startPointerGesture(event, event.currentTarget as Element, {
        move(next) {
          if (isClick && Math.hypot(next.clientX - startX, next.clientY - startY) > CLICK_THRESHOLD) {
            isClick = false;
            isDragging.value = true;
          }
          if (isClick) return;

          if (wrapperRect) {
            if (next.clientX < wrapperRect.left) {
              rubberStretchPx.jump(computeRubberStretch(next.clientX, -1));
            } else if (next.clientX > wrapperRect.right) {
              rubberStretchPx.jump(computeRubberStretch(next.clientX, 1));
            } else {
              rubberStretchPx.jump(0);
            }
          }

          const nextValue = positionToValue(next.clientX);
          stopSpring();
          fillPercent.jump(percentFromValue(nextValue));
          emit('change', roundValue(nextValue, step.value, min.value, max.value));
        },
        end(cancelled, last) {
          stopGesture = null;
          if (cancelled) {
            rubberStretchPx.jump(0);
            if (!isClick) emit('change', startValue);
          } else {
            if (isClick && last) {
              const rawValue = positionToValue(last.clientX);
              const discreteSteps = (max.value - min.value) / step.value;
              const snappedValue = discreteSteps <= 10
                ? Math.max(min.value, Math.min(max.value, min.value + Math.round((rawValue - min.value) / step.value) * step.value))
                : snapToDecile(rawValue, min.value, max.value);
              const committed = roundValue(snappedValue, step.value, min.value, max.value);

              stopSpring();
              springTarget = percentFromValue(committed);
              snapAnim = animate(fillPercent, springTarget, {
                type: 'spring',
                stiffness: 300,
                damping: 25,
                mass: 0.8,
                onComplete: () => {
                  snapAnim = null;
                },
              });
              emit('change', committed);
            }

            if (rubberStretchPx.get() !== 0) {
              rubberAnim?.stop();
              rubberAnim = animate(rubberStretchPx, 0, {
                type: 'spring',
                visualDuration: 0.35,
                bounce: 0.15,
              });
            }
          }

          isInteracting.value = false;
          isDragging.value = false;
        },
      });
      if (!stopGesture) return;

      event.preventDefault();
      isInteracting.value = true;
      if (wrapperRef.value) {
        wrapperRect = wrapperRef.value.getBoundingClientRect();
        scaleVal = wrapperRect.width / wrapperRef.value.offsetWidth;
      }
    };

    const handleInputSubmit = () => {
      if (editingEnded) return;
      editingEnded = true;
      const parsed = parseFloat(inputValue.value);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.max(min.value, Math.min(max.value, parsed));
        emit('change', roundValue(clamped, step.value, min.value, max.value));
      }
      showInput.value = false;
      isValueHovered.value = false;
      isValueEditable.value = false;
    };

    const handleValueClick = (event: MouseEvent) => {
      if (!isValueEditable.value) return;
      event.stopPropagation();
      event.preventDefault();
      editingEnded = false;
      showInput.value = true;
      inputValue.value = props.value.toFixed(decimalsForStep(step.value, min.value, max.value));
    };

    const handleInputKeydown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      if (event.key === 'Enter') handleInputSubmit();
      else { editingEnded = true; showInput.value = false; isValueHovered.value = false; }
      queueMicrotask(() => trackRef.value?.focus({ preventScroll: true }));
    };

    // A click's spring keeps running only while the value is still the one it is
    // heading to; a value that arrives from anywhere else takes over at once.
    watch([percentage, isInteracting], () => {
      if (isInteracting.value) return;
      if (snapAnim) {
        if (springTarget === percentage.value) return;
        stopSpring();
      }
      fillPercent.jump(percentage.value);
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
      stopGesture?.(false);
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
        role: 'slider',
        tabindex: showInput.value ? -1 : 0,
        'aria-label': props.label,
        'aria-valuemin': min.value,
        'aria-valuemax': max.value,
        'aria-valuenow': props.value,
        'aria-valuetext': `${displayValue.value}${props.unit ? ` ${props.unit}` : ''}`,
        onKeydown: (event: KeyboardEvent) => handleSliderKey(event, props.value, min.value, max.value, step.value, (next) => {
          stopSpring();
          fillPercent.jump(percentFromValue(next)); emit('change', next);
        }, () => {
          editingEnded = false;
          inputValue.value = props.value.toFixed(decimalsForStep(step.value, min.value, max.value)); showInput.value = true;
        }),
        onPointerdown: handlePointerDown,
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
            width: `${fillPercent.get()}%`,
          },
        }),
        h('div', {
          ref: handleRef,
          class: 'dialkit-slider-handle',
          style: {
            left: `max(5px, calc(${fillPercent.get()}% - 9px))`,
            transform: handleTransform(),
            opacity: handleOpacityMv.get(),
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
            'aria-label': `${props.label} value`,
            value: inputValue.value,
            onInput: (event: Event) => {
              inputValue.value = (event.target as HTMLInputElement).value;
            },
            onKeydown: handleInputKeydown,
            onBlur: handleInputSubmit,
            onPointerdown: (event: PointerEvent) => event.stopPropagation(),
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
            onPointerdown: (event: PointerEvent) => {
              if (isValueEditable.value) event.stopPropagation();
            },
            onMousedown: (event: MouseEvent) => {
              if (isValueEditable.value) event.stopPropagation();
            },
            style: { cursor: isValueEditable.value ? 'text' : 'default' },
          }, displayValue.value),
      ]),
    ]);
  },
});
