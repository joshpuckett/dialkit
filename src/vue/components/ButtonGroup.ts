import { defineComponent, h, type PropType } from 'vue';

export type ButtonGroupButton = {
  label: string;
  onClick: () => void;
};

export const ButtonGroup = defineComponent({
  name: 'DialKitButtonGroup',
  props: {
    buttons: {
      type: Array as PropType<ButtonGroupButton[]>,
      required: true,
    },
  },
  setup(props) {
    return () => h(
      'div',
      { class: 'dialkit-button-group' },
      props.buttons.map((button) =>
        h('button', { class: 'dialkit-button', onClick: button.onClick }, button.label)
      )
    );
  },
});
