import { defineComponent, h } from 'vue';
import { SegmentedControl } from './SegmentedControl';

export const Toggle = defineComponent({
  name: 'DialKitToggle',
  props: {
    label: { type: String, required: true },
    checked: { type: Boolean, required: true },
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('div', { class: 'dialkit-labeled-control' }, [
      h('span', { class: 'dialkit-labeled-control-label' }, props.label),
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
