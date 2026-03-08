import { defineComponent, h, nextTick, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { animate } from 'motion';

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
    const contentHeight = ref<number | undefined>(undefined);

    const sectionContentMounted = ref(props.defaultOpen);
    const contentRef = ref<HTMLElement | null>(null);
    const sectionContentRef = ref<HTMLElement | null>(null);
    const panelRef = ref<HTMLElement | null>(null);
    const folderChevronRef = ref<SVGElement | null>(null);

    let skipFirstSectionAnim = true;
    let rootPanelInitialized = false;
    let lastRootOpen = isOpen.value;
    let chevronInitialized = false;

    let resizeObserver: ResizeObserver | null = null;
    let sectionAnim: ReturnType<typeof animate> | null = null;
    let chevronAnim: ReturnType<typeof animate> | null = null;
    let rootPanelAnim: ReturnType<typeof animate> | null = null;
    let panelTapAnim: ReturnType<typeof animate> | null = null;

    const animateSectionOpen = (el: HTMLElement) => {
      sectionAnim?.stop();
      sectionAnim = animate(
        el,
        { height: 'auto', opacity: 1 },
        {
          type: 'spring',
          visualDuration: 0.35,
          bounce: 0.1,
          onComplete: () => {
            sectionAnim = null;
          },
        }
      );
    };

    const animateSectionClose = (el: HTMLElement) => {
      const currentHeight = el.getBoundingClientRect().height;
      el.style.height = `${currentHeight}px`;
      sectionAnim?.stop();
      sectionAnim = animate(
        el,
        { height: 0, opacity: 0 },
        {
          type: 'spring',
          visualDuration: 0.35,
          bounce: 0.1,
          onComplete: () => {
            sectionContentMounted.value = false;
            sectionContentRef.value = null;
            sectionAnim = null;
          },
        }
      );
    };

    const applyRootPanelState = () => {
      if (!props.isRoot || props.inline) return;
      const panel = panelRef.value;
      if (!panel) return;

      const open = isOpen.value;
      const measuredOpenHeight = contentHeight.value !== undefined
        ? contentHeight.value + 24
        : panel.getBoundingClientRect().height;

      const target = {
        width: open ? 280 : 42,
        height: open ? measuredOpenHeight : 42,
        borderRadius: open ? 14 : 21,
        boxShadow: open
          ? '0 8px 32px rgba(0, 0, 0, 0.5)'
          : '0 4px 16px rgba(0, 0, 0, 0.25)',
      };

      panel.style.cursor = open ? '' : 'pointer';
      panel.style.overflow = open ? '' : 'hidden';

      if (!rootPanelInitialized) {
        panel.style.width = `${target.width}px`;
        panel.style.height = `${target.height}px`;
        panel.style.borderRadius = `${target.borderRadius}px`;
        panel.style.boxShadow = target.boxShadow;
        rootPanelInitialized = true;
        lastRootOpen = open;
        return;
      }

      if (open !== lastRootOpen) {
        rootPanelAnim?.stop();
        rootPanelAnim = animate(panel, target, {
          type: 'spring',
          visualDuration: 0.15,
          bounce: 0.3,
          onComplete: () => {
            rootPanelAnim = null;
          },
        });
        lastRootOpen = open;
        return;
      }

      if (open) {
        panel.style.height = `${target.height}px`;
      }
    };

    const handleToggle = () => {
      if (props.inline && props.isRoot) return;

      const next = !isOpen.value;
      isOpen.value = next;

      if (next) {
        isCollapsed.value = false;

        if (!props.isRoot) {
          const section = sectionContentRef.value;
          if (section) {
            animateSectionOpen(section);
          } else {
            sectionContentMounted.value = true;
          }
        }
      } else {
        isCollapsed.value = true;

        if (!props.isRoot) {
          const section = sectionContentRef.value;
          if (section) {
            animateSectionClose(section);
          } else {
            sectionContentMounted.value = false;
          }
        }
      }

      emit('openChange', next);
    };

    const handleCollapsedTapStart = () => {
      if (isOpen.value) return;
      const panel = panelRef.value;
      if (!panel) return;
      panelTapAnim?.stop();
      panelTapAnim = animate(panel, { scale: 0.9 }, { type: 'spring', visualDuration: 0.15, bounce: 0.3 });
    };

    const handleCollapsedTapEnd = () => {
      if (isOpen.value) return;
      const panel = panelRef.value;
      if (!panel) return;
      panelTapAnim?.stop();
      panelTapAnim = animate(panel, { scale: 1 }, { type: 'spring', visualDuration: 0.15, bounce: 0.3 });
    };

    watch(isOpen, (open) => {
      if (props.isRoot) return;
      const chevron = folderChevronRef.value;
      if (!chevron) return;

      chevronAnim?.stop();
      if (!chevronInitialized) {
        chevron.style.transform = `rotate(${open ? 0 : 180}deg)`;
        chevronInitialized = true;
        return;
      }

      chevronAnim = animate(
        chevron,
        { rotate: open ? 0 : 180 },
        { type: 'spring', visualDuration: 0.35, bounce: 0.15 }
      );
    });

    watch(sectionContentMounted, async (mounted, wasMounted) => {
      if (props.isRoot || !mounted || wasMounted) return;

      await nextTick();
      const section = sectionContentRef.value;
      if (!section) return;

      if (skipFirstSectionAnim) {
        skipFirstSectionAnim = false;
        return;
      }

      sectionAnim?.stop();
      section.style.height = '0px';
      section.style.opacity = '0';
      animateSectionOpen(section);
    });

    watch(
      () => [isOpen.value, contentHeight.value],
      () => {
        nextTick(() => {
          applyRootPanelState();
        });
      },
      { flush: 'post' }
    );

    onMounted(() => {
      skipFirstSectionAnim = false;

      if (!props.isRoot && folderChevronRef.value) {
        folderChevronRef.value.style.transform = `rotate(${isOpen.value ? 0 : 180}deg)`;
        chevronInitialized = true;
      }

      if (props.isRoot && contentRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (!isOpen.value || !contentRef.value) return;
          const nextHeight = contentRef.value.offsetHeight;
          if (contentHeight.value !== nextHeight) {
            contentHeight.value = nextHeight;
          }
        });
        resizeObserver.observe(contentRef.value);

        if (isOpen.value) {
          contentHeight.value = contentRef.value.offsetHeight;
        }
      }

      nextTick(() => {
        applyRootPanelState();
      });
    });

    onUnmounted(() => {
      resizeObserver?.disconnect();
      sectionAnim?.stop();
      chevronAnim?.stop();
      rootPanelAnim?.stop();
      panelTapAnim?.stop();
    });

    const renderHeader = () => h('div', {
      class: `dialkit-folder-header ${props.isRoot ? 'dialkit-panel-header' : ''}`,
      onClick: handleToggle,
    }, [
      h('div', { class: 'dialkit-folder-header-top' }, [
        props.isRoot
          ? (isOpen.value ? h('div', { class: 'dialkit-folder-title-row' }, [
            h('span', { class: 'dialkit-folder-title dialkit-folder-title-root' }, props.title),
          ]) : null)
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
          ? h('svg', {
            ref: folderChevronRef,
            class: 'dialkit-folder-icon',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }, [h('path', { d: 'M6 9.5L12 15.5L18 9.5' })])
          : null,
      ]),
      props.isRoot && props.toolbar && isOpen.value
        ? h('div', { class: 'dialkit-panel-toolbar', onClick: (event: Event) => event.stopPropagation() }, [props.toolbar()])
        : null,
    ]);

    const renderContent = () => h('div', {
      ref: contentRef,
      class: `dialkit-folder ${props.isRoot ? 'dialkit-folder-root' : ''}`,
    }, [
      renderHeader(),
      props.isRoot
        ? (isOpen.value
            ? h('div', { class: 'dialkit-folder-content' }, [
              h('div', { class: 'dialkit-folder-inner' }, slots.default ? slots.default() : []),
            ])
            : null)
        : (sectionContentMounted.value
            ? h('div', {
              ref: sectionContentRef,
              class: 'dialkit-folder-content',
              style: { clipPath: 'inset(0 -20px)' },
            }, [
              h('div', { class: 'dialkit-folder-inner' }, slots.default ? slots.default() : []),
            ])
            : null),
    ]);

    return () => {
      if (props.isRoot) {
        if (props.inline) {
          return h('div', { class: 'dialkit-panel-inner dialkit-panel-inline' }, [renderContent()]);
        }

        return h('div', {
          ref: panelRef,
          class: 'dialkit-panel-inner',
          'data-collapsed': String(isCollapsed.value),
          onClick: !isOpen.value ? handleToggle : undefined,
          onPointerdown: handleCollapsedTapStart,
          onPointerup: handleCollapsedTapEnd,
          onPointercancel: handleCollapsedTapEnd,
          onPointerleave: handleCollapsedTapEnd,
        }, [renderContent()]);
      }

      return renderContent();
    };
  },
});
