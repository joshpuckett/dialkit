import { Teleport, defineComponent, h, onMounted, ref, watch, type PropType } from 'vue';
import { AnimatePresence, motion } from 'motion-v';

type SelectOption = string | { value: string; label: string };

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
    const pos = ref<{ top: number; left: number; width: number; above: boolean } | null>(null);
    const portalTarget = ref<HTMLElement | null>(null);

    const triggerRef = ref<HTMLElement | null>(null);
    const dropdownRef = ref<HTMLElement | null>(null);

    const normalizedOptions = () => normalizeOptions(props.options);
    const selectedLabel = () => normalizedOptions().find((option) => option.value === props.value)?.label ?? props.value;

    const updatePos = () => {
      if (!triggerRef.value) return;
      const rect = triggerRef.value.getBoundingClientRect();
      const dropdownHeight = 8 + normalizedOptions().length * 36;
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const above = spaceBelow < dropdownHeight && rect.top > spaceBelow;
      pos.value = {
        top: above ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        above,
      };
    };

    const openDropdown = () => {
      updatePos();
      isOpen.value = true;
    };

    const closeDropdown = () => {
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

    const toggleDropdown = () => {
      if (isOpen.value) closeDropdown();
      else openDropdown();
    };

    watch(isOpen, (open, _, onCleanup) => {
      if (!open) return;

      const handleViewportChange = () => updatePos();
      const handleDocumentClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) return;
        closeDropdown();
      };

      updatePos();
      document.addEventListener('mousedown', handleDocumentClick);
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, true);

      onCleanup(() => {
        document.removeEventListener('mousedown', handleDocumentClick);
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
      });
    });

    onMounted(() => {
      const root = triggerRef.value?.closest('.dialkit-root') as HTMLElement | null;
      portalTarget.value = root ?? document.body;
    });

    return () => h('div', { class: 'dialkit-select-row' }, [
      h('button', {
        ref: triggerRef,
        class: 'dialkit-select-trigger',
        'data-open': String(isOpen.value),
        onClick: toggleDropdown,
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
            default: () => (isOpen.value && pos.value)
              ? [h(motion.div, {
                key: 'dialkit-select-dropdown',
                ref: setDropdownRef,
                class: 'dialkit-select-dropdown',
                initial: { opacity: 0, y: pos.value.above ? 8 : -8, scale: 0.95 },
                animate: { opacity: 1, y: 0, scale: 1 },
                exit: { opacity: 0, y: pos.value.above ? 8 : -8, scale: 0.95 },
                transition: { type: 'spring', visualDuration: 0.15, bounce: 0 },
                style: {
                  position: 'fixed',
                  left: `${pos.value.left}px`,
                  width: `${pos.value.width}px`,
                  ...(pos.value.above
                    ? {
                      bottom: `${window.innerHeight - pos.value.top}px`,
                      transformOrigin: 'bottom',
                    }
                    : {
                      top: `${pos.value.top}px`,
                      transformOrigin: 'top',
                    }),
                },
              }, normalizedOptions().map((option) => h('button', {
                key: option.value,
                class: 'dialkit-select-option',
                'data-selected': String(option.value === props.value),
                onClick: () => {
                  emit('change', option.value);
                  closeDropdown();
                },
              }, option.label)))]
              : [],
          }),
        ])
        : null,
    ]);
  },
});
