import { Fragment, defineComponent, h, type PropType } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { ControlMeta, DialValue, SpringConfig, TransitionConfig } from '../../store/DialStore';
import { ColorControl } from './ColorControl';
import { ImageControl } from './ImageControl';
import { DialPad } from './DialPad';
import type { DialPadValue } from '../../dial-pad';
import { Folder } from './Folder';
import { SelectControl } from './SelectControl';
import { ShortcutKey } from './ShortcutListener';
import { Slider } from './Slider';
import { SpringControl } from './SpringControl';
import { TextControl } from './TextControl';
import { Toggle } from './Toggle';
import { TransitionControl, type TransitionDurationControl } from './TransitionControl';
import { inject } from 'vue';

export const ControlRenderer = defineComponent({
  name: 'DialKitControlRenderer',
  props: {
    panelId: { type: String, required: true },
    controls: { type: Array as PropType<ControlMeta[]>, required: true },
    values: { type: Object as PropType<Record<string, DialValue>>, required: true },
    transitionDuration: Object as PropType<TransitionDurationControl>,
  },
  setup(props) {
    const shortcut = inject(ShortcutKey, undefined);
    const renderControl = (control: ControlMeta): ReturnType<typeof h> | null => {
      const value = props.values[control.path];
      const defaultValue = DialStore.getDefaultValue(props.panelId, control.path);
      switch (control.type) {
        case 'slider':
          return h(Slider, {
            key: control.path,
            label: control.label,
            value: value as number,
            defaultValue: typeof defaultValue === 'number' ? defaultValue : undefined,
            min: control.min,
            max: control.max,
            step: control.step,
            shortcut: control.shortcut,
            shortcutActive: shortcut?.activePanelId.value === props.panelId && shortcut.activePath.value === control.path,
            onChange: (next: number) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'toggle':
          return h(Toggle, {
            key: control.path,
            label: control.label,
            checked: value as boolean,
            shortcut: control.shortcut,
            shortcutActive: shortcut?.activePanelId.value === props.panelId && shortcut.activePath.value === control.path,
            onChange: (next: boolean) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'spring':
          return h(SpringControl, {
            key: control.path,
            panelId: props.panelId,
            path: control.path,
            label: control.label,
            spring: value as SpringConfig,
            onChange: (next: SpringConfig) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'transition':
          return h(TransitionControl, {
            key: control.path,
            panelId: props.panelId,
            path: control.path,
            label: control.label,
            value: value as TransitionConfig,
            durationControl: props.transitionDuration,
            onChange: (next: TransitionConfig) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'folder':
          return h(Folder, {
            key: control.path,
            title: control.label,
            defaultOpen: control.defaultOpen ?? true,
          }, { default: () => (control.children ?? []).map(renderControl) });
        case 'text':
          return h(TextControl, {
            key: control.path,
            label: control.label,
            value: value as string,
            placeholder: control.placeholder,
            onChange: (next: string) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'select':
          return h(SelectControl, {
            key: control.path,
            label: control.label,
            value: value as string,
            options: control.options ?? [],
            onChange: (next: string) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'color':
          return h(ColorControl, {
            key: control.path,
            label: control.label,
            value: value as string,
            onChange: (next: string) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'image':
          return h(ImageControl, {
            key: control.path,
            options: control.options,
            label: control.label,
            value: value as string,
            onChange: (next: string) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'pad':
          return h(DialPad, {
            key: control.path,
            label: control.label,
            value: value as DialPadValue,
            x: control.pad?.x,
            y: control.pad?.y,
            labels: control.pad?.labels,
            onChange: (next: DialPadValue) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'action':
          return h('button', {
            key: control.path,
            class: 'dialkit-button',
            onClick: () => DialStore.triggerAction(props.panelId, control.path),
          }, control.label);
        default:
          return null;
      }
    };
    return () => h(Fragment, null, props.controls.map(renderControl));
  },
});
