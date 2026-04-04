import { defineComponent, h, onMounted, onUnmounted, ref, type PropType } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { ICON_CHEVRON, ICON_PANEL } from '../../icons';

export const Folder = defineComponent({
  name: 'DialKitFolder',
  props: {
    title: { type: String, required: true },
    defaultOpen: { type: Boolean, default: true },
    isRoot: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
    toolbar: {
      type: null as unknown as PropType<(() => ReturnType<typeof h>) | null>,
      required: false,
      default: null,
    },
  },
  emits: ['openChange'],
  setup(props, { emit, slots }) {
    const isOpen = ref(props.defaultOpen);
    const isCollapsed = ref(!props.defaultOpen);
    const contentRef = ref<HTMLElement | null>(null);
    const contentHeight = ref<number | undefined>(undefined);
    const windowHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 800);

    let resizeHandler: (() => void) | null = null;
    if (props.isRoot) {
      resizeHandler = () => { windowHeight.value = window.innerHeight; };
      window.addEventListener('resize', resizeHandler);
    }

    onUnmounted(() => {
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    });

    const handleToggle = () => {
      if (props.inline && props.isRoot) return;
      const next = !isOpen.value;
      isOpen.value = next;
      isCollapsed.value = !next;
      emit('openChange', next);
    };

    let ro: ResizeObserver | null = null;

    onMounted(() => {
      if (!props.isRoot || typeof ResizeObserver === 'undefined') return;
      const el = contentRef.value;
      if (!el) return;

      ro = new ResizeObserver(() => {
        if (isOpen.value) {
          const next = el.offsetHeight;
          if (contentHeight.value !== next) {
            contentHeight.value = next;
          }
        }
      });

      ro.observe(el);

      if (isOpen.value) {
        contentHeight.value = el.offsetHeight;
      }
    });

    onUnmounted(() => {
      ro?.disconnect();
    });

    const renderHeader = () => h('div', {
      class: `dialkit-folder-header ${props.isRoot ? 'dialkit-panel-header' : ''}`,
      onClick: handleToggle,
    }, [
      h('div', { class: 'dialkit-folder-header-top' }, [
        props.isRoot
          ? (isOpen.value
              ? h('div', { class: 'dialkit-folder-title-row' }, [
                h('span', { class: 'dialkit-folder-title dialkit-folder-title-root' }, props.title),
              ])
              : null)
          : h('div', { class: 'dialkit-folder-title-row' }, [
            h('span', { class: 'dialkit-folder-title' }, props.title),
          ]),
        props.isRoot && !props.inline
          ? h('svg', { class: 'dialkit-panel-icon', viewBox: '0 0 16 16', fill: 'none' }, [
            h('path', {
              opacity: '0.5',
              d: ICON_PANEL.path,
              fill: 'currentColor',
            }),
            ...ICON_PANEL.circles.map((c) => h('circle', { cx: c.cx, cy: c.cy, r: c.r, fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.25' })),
          ])
          : null,
        !props.isRoot
          ? h(motion.svg, {
            class: 'dialkit-folder-icon',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            initial: false,
            animate: { rotate: isOpen.value ? 0 : 180 },
            transition: { type: 'spring', visualDuration: 0.35, bounce: 0.15 },
          }, [h('path', { d: ICON_CHEVRON })])
          : null,
      ]),
      props.isRoot && props.toolbar && isOpen.value
        ? h('div', { class: 'dialkit-panel-toolbar', onClick: (event: Event) => event.stopPropagation() }, [props.toolbar()])
        : null,
    ]);

    const renderChildren = () => h('div', { class: 'dialkit-folder-inner' }, slots.default ? slots.default() : []);

    const renderContent = () => {
      if (props.isRoot) {
        return isOpen.value
          ? h('div', { class: 'dialkit-folder-content' }, [renderChildren()])
          : null;
      }

      return h(AnimatePresence, { initial: false }, {
        default: () => isOpen.value
          ? [h(motion.div, {
            key: 'dialkit-folder-content',
            class: 'dialkit-folder-content',
            initial: { height: 0, opacity: 0 },
            animate: { height: 'auto', opacity: 1 },
            exit: { height: 0, opacity: 0 },
            transition: { type: 'spring', visualDuration: 0.35, bounce: 0.1 },
            style: { clipPath: 'inset(0 -20px)' },
          }, [renderChildren()])]
          : [],
      });
    };

    const folderContent = () => h('div', {
      ref: props.isRoot ? contentRef : undefined,
      class: `dialkit-folder ${props.isRoot ? 'dialkit-folder-root' : ''}`,
    }, [
      renderHeader(),
      renderContent(),
    ]);

    return () => {
      if (props.isRoot) {
        if (props.inline) {
          return h('div', { class: 'dialkit-panel-inner dialkit-panel-inline' }, [folderContent()]);
        }

        const panelStyle = isOpen.value
          ? {
            width: 280,
            height: contentHeight.value !== undefined ? Math.min(contentHeight.value + 10, windowHeight.value - 32) : 'auto',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            cursor: undefined as string | undefined,
            overflowY: 'auto' as const,
          }
          : {
            width: 42,
            height: 42,
            borderRadius: 21,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            cursor: 'pointer',
          };

        return h(motion.div, {
          class: 'dialkit-panel-inner',
          style: panelStyle,
          onClick: !isOpen.value ? handleToggle : undefined,
          'data-collapsed': String(isCollapsed.value),
          whilePress: !isOpen.value ? { scale: 0.9 } : undefined,
          transition: { type: 'spring', visualDuration: 0.15, bounce: 0.3 },
        }, [folderContent()]);
      }

      return folderContent();
    };
  },
});
