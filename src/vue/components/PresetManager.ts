import { Teleport, defineComponent, h, ref, watch, type PropType } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { ICON_CHEVRON, ICON_TRASH } from '../../icons';
import { DialStore } from '../../store/DialStore';
import type { Preset } from '../../store/DialStore';
import { useFloatingDropdown } from '../useFloatingDropdown';

let uid = 0;

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
    const activeIndex = ref(-1);

    const triggerRef = ref<HTMLElement | null>(null);
    const dropdownRef = ref<HTMLElement | null>(null);

    const baseId = `dialkit-preset-${uid++}`;
    const listboxId = `${baseId}-listbox`;
    const optionId = (index: number) => `${baseId}-opt-${index}`;

    const hasPresets = () => props.presets.length > 0;
    const activePreset = () => props.presets.find((preset) => preset.id === props.activePresetId);

    // Flat selectable list: the implicit "Version 1" plus each preset.
    const items = (): { id: string | null; name: string }[] => [
      { id: null, name: 'Version 1' },
      ...props.presets.map((p) => ({ id: p.id, name: p.name })),
    ];
    const selectedIndex = () => Math.max(0, items().findIndex((it) => it.id === props.activePresetId));

    useFloatingDropdown(isOpen, triggerRef, dropdownRef, {
      placement: 'bottom-start',
      matchWidth: true,
    });

    const close = () => {
      isOpen.value = false;
    };

    const openMenu = (toIndex: number) => {
      if (!hasPresets()) return;
      activeIndex.value = toIndex;
      isOpen.value = true;
      // macOS Safari/Firefox don't focus a <button> on click — force it.
      triggerRef.value?.focus();
    };

    const toggle = () => {
      if (isOpen.value) close();
      else openMenu(selectedIndex());
    };

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

    // Keep the active item scrolled into view.
    watch([isOpen, activeIndex], () => {
      if (isOpen.value && activeIndex.value >= 0) {
        document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' });
      }
    }, { flush: 'post' });

    const handleTriggerKeyDown = (e: KeyboardEvent) => {
      const list = items();
      if (!isOpen.value) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMenu(selectedIndex());
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          openMenu(list.length - 1);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          activeIndex.value = (activeIndex.value + 1) % list.length;
          break;
        case 'ArrowUp':
          e.preventDefault();
          activeIndex.value = (activeIndex.value - 1 + list.length) % list.length;
          break;
        case 'Home':
          e.preventDefault();
          activeIndex.value = 0;
          break;
        case 'End':
          e.preventDefault();
          activeIndex.value = list.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (activeIndex.value >= 0) handleSelect(list[activeIndex.value].id);
          break;
        case 'Delete':
        case 'Backspace': {
          const target = list[activeIndex.value];
          if (target?.id) {
            e.preventDefault();
            DialStore.deletePreset(props.panelId, target.id);
            activeIndex.value = Math.max(0, activeIndex.value - 1);
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'Tab':
          close();
          break;
      }
    };

    // Close when focus leaves the trigger.
    const handleTriggerBlur = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (dropdownRef.value?.contains(next)) return;
      close();
    };

    // Close on mousedown outside trigger + dropdown.
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

    return () => h('div', { class: 'dialkit-preset-manager' }, [
      h('button', {
        ref: triggerRef,
        class: 'dialkit-preset-trigger',
        'data-open': String(isOpen.value),
        'data-has-preset': String(!!activePreset()),
        'data-disabled': String(!hasPresets()),
        'aria-haspopup': 'listbox',
        'aria-expanded': isOpen.value,
        'aria-controls': isOpen.value ? listboxId : undefined,
        'aria-activedescendant': isOpen.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
        onClick: toggle,
        onKeydown: handleTriggerKeyDown,
        onBlur: handleTriggerBlur,
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
              id: listboxId,
              class: 'dialkit-root dialkit-preset-dropdown',
              role: 'listbox',
              style: { position: 'fixed', top: 0, left: 0 },
              initial: { opacity: 0, y: 4, scale: 0.97 },
              animate: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, y: 4, scale: 0.97, pointerEvents: 'none' },
              transition: { type: 'spring', visualDuration: 0.15, bounce: 0 },
            }, items().map((item, index) => h('div', {
              key: item.id ?? '__none__',
              id: optionId(index),
              class: 'dialkit-preset-item',
              role: 'option',
              'aria-selected': index === selectedIndex(),
              'data-active': String(index === activeIndex.value),
              'data-selected': String(index === selectedIndex()),
              onMousedown: (e: MouseEvent) => e.preventDefault(),
              onMouseenter: () => { activeIndex.value = index; },
              onClick: () => handleSelect(item.id),
            }, [
              h('span', { class: 'dialkit-preset-name' }, item.name),
              item.id
                ? h('button', {
                  class: 'dialkit-preset-delete',
                  tabindex: -1,
                  onMousedown: (e: MouseEvent) => e.preventDefault(),
                  onClick: (event: MouseEvent) => handleDelete(event, item.id as string),
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
                ])
                : null,
            ])))]
            : [],
        }),
      ]),
    ]);
  },
});
