import { defineComponent, h, ref, watch } from 'vue';

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function expandShorthandHex(hex: string): string {
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

let colorControlInstance = 0;

export const ColorControl = defineComponent({
  name: 'DialKitColorControl',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const textInputId = ref(`dialkit-color-${++colorControlInstance}`);
    const isEditing = ref(false);
    const editValue = ref(props.value);
    const colorInputRef = ref<HTMLInputElement | null>(null);

    watch(() => props.value, (value) => {
      if (!isEditing.value) editValue.value = value;
    });

    const submit = () => {
      isEditing.value = false;
      if (HEX_COLOR_REGEX.test(editValue.value)) {
        emit('change', editValue.value);
      } else {
        editValue.value = props.value;
      }
    };

    return () => h('div', { class: 'dialkit-color-control' }, [
      h('label', { class: 'dialkit-color-label', for: textInputId.value }, props.label),
      h('div', { class: 'dialkit-color-inputs' }, [
        isEditing.value
          ? h('input', {
            id: textInputId.value,
            type: 'text',
            class: 'dialkit-color-hex-input',
            value: editValue.value,
            autofocus: true,
            onInput: (event: Event) => {
              editValue.value = (event.target as HTMLInputElement).value;
            },
            onBlur: submit,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') {
                isEditing.value = false;
                editValue.value = props.value;
              }
            },
          })
          : h('span', { class: 'dialkit-color-hex', onClick: () => { isEditing.value = true; } }, (props.value ?? '').toUpperCase()),
        h('button', {
          class: 'dialkit-color-swatch',
          style: { backgroundColor: props.value },
          title: 'Pick color',
          'aria-label': `Pick color for ${props.label}`,
          onClick: () => colorInputRef.value?.click(),
        }),
        h('input', {
          ref: colorInputRef,
          type: 'color',
          class: 'dialkit-color-picker-native',
          'aria-label': `${props.label} color picker`,
          value: props.value.length === 4 ? expandShorthandHex(props.value) : props.value.slice(0, 7),
          onInput: (event: Event) => emit('change', (event.target as HTMLInputElement).value),
        }),
      ]),
    ]);
  },
});
