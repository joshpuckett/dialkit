import { activateOnKey } from '../../control-keyboard';
import { createPanelSectionTransition, measurePanelHeight, observePanelHeader } from '../../panel-size';
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch, type PropType, type VNodeChild } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { ICON_CLOSE, ICON_CHEVRON, ICON_PANEL } from '../../icons';

export const Folder = defineComponent({
  name: 'DialKitFolder',
  props: {
    title: { type: String, required: true },
    open: { type: Boolean, default: undefined },
    defaultOpen: { type: Boolean, default: true },
    isRoot: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
    toolbar: {
      type: null as unknown as PropType<(() => VNodeChild) | null>,
      required: false,
      default: null,
    },
    panelHeightOffset: {
      type: Number,
      default: 0,
    },
  },
  emits: ['openChange'],
  setup(props, { emit, slots }) {
    const localOpen = ref(props.defaultOpen);
    const isOpen = computed(() => props.open ?? localOpen.value);
    const isCollapsed = computed(() => !isOpen.value);
    const contentRef = ref<HTMLElement | null>(null);
    const sectionRef = ref<HTMLElement | null>(null);
    let sectionTransition: ReturnType<typeof createPanelSectionTransition> | undefined;

    onMounted(() => {
      if (sectionRef.value) sectionTransition = createPanelSectionTransition(sectionRef.value, isOpen.value);
    });
    watch(isOpen, open => sectionTransition?.setOpen(open), { flush: 'post' });
    onUnmounted(() => sectionTransition?.destroy());
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

    // An inline root panel is always open, so its header is not a control.
    const toggleable = computed(() => !(props.inline && props.isRoot));

    const handleToggle = () => {
      if (!toggleable.value) return;
      const next = !isOpen.value;
      localOpen.value = next;
      emit('openChange', next);
    };

    let ro: ResizeObserver | null = null;
    let stopHeader: (() => void) | undefined;

    onMounted(() => {
      if (!props.isRoot || typeof ResizeObserver === 'undefined') return;
      const el = contentRef.value;
      if (!el) return;
      stopHeader = observePanelHeader(el);

      ro = new ResizeObserver(() => {
        if (isOpen.value) {
          const next = measurePanelHeight(el);
          if (contentHeight.value !== next) {
            contentHeight.value = next;
          }
        }
      });

      ro.observe(el);

      if (isOpen.value) {
        contentHeight.value = measurePanelHeight(el);
      }
    });

    onUnmounted(() => {
      ro?.disconnect();
      stopHeader?.();
    });

    const renderHeader = () => h('div', {
      class: `dialkit-folder-header ${props.isRoot ? 'dialkit-panel-header' : ''}`,
      onClick: handleToggle,
    }, [
      h('div', { class: 'dialkit-folder-header-top', role: toggleable.value ? 'button' : undefined, tabindex: toggleable.value ? 0 : undefined, 'aria-label': toggleable.value ? props.title : undefined, 'aria-expanded': toggleable.value ? isOpen.value : undefined, onKeydown: (e: KeyboardEvent) => activateOnKey(e, handleToggle) }, [
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
          ? h('svg', { class: 'dialkit-panel-icon', viewBox: isOpen.value ? '0 0 24 24' : '0 0 16 16', fill: 'none' }, isOpen.value ? [h('path', { d: ICON_CLOSE, stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })] : [
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
            animate: { rotate: isOpen.value ? 180 : 0 },
            transition: { type: 'spring', visualDuration: 0.35, bounce: 0.15 },
          }, [h('path', { d: ICON_CHEVRON })])
          : null,
      ]),
      props.toolbar && !props.isRoot
        ? h('div', { class: 'dialkit-panel-section-toolbar-clip' }, [
          h('div', { class: 'dialkit-panel-section-toolbar', onClick: (event: Event) => event.stopPropagation() }, [props.toolbar()]),
        ])
        : props.toolbar && isOpen.value
        ? h('div', { class: 'dialkit-panel-toolbar', onClick: (event: Event) => event.stopPropagation() }, [props.toolbar()])
        : null,
    ]);

    const renderChildren = () => h('div', { class: 'dialkit-folder-inner' }, slots.default ? slots.default() : []);

    const renderContent = () => {
      if (!props.isRoot && props.toolbar) return h('div', { class: 'dialkit-folder-content' }, [renderChildren()]);
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
            initial: { height: 0 },
            animate: { height: 'auto' },
            exit: { height: 0 },
            transition: { type: 'spring', visualDuration: 0.35, bounce: 0.1 },
          }, [renderChildren()])]
          : [],
      });
    };

    const folderContent = () => h('div', {
      ref: props.isRoot ? contentRef : props.toolbar ? sectionRef : undefined,
      class: `dialkit-folder ${props.isRoot ? 'dialkit-folder-root' : props.toolbar ? 'dialkit-folder-section' : ''}`,
      'data-open': String(isOpen.value),
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
            height: contentHeight.value !== undefined ? Math.min(contentHeight.value + props.panelHeightOffset, windowHeight.value - 32) : 'auto',
            borderRadius: 14,
            boxShadow: 'var(--dial-shadow)',
            cursor: undefined as string | undefined,
            overflowY: 'auto' as const,
          }
          : {
            width: 42,
            height: 42,
            borderRadius: 21,
            boxShadow: 'var(--dial-shadow-collapsed)',
            overflow: 'hidden',
            cursor: 'pointer',
          };

        return h(motion.div, {
          class: 'dialkit-panel-inner',
          tabindex: -1,
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
