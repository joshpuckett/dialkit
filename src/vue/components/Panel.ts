import { defineComponent, h, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { animate } from 'motion';
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
    const values = ref<Record<string, DialValue>>(DialStore.getValues(props.panel.id));
    const presets = ref(DialStore.getPresets(props.panel.id));
    const activePresetId = ref<string | null>(DialStore.getActivePresetId(props.panel.id));
    const copied = ref(false);
    const addButtonRef = ref<HTMLElement | null>(null);
    const copyButtonRef = ref<HTMLElement | null>(null);
    const clipboardIconRef = ref<SVGElement | null>(null);
    const checkIconRef = ref<SVGElement | null>(null);

    let unsubscribe: (() => void) | undefined;
    let copiedTimeout: ReturnType<typeof window.setTimeout> | null = null;
    const addTapAnim = { value: null as ReturnType<typeof animate> | null };
    const copyTapAnim = { value: null as ReturnType<typeof animate> | null };
    const clipboardIconAnim = { value: null as ReturnType<typeof animate> | null };
    const checkIconAnim = { value: null as ReturnType<typeof animate> | null };

    const applyCopyIconStyles = (isCopied: boolean) => {
      if (!clipboardIconRef.value || !checkIconRef.value) return;
      clipboardIconRef.value.style.opacity = isCopied ? '0' : '1';
      clipboardIconRef.value.style.transform = isCopied ? 'scale(0.5)' : 'scale(1)';
      clipboardIconRef.value.style.filter = isCopied ? 'blur(4px)' : 'blur(0px)';
      checkIconRef.value.style.opacity = isCopied ? '1' : '0';
      checkIconRef.value.style.transform = isCopied ? 'scale(1)' : 'scale(0.5)';
      checkIconRef.value.style.filter = isCopied ? 'blur(0px)' : 'blur(4px)';
    };

    const animateCopyIcons = (isCopied: boolean) => {
      const clipboard = clipboardIconRef.value;
      const check = checkIconRef.value;
      if (!clipboard || !check) return;

      clipboardIconAnim.value?.stop();
      checkIconAnim.value?.stop();

      clipboardIconAnim.value = animate(
        clipboard,
        {
          opacity: isCopied ? 0 : 1,
          scale: isCopied ? 0.5 : 1,
          filter: isCopied ? 'blur(4px)' : 'blur(0px)',
        },
        { type: 'spring', visualDuration: 0.3, bounce: 0.2 }
      );

      checkIconAnim.value = animate(
        check,
        {
          opacity: isCopied ? 1 : 0,
          scale: isCopied ? 1 : 0.5,
          filter: isCopied ? 'blur(0px)' : 'blur(4px)',
        },
        { type: 'spring', visualDuration: 0.3, bounce: 0.2 }
      );
    };

    const animateButtonScale = (
      event: PointerEvent,
      targetScale: number,
      anim: { value: ReturnType<typeof animate> | null }
    ) => {
      const button = event.currentTarget as HTMLElement | null;
      if (!button) return;
      anim.value?.stop();
      anim.value = animate(button, { scale: targetScale }, {
        type: 'spring',
        visualDuration: 0.15,
        bounce: 0.3,
      });
    };

    onMounted(() => {
      unsubscribe = DialStore.subscribe(props.panel.id, () => {
        values.value = DialStore.getValues(props.panel.id);
        presets.value = DialStore.getPresets(props.panel.id);
        activePresetId.value = DialStore.getActivePresetId(props.panel.id);
      });
      applyCopyIconStyles(copied.value);
    });

    onUnmounted(() => {
      unsubscribe?.();
      if (copiedTimeout) {
        window.clearTimeout(copiedTimeout);
      }
      addTapAnim.value?.stop();
      copyTapAnim.value?.stop();
      clipboardIconAnim.value?.stop();
      checkIconAnim.value?.stop();
    });

    watch(copied, (next) => {
      animateCopyIcons(next);
    });

    const handleAddPreset = () => {
      const nextNum = presets.value.length + 2;
      DialStore.savePreset(props.panel.id, `Version ${nextNum}`);
    };

    const handleCopy = () => {
      const json = JSON.stringify(values.value, null, 2);
      const instruction = `Update the useDialKit configuration for "${props.panel.name}" with these values:\n\n\`\`\`json\n${json}\n\`\`\`\n\nApply these values as the new defaults in the useDialKit call.`;

      try {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(instruction).catch(() => undefined);
        }
      } catch {
        // Ignore clipboard errors; the UI confirmation should still run.
      }
      copied.value = true;
      if (copiedTimeout) {
        window.clearTimeout(copiedTimeout);
      }
      copiedTimeout = window.setTimeout(() => {
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

    return () => {
      const toolbarNode = h('div', { class: 'dialkit-panel-toolbar-inner' }, [
        h('button', {
          ref: addButtonRef,
          class: 'dialkit-toolbar-add',
          onClick: handleAddPreset,
          onPointerdown: (event: PointerEvent) => animateButtonScale(event, 0.9, addTapAnim),
          onPointerup: (event: PointerEvent) => animateButtonScale(event, 1, addTapAnim),
          onPointercancel: (event: PointerEvent) => animateButtonScale(event, 1, addTapAnim),
          onPointerleave: (event: PointerEvent) => animateButtonScale(event, 1, addTapAnim),
          title: 'Add preset',
          style: { transform: 'scale(1)' },
        }, [
          h('svg', {
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }, [
            h('path', { d: 'M4 6H20' }),
            h('path', { d: 'M4 12H10' }),
            h('path', { d: 'M15 15L21 15' }),
            h('path', { d: 'M18 12V18' }),
            h('path', { d: 'M4 18H10' }),
          ]),
        ]),
        h(PresetManager, {
          panelId: props.panel.id,
          presets: presets.value,
          activePresetId: activePresetId.value,
        }),
        h('button', {
          ref: copyButtonRef,
          class: 'dialkit-toolbar-copy',
          onClick: handleCopy,
          onPointerdown: (event: PointerEvent) => animateButtonScale(event, 0.95, copyTapAnim),
          onPointerup: (event: PointerEvent) => animateButtonScale(event, 1, copyTapAnim),
          onPointercancel: (event: PointerEvent) => animateButtonScale(event, 1, copyTapAnim),
          onPointerleave: (event: PointerEvent) => animateButtonScale(event, 1, copyTapAnim),
          title: 'Copy parameters',
          style: { transform: 'scale(1)' },
        }, [
          h('span', { class: 'dialkit-toolbar-copy-icon-wrap' }, [
            h('svg', {
              ref: clipboardIconRef,
              class: 'dialkit-toolbar-copy-icon',
              viewBox: '0 0 24 24',
              fill: 'none',
              style: {
                opacity: copied.value ? 0 : 1,
                transform: copied.value ? 'scale(0.5)' : 'scale(1)',
                filter: copied.value ? 'blur(4px)' : 'blur(0px)',
              },
            }, [
              h('path', {
                d: 'M8 6C8 4.34315 9.34315 3 11 3H13C14.6569 3 16 4.34315 16 6V7H8V6Z',
                stroke: 'currentColor',
                'stroke-width': 2,
                'stroke-linejoin': 'round',
              }),
              h('path', {
                d: 'M19.2405 16.1852L18.5436 14.3733C18.4571 14.1484 18.241 14 18 14C17.759 14 17.5429 14.1484 17.4564 14.3733L16.7595 16.1852C16.658 16.4493 16.4493 16.658 16.1852 16.7595L14.3733 17.4564C14.1484 17.5429 14 17.759 14 18C14 18.241 14.1484 18.4571 14.3733 18.5436L16.1852 19.2405C16.4493 19.342 16.658 19.5507 16.7595 19.8148L17.4564 21.6267C17.5429 21.8516 17.759 22 18 22C18.241 22 18.4571 21.8516 18.5436 21.6267L19.2405 19.8148C19.342 19.5507 19.5507 19.342 19.8148 19.2405L21.6267 18.5436C21.8516 18.4571 22 18.241 22 18C22 17.759 21.8516 17.5429 21.6267 17.4564L19.8148 16.7595C19.5507 16.658 19.342 16.4493 19.2405 16.1852Z',
                fill: 'currentColor',
              }),
              h('path', {
                d: 'M16 5H17C18.6569 5 20 6.34315 20 8V11M8 5H7C5.34315 5 4 6.34315 4 8V18C4 19.6569 5.34315 21 7 21H12',
                stroke: 'currentColor',
                'stroke-width': 2,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
              }),
            ]),
            h('svg', {
              ref: checkIconRef,
              class: 'dialkit-toolbar-copy-icon',
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 2,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              style: {
                opacity: copied.value ? 1 : 0,
                transform: copied.value ? 'scale(1)' : 'scale(0.5)',
                filter: copied.value ? 'blur(0px)' : 'blur(4px)',
              },
            }, [
              h('path', { d: 'M5 12.75L10 19L19 5' }),
            ]),
          ]),
          'Copy',
        ]),
      ]);

      return h('div', { class: 'dialkit-panel-wrapper' }, [
        h(Folder, {
          title: props.panel.name,
          defaultOpen: props.defaultOpen,
          isRoot: true,
          inline: props.inline,
          toolbar: () => toolbarNode,
        }, {
          default: () => props.panel.controls.map(renderControl),
        }),
      ]);
    };
  },
});
