import { defineComponent, h, nextTick, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { animate } from 'motion';

type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

export const SegmentedControl = defineComponent({
  name: 'DialKitSegmentedControl',
  props: {
    options: {
      type: Array as PropType<SegmentedControlOption<string>[]>,
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: false,
      default: undefined,
    },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const containerRef = ref<HTMLElement | null>(null);
    const pillRef = ref<HTMLElement | null>(null);
    const buttonRefs = new Map<string, HTMLElement>();
    const buttonEls: (HTMLElement | null)[] = [];

    // Radiogroup arrow-key navigation: moving focus also moves selection,
    // matching the WAI-ARIA radio pattern.
    const handleKeyDown = (e: KeyboardEvent, index: number) => {
      const len = props.options.length;
      let nextIndex: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIndex = (index + 1) % len;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIndex = (index - 1 + len) % len;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = len - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      emit('change', props.options[nextIndex].value);
      buttonEls[nextIndex]?.focus();
    };

    const pillReady = ref(false);
    let hasAnimated = false;
    let pillAnim: ReturnType<typeof animate> | null = null;

    const measurePill = () => {
      const button = buttonRefs.get(props.value);
      const container = containerRef.value;
      if (!button || !container) return null;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      };
    };

    const setPillImmediate = (left: number, width: number) => {
      if (!pillRef.value) return;
      pillRef.value.style.left = `${left}px`;
      pillRef.value.style.width = `${width}px`;
      pillRef.value.style.visibility = 'visible';
    };

    const updatePill = (shouldAnimate: boolean) => {
      const next = measurePill();
      if (!next) return;

      if (!pillReady.value) {
        setPillImmediate(next.left, next.width);
        pillReady.value = true;
        return;
      }

      if (!shouldAnimate || !hasAnimated || !pillRef.value) {
        pillAnim?.stop();
        pillAnim = null;
        setPillImmediate(next.left, next.width);
        return;
      }

      pillAnim?.stop();
      pillAnim = animate(
        pillRef.value,
        {
          left: next.left,
          width: next.width,
        },
        {
          type: 'spring',
          visualDuration: 0.2,
          bounce: 0.15,
          onComplete: () => {
            pillAnim = null;
          },
        }
      );
    };

    let ro: ResizeObserver | undefined;

    onMounted(() => {
      nextTick(() => {
        updatePill(false);
        hasAnimated = true;
      });

      if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
        ro = new ResizeObserver(() => updatePill(false));
        ro.observe(containerRef.value);
      }
    });

    onUnmounted(() => {
      pillAnim?.stop();
      ro?.disconnect();
    });

    watch(
      () => props.value,
      () => {
        updatePill(true);
      },
      { flush: 'post' }
    );

    const activeIndex = () => Math.max(0, props.options.findIndex((o) => o.value === props.value));

    return () => h('div', {
      ref: containerRef,
      class: 'dialkit-segmented',
      role: 'radiogroup',
      'aria-label': props.label,
    }, [
      h('div', {
        ref: pillRef,
        class: 'dialkit-segmented-pill',
        style: {
          left: '0px',
          width: '0px',
          visibility: pillReady.value ? 'visible' : 'hidden',
        },
      }),
      ...props.options.map((option, index) => {
        const isActive = props.value === option.value;
        return h('button', {
          ref: ((el: Element | null) => {
            if (el instanceof HTMLElement) {
              buttonRefs.set(option.value, el);
              buttonEls[index] = el;
              return;
            }

            buttonRefs.delete(option.value);
            buttonEls[index] = null;
          }) as any,
          type: 'button',
          role: 'radio',
          'aria-checked': isActive,
          tabindex: index === activeIndex() ? 0 : -1,
          class: 'dialkit-segmented-button',
          'data-active': String(isActive),
          onClick: () => emit('change', option.value),
          onKeydown: (e: KeyboardEvent) => handleKeyDown(e, index),
        }, option.label);
      }),
    ]);
  },
});
