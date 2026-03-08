import { defineComponent, h, onMounted, onUnmounted, ref, type PropType } from 'vue';

type SelectOption = string | { value: string; label: string };

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeOptions(options: SelectOption[]): { value: string; label: string }[] {
  return options.map((option) =>
    typeof option === 'string' ? { value: option, label: toTitleCase(option) } : option
  );
}

export const SelectControl = defineComponent({
  name: 'DialKitSelectControl',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    options: {
      type: Array as PropType<SelectOption[]>,
      required: true,
    },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const isOpen = ref(false);
    const rootRef = ref<HTMLElement | null>(null);

    const normalizedOptions = () => normalizeOptions(props.options);
    const selectedLabel = () => normalizedOptions().find((option) => option.value === props.value)?.label ?? props.value;

    const toggle = () => {
      isOpen.value = !isOpen.value;
    };

    const close = () => {
      isOpen.value = false;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.value && !rootRef.value.contains(target)) {
        close();
      }
    };

    onMounted(() => {
      document.addEventListener('mousedown', handleDocumentClick);
    });

    onUnmounted(() => {
      document.removeEventListener('mousedown', handleDocumentClick);
    });

    return () => {
      const normalized = normalizedOptions();

      return h('div', { ref: rootRef, class: 'dialkit-select-row' }, [
        h('span', { class: 'dialkit-labeled-control-label' }, props.label),
        h('div', { class: 'dialkit-select-native-wrap dialkit-dropdown-wrap' }, [
          h('button', {
            type: 'button',
            class: 'dialkit-select-native dialkit-dropdown-trigger',
            'data-open': String(isOpen.value),
            onClick: toggle,
          }, [
            h('span', { class: 'dialkit-select-native-value' }, selectedLabel()),
            h('span', { class: 'dialkit-select-native-chevron', 'aria-hidden': 'true' }, '▾'),
          ]),
          isOpen.value
            ? h('div', { class: 'dialkit-dropdown-menu' }, normalized.map((option) =>
              h('button', {
                type: 'button',
                class: 'dialkit-dropdown-item',
                'data-active': String(option.value === props.value),
                onClick: () => {
                  emit('change', option.value);
                  close();
                },
              }, option.label)
            ))
            : null,
        ]),
      ]);
    };
  },
});
