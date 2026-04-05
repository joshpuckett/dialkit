import { defineComponent, h, type PropType } from 'vue';
import { SegmentedControl } from './SegmentedControl';
import type { ShortcutConfig } from '../../store/DialStore';
import { formatToggleShortcut } from '../../shortcut-utils';

export const Toggle = defineComponent({
  name: 'DialKitToggle',
  props: {
    label: { type: String, required: true },
    checked: { type: Boolean, required: true },
    shortcut: { type: Object as PropType<ShortcutConfig>, default: undefined },
    shortcutActive: { type: Boolean, default: false },
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('div', { class: 'dialkit-labeled-control' }, [
      h('span', { class: 'dialkit-labeled-control-label' }, [
        props.label,
        props.shortcut
          ? h('span', {
              class: `dialkit-shortcut-pill${props.shortcutActive ? ' dialkit-shortcut-pill-active' : ''}`,
            }, formatToggleShortcut(props.shortcut))
          : null,
      ]),
      h(SegmentedControl, {
        options: [
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' },
        ],
        value: props.checked ? 'on' : 'off',
        onChange: (value: string) => emit('change', value === 'on'),
      }),
    ]);
  },
});
