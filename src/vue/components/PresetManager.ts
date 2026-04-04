import { Teleport, defineComponent, h, ref, watch, type PropType } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { ICON_CHEVRON, ICON_TRASH } from '../../icons';
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
  setup(props) {
    const isOpen = ref(false);
    const pos = ref({ top: 0, left: 0, width: 0 });

    const triggerRef = ref<HTMLElement | null>(null);
    const dropdownRef = ref<HTMLElement | null>(null);

    const hasPresets = () => props.presets.length > 0;
    const activePreset = () => props.presets.find((preset) => preset.id === props.activePresetId);

    const open = () => {
      if (!hasPresets()) return;
      const rect = triggerRef.value?.getBoundingClientRect();
      if (rect) {
        pos.value = { top: rect.bottom + 4, left: rect.left, width: rect.width };
      }
      isOpen.value = true;
    };

    const close = () => {
      isOpen.value = false;
    };

    const setDropdownRef = (node: unknown) => {
      if (node instanceof HTMLElement) {
        dropdownRef.value = node;
        return;
      }

      if (node && typeof node === 'object' && '$el' in node) {
        const el = (node as { $el?: unknown }).$el;
        dropdownRef.value = el instanceof HTMLElement ? el : null;
        return;
      }

      dropdownRef.value = null;
    };

    const toggle = () => {
      if (isOpen.value) close();
      else open();
    };

    watch(isOpen, (open, _, onCleanup) => {
      if (!open) return;

      const handler = (event: MouseEvent) => {
        const target = event.target as Node;
        if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) return;
        close();
      };

      document.addEventListener('mousedown', handler);
      onCleanup(() => {
        document.removeEventListener('mousedown', handler);
      });
    });

    const handleSelect = (presetId: string | null) => {
      if (presetId) {
        DialStore.loadPreset(props.panelId, presetId);
      } else {
        DialStore.clearActivePreset(props.panelId);
      }
      close();
    };

    const handleDelete = (event: MouseEvent, presetId: string) => {
      event.stopPropagation();
      DialStore.deletePreset(props.panelId, presetId);
    };

    return () => h('div', { class: 'dialkit-preset-manager' }, [
      h('button', {
        ref: triggerRef,
        class: 'dialkit-preset-trigger',
        onClick: toggle,
        'data-open': String(isOpen.value),
        'data-has-preset': String(!!activePreset()),
        'data-disabled': String(!hasPresets()),
      }, [
        h('span', { class: 'dialkit-preset-label' }, activePreset()?.name ?? 'Version 1'),
        h(motion.svg, {
          class: 'dialkit-select-chevron',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          animate: { rotate: isOpen.value ? 180 : 0, opacity: hasPresets() ? 0.6 : 0.25 },
          transition: { type: 'spring', visualDuration: 0.2, bounce: 0.15 },
        }, [h('path', { d: ICON_CHEVRON })]),
      ]),

      h(Teleport, { to: 'body' }, [
        h(AnimatePresence, null, {
          default: () => isOpen.value
            ? [h(motion.div, {
              key: 'dialkit-preset-dropdown',
              ref: setDropdownRef,
              class: 'dialkit-root dialkit-preset-dropdown',
              style: {
                position: 'fixed',
                top: `${pos.value.top}px`,
                left: `${pos.value.left}px`,
                minWidth: `${pos.value.width}px`,
              },
              initial: { opacity: 0, y: 4, scale: 0.97 },
              animate: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, y: 4, scale: 0.97, pointerEvents: 'none' },
              transition: { type: 'spring', visualDuration: 0.15, bounce: 0 },
            }, [
              h('div', {
                class: 'dialkit-preset-item',
                'data-active': String(!props.activePresetId),
                onClick: () => handleSelect(null),
              }, [h('span', { class: 'dialkit-preset-name' }, 'Version 1')]),

              ...props.presets.map((preset) => h('div', {
                key: preset.id,
                class: 'dialkit-preset-item',
                'data-active': String(preset.id === props.activePresetId),
                onClick: () => handleSelect(preset.id),
              }, [
                h('span', { class: 'dialkit-preset-name' }, preset.name),
                h('button', {
                  class: 'dialkit-preset-delete',
                  onClick: (event: MouseEvent) => handleDelete(event, preset.id),
                  title: 'Delete preset',
                }, [
                  h('svg', {
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': '2',
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                  }, ICON_TRASH.map((d) => h('path', { d }))),
                ]),
              ])),
            ])]
            : [],
        }),
      ]),
    ]);
  },
});
