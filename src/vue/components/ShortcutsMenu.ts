import { defineComponent, h, onMounted, onUnmounted, ref, Teleport, type PropType } from 'vue';
import { DialStore, ShortcutConfig } from '../../store/DialStore';

function formatShortcutKey(sc: ShortcutConfig): string {
  if (!sc.key) return '\u2014';
  const mod = sc.modifier === 'alt' ? '\u2325'
    : sc.modifier === 'shift' ? '\u21E7'
    : sc.modifier === 'meta' ? '\u2318'
    : '';
  return `${mod}${sc.key.toUpperCase()}`;
}

function formatInteraction(sc: ShortcutConfig): string {
  const interaction = sc.interaction ?? 'scroll';
  switch (interaction) {
    case 'scroll': return sc.key ? 'key+scroll' : 'scroll';
    case 'drag': return 'key+drag';
    case 'move': return 'key+move';
    case 'scroll-only': return 'scroll';
  }
}

export const ShortcutsMenu = defineComponent({
  name: 'DialKitShortcutsMenu',
  props: {
    panelId: {
      type: String as PropType<string>,
      required: true,
    },
  },
  setup(props) {
    const isOpen = ref(false);
    const triggerRef = ref<HTMLButtonElement | null>(null);
    const dropdownRef = ref<HTMLDivElement | null>(null);
    const pos = ref({ top: 0, right: 0 });

    const open = () => {
      const rect = triggerRef.value?.getBoundingClientRect();
      if (rect) {
        pos.value = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
      }
      isOpen.value = true;
    };

    const close = () => {
      isOpen.value = false;
    };

    const toggle = () => {
      if (isOpen.value) close();
      else open();
    };

    let mousedownHandler: ((e: MouseEvent) => void) | null = null;

    const addOutsideClickListener = () => {
      mousedownHandler = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          triggerRef.value?.contains(target) ||
          dropdownRef.value?.contains(target)
        ) return;
        close();
      };
      document.addEventListener('mousedown', mousedownHandler);
    };

    const removeOutsideClickListener = () => {
      if (mousedownHandler) {
        document.removeEventListener('mousedown', mousedownHandler);
        mousedownHandler = null;
      }
    };

    onUnmounted(() => {
      removeOutsideClickListener();
    });

    return () => {
      const panel = DialStore.getPanel(props.panelId);
      if (!panel) return null;

      const shortcuts = Object.entries(panel.shortcuts);
      if (shortcuts.length === 0) return null;

      // Find control label
      const findLabel = (controls: typeof panel.controls, path: string): string => {
        for (const c of controls) {
          if (c.path === path) return c.label;
          if (c.type === 'folder' && c.children) {
            const found = findLabel(c.children, path);
            if (found) return found;
          }
        }
        return path;
      };

      const rows = shortcuts.map(([path, shortcut]) => ({
        path,
        shortcut,
        label: findLabel(panel.controls, path),
      }));

      // Manage outside click listener based on open state
      if (isOpen.value) {
        if (!mousedownHandler) addOutsideClickListener();
      } else {
        removeOutsideClickListener();
      }

      return [
        h('button', {
          ref: triggerRef,
          class: 'dialkit-shortcuts-trigger',
          onClick: toggle,
          title: 'Keyboard shortcuts',
        }, [
          h('svg', {
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }, [
            h('rect', { x: '2', y: '6', width: '20', height: '12', rx: '2' }),
            h('path', { d: 'M6 10H6.01' }),
            h('path', { d: 'M10 10H10.01' }),
            h('path', { d: 'M14 10H14.01' }),
            h('path', { d: 'M18 10H18.01' }),
            h('path', { d: 'M8 14H16' }),
          ]),
        ]),
        isOpen.value
          ? h(Teleport, { to: 'body' }, [
              h('div', {
                ref: dropdownRef,
                class: 'dialkit-root dialkit-shortcuts-dropdown',
                style: {
                  position: 'fixed',
                  top: `${pos.value.top}px`,
                  right: `${pos.value.right}px`,
                },
              }, [
                h('div', { class: 'dialkit-shortcuts-title' }, 'Keyboard Shortcuts'),
                h('div', { class: 'dialkit-shortcuts-list' },
                  rows.map((row) =>
                    h('div', { key: row.path, class: 'dialkit-shortcuts-row' }, [
                      h('span', { class: 'dialkit-shortcuts-row-key' }, formatShortcutKey(row.shortcut)),
                      h('span', { class: 'dialkit-shortcuts-row-label' }, row.label),
                      h('span', { class: 'dialkit-shortcuts-row-mode' }, formatInteraction(row.shortcut)),
                    ])
                  )
                ),
                h('div', { class: 'dialkit-shortcuts-hint' }, 'See pill badges on controls for keys'),
              ]),
            ])
          : null,
      ];
    };
  },
});
