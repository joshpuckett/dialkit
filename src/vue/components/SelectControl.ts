import { Teleport, defineComponent, h, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { animate } from 'motion';

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
    const isMounted = ref(false);
    const pos = ref<{ top: number; left: number; width: number; above: boolean } | null>(null);
    const portalTarget = ref<HTMLElement | null>(null);

    const triggerRef = ref<HTMLElement | null>(null);
    const dropdownRef = ref<HTMLElement | null>(null);
    const chevronRef = ref<HTMLElement | null>(null);

    const normalizedOptions = () => normalizeOptions(props.options);
    const selectedLabel = () => normalizedOptions().find((option) => option.value === props.value)?.label ?? props.value;

    let closeAnim: ReturnType<typeof animate> | null = null;
    let chevronAnim: ReturnType<typeof animate> | null = null;

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
      closeAnim?.stop();
      closeAnim = null;
      updatePos();
      isMounted.value = true;
      isOpen.value = true;
    };

    const closeDropdown = () => {
      isOpen.value = false;
      if (!dropdownRef.value) {
        isMounted.value = false;
        return;
      }

      const above = pos.value?.above ?? false;
      closeAnim?.stop();
      closeAnim = animate(
        dropdownRef.value,
        { opacity: 0, y: above ? 8 : -8, scale: 0.95 },
        {
          type: 'spring',
          visualDuration: 0.15,
          bounce: 0,
          onComplete: () => {
            isMounted.value = false;
            closeAnim = null;
          },
        }
      );
    };

    const toggleDropdown = () => {
      if (isOpen.value) {
        closeDropdown();
      } else {
        openDropdown();
      }
    };

    watch(isOpen, (open) => {
      if (!chevronRef.value) return;
      chevronAnim?.stop();
      chevronAnim = animate(
        chevronRef.value,
        { rotate: open ? 180 : 0 },
        { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
      );
    }, { immediate: true });

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
      if (chevronRef.value) {
        chevronRef.value.style.transform = `rotate(${isOpen.value ? 180 : 0}deg)`;
      }
    });

    onUnmounted(() => {
      closeAnim?.stop();
      chevronAnim?.stop();
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
          h('svg', {
            ref: chevronRef,
            class: 'dialkit-select-chevron',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }, [h('path', { d: 'M6 9.5L12 15.5L18 9.5' })]),
        ]),
      ]),
      portalTarget.value && isMounted.value && pos.value
        ? h(Teleport, { to: portalTarget.value }, h('div', {
          ref: ((el: Element | null) => {
            if (!(el instanceof HTMLElement)) return;
            dropdownRef.value = el;
            const above = pos.value?.above ?? false;
            animate(
              el,
              { opacity: [0, 1], y: [above ? 8 : -8, 0], scale: [0.95, 1] },
              { type: 'spring', visualDuration: 0.15, bounce: 0 }
            );
          }) as any,
          class: 'dialkit-select-dropdown',
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
        }, option.label))))
        : null,
    ]);
  },
});
