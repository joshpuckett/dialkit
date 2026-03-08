import { defineComponent, h, ref, watch, nextTick, onMounted, onUnmounted, type PropType } from 'vue';

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

    const placePill = () => {
      const button = buttonRefs.get(props.value);
      const container = containerRef.value;
      const pill = pillRef.value;
      if (!button || !container || !pill) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      pill.style.left = `${buttonRect.left - containerRect.left}px`;
      pill.style.width = `${buttonRect.width}px`;
      pill.style.visibility = 'visible';
    };

    let ro: ResizeObserver | undefined;

    onMounted(() => {
      nextTick(() => {
        placePill();
      });

      if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
        ro = new ResizeObserver(() => placePill());
        ro.observe(containerRef.value);
      }
    });

    onUnmounted(() => {
      ro?.disconnect();
    });

    watch(() => props.value, () => {
      nextTick(placePill);
    });

    return () => h('div', { ref: containerRef, class: 'dialkit-segmented' }, [
      h('div', { ref: pillRef, class: 'dialkit-segmented-pill', style: { left: '0px', width: '0px', visibility: 'hidden' } }),
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
