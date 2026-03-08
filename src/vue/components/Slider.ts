import { defineComponent, h, computed } from 'vue';

function decimalsForStep(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function roundToStep(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(decimalsForStep(step)));
}

export const Slider = defineComponent({
  name: 'DialKitSlider',
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    min: { type: Number, required: false },
    max: { type: Number, required: false },
    step: { type: Number, required: false },
    unit: { type: String, required: false },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const min = computed(() => props.min ?? 0);
    const max = computed(() => props.max ?? 1);
    const step = computed(() => props.step ?? 0.01);
    const valueText = computed(() => `${props.value.toFixed(decimalsForStep(step.value))}${props.unit ?? ''}`);
    const percent = computed(() => {
      const range = max.value - min.value || 1;
      return ((props.value - min.value) / range) * 100;
    });

    const update = (nextValue: number) => {
      const clamped = Math.min(max.value, Math.max(min.value, nextValue));
      emit('change', roundToStep(clamped, step.value));
    };

    return () => h('div', { class: 'dialkit-slider-native-wrap' }, [
      h('div', { class: 'dialkit-slider-native-header' }, [
        h('span', { class: 'dialkit-slider-native-label' }, props.label),
        h('span', { class: 'dialkit-slider-native-value' }, valueText.value),
      ]),
      h('input', {
        type: 'range',
        class: 'dialkit-slider-native',
        style: { '--dial-slider-pct': `${percent.value}%` },
        min: min.value,
        max: max.value,
        step: step.value,
        value: props.value,
        onInput: (event: Event) => update(Number((event.target as HTMLInputElement).value)),
      }),
    ]);
  },
});
