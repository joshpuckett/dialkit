import { Teleport, defineComponent, h, onMounted, ref, watch, type PropType } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { getDialKitPortalRoot } from '../../dropdown-position';
import { useFloatingDropdown } from '../useFloatingDropdown';

type SelectOption = string | { value: string; label: string };

let uid = 0;

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeOptions(options: SelectOption[]): { value: string; label: string }[] {
  return options.map((option) =>
    typeof option === 'string' ? { value: option, label: toTitleCase(option) } : option
  );
}

export const SelectControl = defineComponent({
  name: 'DialKitSelectControl',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    options: {
      type: Array as PropType<SelectOption[]>,
      required: true,
    },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const isOpen = ref(false);
    const activeIndex = ref(-1);
    const portalTarget = ref<HTMLElement | null>(null);

    const triggerRef = ref<HTMLElement | null>(null);
    const dropdownRef = ref<HTMLElement | null>(null);

    const baseId = `dialkit-select-${uid++}`;
    const listboxId = `${baseId}-listbox`;
    const optionId = (index: number) => `${baseId}-opt-${index}`;

    const normalizedOptions = () => normalizeOptions(props.options);
    const selectedIndex = () => normalizedOptions().findIndex((option) => option.value === props.value);
    const selectedLabel = () => normalizedOptions().find((option) => option.value === props.value)?.label ?? props.value;

    useFloatingDropdown(isOpen, triggerRef, dropdownRef, {
      placement: 'bottom-start',
      matchWidth: true,
    });

    // Focus never leaves the trigger — the active option is tracked with
    // aria-activedescendant. Keep the active option scrolled into view.
    watch([isOpen, activeIndex], () => {
      if (isOpen.value && activeIndex.value >= 0) {
        document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' });
      }
    }, { flush: 'post' });

    const openMenu = (toIndex: number) => {
      activeIndex.value = toIndex;
      isOpen.value = true;
      // macOS Safari/Firefox don't focus a <button> on click, so force it.
      triggerRef.value?.focus();
    };

    const closeDropdown = () => {
      isOpen.value = false;
    };

    const commit = (index: number) => {
      emit('change', normalizedOptions()[index].value);
      isOpen.value = false;
    };

    const toggleDropdown = () => {
      if (isOpen.value) closeDropdown();
      else openMenu(selectedIndex() >= 0 ? selectedIndex() : 0);
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

    const handleTriggerKeyDown = (e: KeyboardEvent) => {
      const len = normalizedOptions().length;
      if (!isOpen.value) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMenu(selectedIndex() >= 0 ? selectedIndex() : 0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          openMenu(selectedIndex() >= 0 ? selectedIndex() : len - 1);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          activeIndex.value = (activeIndex.value + 1) % len;
          break;
        case 'ArrowUp':
          e.preventDefault();
          activeIndex.value = (activeIndex.value - 1 + len) % len;
          break;
        case 'Home':
          e.preventDefault();
          activeIndex.value = 0;
          break;
        case 'End':
          e.preventDefault();
          activeIndex.value = len - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (activeIndex.value >= 0) commit(activeIndex.value);
          break;
        case 'Escape':
          e.preventDefault();
          isOpen.value = false;
          break;
        case 'Tab':
          isOpen.value = false;
          break;
      }
    };

    // Close when focus leaves the trigger.
    const handleTriggerBlur = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (dropdownRef.value?.contains(next)) return;
      isOpen.value = false;
    };

    // Close on click outside (covers non-focusable areas).
    watch(isOpen, (open, _, onCleanup) => {
      if (!open) return;

      const handleDocumentClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) return;
        closeDropdown();
      };

      document.addEventListener('mousedown', handleDocumentClick);
      onCleanup(() => {
        document.removeEventListener('mousedown', handleDocumentClick);
      });
    });

    onMounted(() => {
      portalTarget.value = getDialKitPortalRoot(triggerRef.value) ?? document.body;
    });

    return () => h('div', { class: 'dialkit-select-row' }, [
      h('button', {
        ref: triggerRef,
        class: 'dialkit-select-trigger',
        'data-open': String(isOpen.value),
        'aria-haspopup': 'listbox',
        'aria-expanded': isOpen.value,
        'aria-controls': isOpen.value ? listboxId : undefined,
        'aria-activedescendant': isOpen.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
        onClick: toggleDropdown,
        onKeydown: handleTriggerKeyDown,
        onBlur: handleTriggerBlur,
      }, [
        h('span', { class: 'dialkit-select-label' }, props.label),
        h('div', { class: 'dialkit-select-right' }, [
          h('span', { class: 'dialkit-select-value' }, selectedLabel()),
          h(motion.svg, {
            class: 'dialkit-select-chevron',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            animate: { rotate: isOpen.value ? 180 : 0 },
            transition: { type: 'spring', visualDuration: 0.2, bounce: 0.15 },
          }, [h('path', { d: 'M6 9.5L12 15.5L18 9.5' })]),
        ]),
      ]),
      portalTarget.value
        ? h(Teleport, { to: portalTarget.value }, [
          h(AnimatePresence, null, {
            default: () => isOpen.value
              ? [h(motion.div, {
                key: 'dialkit-select-dropdown',
                ref: setDropdownRef,
                id: listboxId,
                class: 'dialkit-select-dropdown',
                role: 'listbox',
                initial: { opacity: 0, scale: 0.95 },
                animate: { opacity: 1, scale: 1 },
                exit: { opacity: 0, scale: 0.95 },
                transition: { type: 'spring', visualDuration: 0.15, bounce: 0 },
                style: { position: 'fixed', top: 0, left: 0 },
              }, normalizedOptions().map((option, index) => h('button', {
                key: option.value,
                id: optionId(index),
                type: 'button',
                class: 'dialkit-select-option',
                role: 'option',
                'aria-selected': option.value === props.value,
                tabindex: -1,
                'data-selected': String(option.value === props.value),
                'data-active': String(index === activeIndex.value),
                onMousedown: (e: MouseEvent) => e.preventDefault(),
                onClick: () => commit(index),
                onMouseenter: () => { activeIndex.value = index; },
              }, option.label)))]
              : [],
          }),
        ])
        : null,
    ]);
  },
});
