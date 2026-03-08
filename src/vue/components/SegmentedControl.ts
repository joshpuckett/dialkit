import { defineComponent, h, ref, watch, nextTick, onMounted, onUnmounted, type PropType } from 'vue';
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
    let hasAnimated = false;
    let pillAnim: ReturnType<typeof animate> | null = null;

    const placePill = (withAnimation: boolean) => {
      const button = buttonRefs.get(props.value);
      const container = containerRef.value;
      const pill = pillRef.value;
      if (!button || !container || !pill) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();

      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;

      if (!hasAnimated || !withAnimation) {
        pillAnim?.stop();
        pill.style.left = `${left}px`;
        pill.style.width = `${width}px`;
      } else {
        pillAnim?.stop();
        pillAnim = animate(
          pill,
          {
            left: `${left}px`,
            width: `${width}px`,
          },
          { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
        );
      }

      hasAnimated = true;
      pill.style.visibility = 'visible';
    };

    let ro: ResizeObserver | undefined;

    onMounted(() => {
      nextTick(() => {
        placePill(false);
      });

      if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
        ro = new ResizeObserver(() => placePill(false));
        ro.observe(containerRef.value);
      }
    });

    onUnmounted(() => {
      pillAnim?.stop();
      ro?.disconnect();
    });

    watch(() => props.value, () => {
      nextTick(() => placePill(true));
    });

    return () => h('div', { ref: containerRef, class: 'dialkit-segmented' }, [
      h('div', {
        ref: pillRef,
        class: 'dialkit-segmented-pill',
        style: { left: '0px', width: '0px', visibility: 'hidden', transition: 'none' },
      }),
      ...props.options.map((option) => h('button', {
        ref: ((el: Element | null) => {
          if (el instanceof HTMLElement) buttonRefs.set(option.value, el);
        }) as any,
        class: 'dialkit-segmented-button',
        'data-active': String(props.value === option.value),
        onClick: () => emit('change', option.value),
      }, option.label)),
    ]);
  },
});
