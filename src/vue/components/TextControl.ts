import { defineComponent, h, ref } from 'vue';

let textControlInstance = 0;

export const TextControl = defineComponent({
  name: 'DialKitTextControl',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    placeholder: { type: String, required: false },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const inputId = ref(`dialkit-text-${++textControlInstance}`);

    return () => h('div', { class: 'dialkit-text-control' }, [
      h('label', { class: 'dialkit-text-label', for: inputId.value }, props.label),
      h('input', {
        id: inputId.value,
        type: 'text',
        class: 'dialkit-text-input',
        value: props.value,
        placeholder: props.placeholder,
        onInput: (event: Event) => emit('change', (event.target as HTMLInputElement).value),
      }),
    ]);
  },
});
