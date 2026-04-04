import { defineComponent, h, onMounted, onUnmounted, ref, type PropType } from 'vue';
import { AnimatePresence, motion } from 'motion-v';

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
              d: 'M6.84766 11.75C6.78583 11.9899 6.75 12.2408 6.75 12.5C6.75 12.7592 6.78583 13.0101 6.84766 13.25H2C1.58579 13.25 1.25 12.9142 1.25 12.5C1.25 12.0858 1.58579 11.75 2 11.75H6.84766ZM14 11.75C14.4142 11.75 14.75 12.0858 14.75 12.5C14.75 12.9142 14.4142 13.25 14 13.25H12.6523C12.7142 13.0101 12.75 12.7592 12.75 12.5C12.75 12.2408 12.7142 11.9899 12.6523 11.75H14ZM3.09766 7.25C3.03583 7.48994 3 7.74075 3 8C3 8.25925 3.03583 8.51006 3.09766 8.75H2C1.58579 8.75 1.25 8.41421 1.25 8C1.25 7.58579 1.58579 7.25 2 7.25H3.09766ZM14 7.25C14.4142 7.25 14.75 7.58579 14.75 8C14.75 8.41421 14.4142 8.75 14 8.75H8.90234C8.96417 8.51006 9 8.25925 9 8C9 7.74075 8.96417 7.48994 8.90234 7.25H14ZM7.59766 2.75C7.53583 2.98994 7.5 3.24075 7.5 3.5C7.5 3.75925 7.53583 4.01006 7.59766 4.25H2C1.58579 4.25 1.25 3.91421 1.25 3.5C1.25 3.08579 1.58579 2.75 2 2.75H7.59766ZM14 2.75C14.4142 2.75 14.75 3.08579 14.75 3.5C14.75 3.91421 14.4142 4.25 14 4.25H13.4023C13.4642 4.01006 13.5 3.75925 13.5 3.5C13.5 3.24075 13.4642 2.98994 13.4023 2.75H14Z',
              fill: 'currentColor',
            }),
            h('circle', { cx: '6', cy: '8', r: '0.998596', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.25' }),
            h('circle', { cx: '10.4999', cy: '3.5', r: '0.998657', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.25' }),
            h('circle', { cx: '9.75015', cy: '12.5', r: '0.997986', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.25' }),
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
          }, [h('path', { d: 'M6 9.5L12 15.5L18 9.5' })])
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
            height: contentHeight.value !== undefined ? contentHeight.value + 10 : 'auto',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            cursor: undefined as string | undefined,
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
