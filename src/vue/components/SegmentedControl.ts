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
  },
  emits: ['change'],
  setup(props, { emit }) {
    const containerRef = ref<HTMLElement | null>(null);
    const pillRef = ref<HTMLElement | null>(null);
    const buttonRefs = new Map<string, HTMLElement>();

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

    return () => h('div', { ref: containerRef, class: 'dialkit-segmented' }, [
      h('div', {
        ref: pillRef,
        class: 'dialkit-segmented-pill',
        style: {
          left: '0px',
          width: '0px',
          visibility: pillReady.value ? 'visible' : 'hidden',
        },
      }),
      ...props.options.map((option) => h('button', {
        ref: ((el: Element | null) => {
          if (el instanceof HTMLElement) {
            buttonRefs.set(option.value, el);
            return;
          }

          buttonRefs.delete(option.value);
        }) as any,
        class: 'dialkit-segmented-button',
        'data-active': String(props.value === option.value),
        onClick: () => emit('change', option.value),
      }, option.label)),
    ]);
  },
});
