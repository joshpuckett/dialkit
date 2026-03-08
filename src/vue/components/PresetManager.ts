import { defineComponent, h, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { Preset } from '../../store/DialStore';

export const PresetManager = defineComponent({
  name: 'DialKitPresetManager',
  props: {
    panelId: { type: String, required: true },
    presets: {
      type: Array as PropType<Preset[]>,
      required: true,
    },
    activePresetId: {
      type: String as PropType<string | null>,
      required: false,
      default: null,
    },
  },
  emits: ['add'],
  setup(props, { emit }) {
    const selection = ref(props.activePresetId ?? '__base__');
    const isOpen = ref(false);
    const rootRef = ref<HTMLElement | null>(null);

    watch(() => props.activePresetId, (value) => {
      selection.value = value ?? '__base__';
    });

    const handleChange = (value: string) => {
      selection.value = value;
      if (value === '__base__') {
        DialStore.clearActivePreset(props.panelId);
      } else {
        DialStore.loadPreset(props.panelId, value);
      }
      isOpen.value = false;
    };

    const activeLabel = () => {
      if (selection.value === '__base__') return 'Version 1';
      return props.presets.find((preset) => preset.id === selection.value)?.name ?? 'Version 1';
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.value && !rootRef.value.contains(target)) {
        isOpen.value = false;
      }
    };

    onMounted(() => {
      document.addEventListener('mousedown', handleDocumentClick);
    });

    onUnmounted(() => {
      document.removeEventListener('mousedown', handleDocumentClick);
    });

    return () => h('div', { class: 'dialkit-preset-manager' }, [
      h('div', { ref: rootRef, class: 'dialkit-preset-native-wrap dialkit-dropdown-wrap' }, [
        h('button', {
          type: 'button',
          class: 'dialkit-preset-trigger dialkit-preset-native dialkit-dropdown-trigger',
          'data-open': String(isOpen.value),
          onClick: () => {
            isOpen.value = !isOpen.value;
          },
        }, [
          h('span', { class: 'dialkit-preset-label' }, activeLabel()),
          h('span', { class: 'dialkit-select-native-chevron', 'aria-hidden': 'true' }, '▾'),
        ]),
        isOpen.value
          ? h('div', { class: 'dialkit-dropdown-menu' }, [
            h('button', {
              type: 'button',
              class: 'dialkit-dropdown-item',
              'data-active': String(selection.value === '__base__'),
              onClick: () => handleChange('__base__'),
            }, 'Version 1'),
            ...props.presets.map((preset) => h('button', {
              type: 'button',
              class: 'dialkit-dropdown-item',
              'data-active': String(preset.id === selection.value),
              onClick: () => handleChange(preset.id),
            }, preset.name)),
          ])
          : null,
      ]),
      h('button', { class: 'dialkit-toolbar-add', title: 'Add preset', onClick: () => emit('add') }, '+'),
    ]);
  },
});
