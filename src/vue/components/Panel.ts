import { defineComponent, h, onMounted, onUnmounted, ref, type PropType } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { ControlMeta, DialValue, PanelConfig, SpringConfig, TransitionConfig } from '../../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { Toggle } from './Toggle';
import { SpringControl } from './SpringControl';
import { TransitionControl } from './TransitionControl';
import { TextControl } from './TextControl';
import { SelectControl } from './SelectControl';
import { ColorControl } from './ColorControl';
import { PresetManager } from './PresetManager';

export const Panel = defineComponent({
  name: 'DialKitPanel',
  props: {
    panel: {
      type: Object as PropType<PanelConfig>,
      required: true,
    },
    defaultOpen: {
      type: Boolean,
      default: true,
    },
    inline: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const copied = ref(false);
    const values = ref<Record<string, DialValue>>(DialStore.getValues(props.panel.id));
    const presets = ref(DialStore.getPresets(props.panel.id));
    const activePresetId = ref<string | null>(DialStore.getActivePresetId(props.panel.id));

    let unsubscribe: (() => void) | undefined;

    onMounted(() => {
      unsubscribe = DialStore.subscribe(props.panel.id, () => {
        values.value = DialStore.getValues(props.panel.id);
        presets.value = DialStore.getPresets(props.panel.id);
        activePresetId.value = DialStore.getActivePresetId(props.panel.id);
      });
    });

    onUnmounted(() => {
      unsubscribe?.();
    });

    const handleAddPreset = () => {
      const nextNum = presets.value.length + 2;
      DialStore.savePreset(props.panel.id, `Version ${nextNum}`);
    };

    const handleCopy = async () => {
      const json = JSON.stringify(values.value, null, 2);
      const instruction = `Update the createDialKit configuration for "${props.panel.name}" with these values:\n\n\`\`\`json\n${json}\n\`\`\`\n\nApply these values as the new defaults in the createDialKit call.`;
      await navigator.clipboard.writeText(instruction);
      copied.value = true;
      window.setTimeout(() => {
        copied.value = false;
      }, 1500);
    };

    const renderControl = (control: ControlMeta) => {
      const value = values.value[control.path];

      switch (control.type) {
        case 'slider':
          return h(Slider, {
            key: control.path,
            label: control.label,
            value: value as number,
            min: control.min,
            max: control.max,
            step: control.step,
            onChange: (next: number) => DialStore.updateValue(props.panel.id, control.path, next),
          });
        case 'toggle':
          return h(Toggle, {
            key: control.path,
            label: control.label,
            checked: value as boolean,
            onChange: (next: boolean) => DialStore.updateValue(props.panel.id, control.path, next),
          });
        case 'spring':
          return h(SpringControl, {
            key: control.path,
            panelId: props.panel.id,
            path: control.path,
            label: control.label,
            spring: value as SpringConfig,
            onChange: (next: SpringConfig) => DialStore.updateValue(props.panel.id, control.path, next),
          });
        case 'transition':
          return h(TransitionControl, {
            key: control.path,
            panelId: props.panel.id,
            path: control.path,
            label: control.label,
            value: value as TransitionConfig,
            onChange: (next: TransitionConfig) => DialStore.updateValue(props.panel.id, control.path, next),
          });
        case 'folder':
          return h(Folder, {
            key: control.path,
            title: control.label,
            defaultOpen: control.defaultOpen ?? true,
          }, {
            default: () => (control.children ?? []).map(renderControl),
          });
        case 'text':
          return h(TextControl, {
            key: control.path,
            label: control.label,
            value: value as string,
            placeholder: control.placeholder,
            onChange: (next: string) => DialStore.updateValue(props.panel.id, control.path, next),
          });
        case 'select':
          return h(SelectControl, {
            key: control.path,
            label: control.label,
            value: value as string,
            options: control.options ?? [],
            onChange: (next: string) => DialStore.updateValue(props.panel.id, control.path, next),
          });
        case 'color':
          return h(ColorControl, {
            key: control.path,
            label: control.label,
            value: value as string,
            onChange: (next: string) => DialStore.updateValue(props.panel.id, control.path, next),
          });
        case 'action':
          return h('button', {
            key: control.path,
            class: 'dialkit-button',
            onClick: () => DialStore.triggerAction(props.panel.id, control.path),
          }, control.label);
        default:
          return null;
      }
    };

    const toolbar = () => h('div', { class: 'dialkit-panel-toolbar-inner' }, [
      h(PresetManager, {
        panelId: props.panel.id,
        presets: presets.value,
        activePresetId: activePresetId.value,
        onAdd: handleAddPreset,
      }),
      h('button', { class: 'dialkit-toolbar-copy', onClick: handleCopy, title: 'Copy parameters' }, copied.value ? 'Copied' : 'Copy'),
    ]);

    return () => h('div', { class: 'dialkit-panel-wrapper' }, [
      h(Folder, {
        title: props.panel.name,
        defaultOpen: props.defaultOpen,
        isRoot: true,
        inline: props.inline,
        toolbar,
      }, {
        default: () => props.panel.controls.map(renderControl),
      }),
    ]);
  },
});
