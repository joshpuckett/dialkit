import { observeDropdownKeyboard } from '../../dropdown-keyboard';
import { openDropdownOnKey } from '../../control-keyboard';
import { Teleport, defineComponent, h, ref, watch, type PropType } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { ICON_CHEVRON, ICON_TRASH, ICON_PLUS, ICON_CHECK } from '../../icons';
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

    const activePreset = () => props.presets.find((preset) => preset.id === props.activePresetId);
    const activeName = () => activePreset()?.name ?? 'Version 1';

    const open = () => {
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

      const stopKeyboard = observeDropdownKeyboard(triggerRef.value!, () => dropdownRef.value, close, 'presets');
      document.addEventListener('mousedown', handler);
      onCleanup(() => {
        stopKeyboard();
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

    const glyph = (path: string | null) => h('svg', { class: 'dialkit-preset-check', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'aria-hidden': 'true' }, path ? [h('path', { d: path })] : []);

    return () => h('div', { class: 'dialkit-preset-manager' }, [
      h('button', {
        ref: triggerRef,
        class: 'dialkit-preset-trigger',
        onClick: toggle,
        'data-open': String(isOpen.value),
        'data-has-preset': String(!!activePreset()),
        type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': isOpen.value,
        'aria-label': `Versions: ${activeName()}`, onKeydown: (e: KeyboardEvent) => openDropdownOnKey(e, open),
      }, [
        h('span', { class: 'dialkit-preset-label' }, activeName()),
        h(motion.svg, {
          class: 'dialkit-select-chevron',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          animate: { rotate: isOpen.value ? 180 : 0, opacity: 0.6 },
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
              }, [glyph(!props.activePresetId ? ICON_CHECK : null), h('button', { type: 'button', class: 'dialkit-preset-name' }, 'Version 1')]),

              ...props.presets.map((preset) => h('div', {
                key: preset.id,
                class: 'dialkit-preset-item',
                'data-active': String(preset.id === props.activePresetId),
                onClick: () => handleSelect(preset.id),
              }, [
                glyph(preset.id === props.activePresetId ? ICON_CHECK : null),
                h('button', { type: 'button', class: 'dialkit-preset-name' }, preset.name),
                h('button', {
                  class: 'dialkit-preset-delete',
                  onClick: (event: MouseEvent) => handleDelete(event, preset.id),
                  type: 'button', title: `Delete ${preset.name}`, 'aria-label': `Delete ${preset.name}`,
                }, [
                  h('svg', {
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': '2',
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'aria-hidden': 'true',
                  }, ICON_TRASH.map((d) => h('path', { d }))),
                ]),
              ])),
              h('div', { class: 'dialkit-preset-divider', role: 'separator' }),
              h('button', { type: 'button', class: 'dialkit-preset-create', onClick: () => { DialStore.saveNewPreset(props.panelId); close(); triggerRef.value?.focus(); } }, [glyph(ICON_PLUS[0]), 'New version']),
            ])]
            : [],
        }),
      ]),
    ]);
  },
});
