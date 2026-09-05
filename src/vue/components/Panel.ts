import { buildCopyInstruction } from '../../copy-instruction';
import { Fragment, computed, defineComponent, h, onMounted, onUnmounted, ref, type PropType, type VNodeChild } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { ICON_ADD_PRESET, ICON_CHECK, ICON_CLIPBOARD } from '../../icons';
import { DialStore } from '../../store/DialStore';
import type { DialValue, PanelConfig } from '../../store/DialStore';
import { Folder } from './Folder';
import { ControlRenderer } from './ControlRenderer';
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
    variant: {
      type: String as PropType<'root' | 'section'>,
      default: 'root',
    },
    toolbarExtra: Function as PropType<() => VNodeChild>,
  },
  emits: ['openChange'],
  setup(props, { emit }) {
    const values = ref<Record<string, DialValue>>(DialStore.getValues(props.panel.id));
    const presets = ref(DialStore.getPresets(props.panel.id));
    const activePresetId = ref<string | null>(DialStore.getActivePresetId(props.panel.id));
    const copied = ref(false);
    const storeOpen = ref<boolean | undefined>(DialStore.getPanelOpen(props.panel.id));
    // The store owns open/collapsed state so it can be driven programmatically.
    const isOpen = computed(() => storeOpen.value ?? props.defaultOpen);

    let unsubscribe: (() => void) | undefined;
    let copiedTimeout: number | null = null;

    onMounted(() => {
      unsubscribe = DialStore.subscribe(props.panel.id, () => {
        values.value = DialStore.getValues(props.panel.id);
        presets.value = DialStore.getPresets(props.panel.id);
        activePresetId.value = DialStore.getActivePresetId(props.panel.id);
        storeOpen.value = DialStore.getPanelOpen(props.panel.id);
      });
      DialStore.initPanelOpen(props.panel.id, props.defaultOpen);
    });

    onUnmounted(() => {
      unsubscribe?.();
      if (copiedTimeout) {
        window.clearTimeout(copiedTimeout);
      }
    });

    const handleAddPreset = () => {
      const nextNum = presets.value.length + 2;
      DialStore.savePreset(props.panel.id, `Version ${nextNum}`);
    };

    const handleCopy = async () => {
      const instruction = buildCopyInstruction('useDialKit', props.panel.name, values.value);

      try { await navigator.clipboard.writeText(instruction); }
      catch { return; }

      copied.value = true;
      if (copiedTimeout) {
        window.clearTimeout(copiedTimeout);
      }
      copiedTimeout = window.setTimeout(() => {
        copied.value = false;
      }, 1500);
    };

    const handleOpenChange = (open: boolean) => {
      DialStore.setPanelOpen(props.panel.id, open);
      emit('openChange', open);
    };

    return () => {
      const toolbarNode = h(Fragment, null, [
        h(motion.button, {
          class: 'dialkit-toolbar-add',
          onClick: handleAddPreset,
          title: 'Add preset',
          whilePress: { scale: 0.9 },
          transition: { type: 'spring', visualDuration: 0.15, bounce: 0.3 },
        }, [
          h('svg', {
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }, ICON_ADD_PRESET.map((d) => h('path', { d }))),
        ]),
        h(PresetManager, {
          panelId: props.panel.id,
          presets: presets.value,
          activePresetId: activePresetId.value,
        }),
        h(motion.button, {
          class: 'dialkit-toolbar-copy',
          onClick: handleCopy,
          title: 'Copy parameters',
          whilePress: { scale: 0.95 },
          transition: { type: 'spring', visualDuration: 0.15, bounce: 0.3 },
        }, [
          h('span', { class: 'dialkit-toolbar-copy-icon-wrap' }, [
            h('span', {
              class: 'dialkit-toolbar-copy-icon',
              style: { opacity: copied.value ? 0 : 1, transition: 'opacity 120ms ease' },
            }, [
              h('svg', {
                viewBox: '0 0 24 24',
                fill: 'none',
                width: 16,
                height: 16,
              }, [
                h('path', {
                  d: ICON_CLIPBOARD.board,
                  stroke: 'currentColor',
                  'stroke-width': 2,
                  'stroke-linejoin': 'round',
                }),
                h('path', {
                  d: ICON_CLIPBOARD.sparkle,
                  fill: 'currentColor',
                }),
                h('path', {
                  d: ICON_CLIPBOARD.body,
                  stroke: 'currentColor',
                  'stroke-width': 2,
                  'stroke-linecap': 'round',
                  'stroke-linejoin': 'round',
                }),
              ]),
            ]),
            h(AnimatePresence, { initial: false, mode: 'popLayout' }, {
              default: () => copied.value
                ? [h(motion.span, {
                  key: 'check',
                  class: 'dialkit-toolbar-copy-icon',
                  initial: { scale: 0.5, opacity: 0 },
                  animate: { scale: 1, opacity: 1 },
                  exit: { scale: 0.5, opacity: 0 },
                  transition: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
                }, [
                  h('svg', {
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': 2,
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    width: 16,
                    height: 16,
                  }, [h('path', { d: ICON_CHECK })]),
                ])]
                : [],
            }),
          ]),
          'Copy',
        ]),
        props.toolbarExtra?.(),
      ]);

      if (props.variant === 'section') {
        return h(Folder, {
          title: props.panel.name,
          open: isOpen.value,
          onOpenChange: handleOpenChange,
        }, {
          default: () => [
            h('div', {
              class: 'dialkit-panel-section-toolbar',
              onClick: (event: Event) => event.stopPropagation(),
            }, [toolbarNode]),
            h(ControlRenderer, { panelId: props.panel.id, controls: props.panel.controls, values: values.value }),
          ],
        });
      }

      return h('div', { class: 'dialkit-panel-wrapper' }, [
        h(Folder, {
          title: props.panel.name,
          open: isOpen.value,
          isRoot: true,
          inline: props.inline,
          toolbar: () => toolbarNode,
          onOpenChange: handleOpenChange,
        }, {
          default: () => h(ControlRenderer, { panelId: props.panel.id, controls: props.panel.controls, values: values.value }),
        }),
      ]);
    };
  },
});
