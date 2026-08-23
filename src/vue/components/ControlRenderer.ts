import { Fragment, defineComponent, h, type PropType } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { ControlMeta, DialValue, SpringConfig, TransitionConfig } from '../../store/DialStore';
import type { MidiController, MidiMappingOwner } from '../../midi';
import { ColorControl } from './ColorControl';
import { Folder } from './Folder';
import { SelectControl } from './SelectControl';
import { ShortcutKey } from './ShortcutListener';
import { Slider } from './Slider';
import { SpringControl } from './SpringControl';
import { TextControl } from './TextControl';
import { Toggle } from './Toggle';
import { TransitionControl, type TransitionDurationControl } from './TransitionControl';
import { MidiBadge } from './MidiBadge';
import { inject } from 'vue';

export const ControlRenderer = defineComponent({
  name: 'DialKitControlRenderer',
  props: {
    panelId: { type: String, required: true },
    controls: { type: Array as PropType<ControlMeta[]>, required: true },
    values: { type: Object as PropType<Record<string, DialValue>>, required: true },
    transitionDuration: Object as PropType<TransitionDurationControl>,
    /** Optional MIDI controller — when present, numeric controls gain mapping badges. */
    midi: { type: Object as PropType<MidiController>, required: false, default: undefined },
    midiOwner: { type: Object as PropType<MidiMappingOwner>, required: false, default: undefined },
  },
  setup(props) {
    const shortcut = inject(ShortcutKey, undefined);
    const renderMidiBadge = (path: string) => props.midi?.canMapTarget(props.panelId, path)
      ? h(MidiBadge, { controller: props.midi, panelId: props.panelId, path, ownerToken: props.midiOwner })
      : undefined;
    const renderControl = (control: ControlMeta): ReturnType<typeof h> | null => {
      const value = props.values[control.path];
      switch (control.type) {
        case 'slider':
          return h(Slider, {
            key: control.path,
            label: control.label,
            value: value as number,
            min: control.min,
            max: control.max,
            step: control.step,
            shortcut: control.shortcut,
            shortcutActive: shortcut?.activePanelId.value === props.panelId && shortcut.activePath.value === control.path,
            midiSlot: renderMidiBadge(control.path),
            onChange: (next: number) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'toggle':
          return h(Toggle, {
            key: control.path,
            label: control.label,
            checked: value as boolean,
            shortcut: control.shortcut,
            shortcutActive: shortcut?.activePanelId.value === props.panelId && shortcut.activePath.value === control.path,
            midiSlot: renderMidiBadge(control.path),
            onChange: (next: boolean) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'spring':
          return h(SpringControl, {
            key: control.path,
            panelId: props.panelId,
            path: control.path,
            label: control.label,
            spring: value as SpringConfig,
            midiSlot: renderMidiBadge,
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
            midiSlot: renderMidiBadge,
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
            midiSlot: (control.options?.length ?? 0) > 1 ? renderMidiBadge(control.path) : undefined,
          });
        case 'color':
          return h(ColorControl, {
            key: control.path,
            label: control.label,
            value: value as string,
            onChange: (next: string) => DialStore.updateValue(props.panelId, control.path, next),
          });
        case 'action': {
          const midiSlot = renderMidiBadge(control.path);
          return h('div', { key: control.path, class: 'dialkit-midi-action-target' }, [
            h('button', {
              type: 'button',
              class: 'dialkit-button dialkit-midi-action-control',
              onClick: () => DialStore.triggerAction(props.panelId, control.path),
            }, control.label),
            midiSlot,
          ]);
        }
        default:
          return null;
      }
    };
    return () => h(Fragment, null, props.controls.map(renderControl));
  },
});
