import { computed, defineComponent, h, onMounted, onUnmounted, ref, shallowRef, Teleport, watch } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { TimelineStore } from '../../store/TimelineStore';
import { TimelineUiStore } from '../../store/TimelineUiStore';
import { isDevDefault } from '../../env';
import { Folder } from './Folder';
import { Panel } from './Panel';
import { ShortcutListener } from './ShortcutListener';
import { TimelineToggleButton } from './Timeline/TimelineToggleButton';
import type { DialVersions } from '../../versions/gallery';
import {
  blockPanelDragClick,
  clampPanelOffset,
  getPanelCorner,
  getPanelDragHandle,
  getPanelDragOffset,
  getPanelDragStart,
  getPanelOriginX,
  getPanelOriginY,
  hasPanelDragMoved,
  type PanelDragOffset,
} from '../../panel-drag';
import { startPointerGesture, type StopGesture } from '../../pointer-gesture';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';

const DialRootContent = defineComponent({
  name: 'DialKitDialRootContent',
  props: {
    position: { type: String as () => DialPosition, required: true },
    defaultOpen: { type: Boolean, required: true },
    mode: { type: String as () => DialMode, required: true },
    theme: { type: String as () => DialTheme, required: true },
    versions: { type: String as () => DialVersions, required: true },
  },
  emits: ['openChange'],
  setup(props, { emit }) {
    const panels = shallowRef<PanelConfig[]>([]);
    const timelineCount = ref(0);
    const mounted = ref(false);
    const fallbackOpen = computed(() => props.mode === 'inline' || props.defaultOpen);
    const shellOpen = ref(fallbackOpen.value);

    const panelRef = ref<HTMLDivElement | null>(null);
    const dragOffset = shallowRef<PanelDragOffset | null>(null);
    const activePosition = ref<DialPosition>(props.position);
    let lastDragOffset: PanelDragOffset | null = null;
    let stopDrag: StopGesture | null = null;

    // The root's open state has one home per layout: a lone panel is its own root,
    // and everything else lives in the shell.
    const singleId = computed(() => (panels.value.length === 1 ? panels.value[0].id : undefined));
    const singleOpen = ref<boolean | undefined>(undefined);
    const readSingleOpen = () => {
      singleOpen.value = singleId.value ? DialStore.getPanelOpen(singleId.value) : undefined;
    };
    watch(singleId, (id, _, onCleanup) => {
      readSingleOpen();
      if (id) onCleanup(DialStore.subscribe(id, readSingleOpen));
    }, { flush: 'sync' });

    const rootOpen = computed(() => (singleId.value ? (singleOpen.value ?? fallbackOpen.value) : shellOpen.value));
    const visible = computed(() => mounted.value && (panels.value.length > 0 || timelineCount.value > 0));

    const moveOpenState = (open: boolean, previousCount: number): boolean => {
      if (panels.value.length !== 1) shellOpen.value = open;
      else if (previousCount > 1) DialStore.setPanelOpen(panels.value[0].id, open);
      else if (DialStore.getPanelOpen(panels.value[0].id) === undefined) DialStore.initPanelOpen(panels.value[0].id, open);
      else return false;
      return true;
    };

    let layout: { count: number; open: boolean } | null = null;
    let reportedOpen: boolean | null = null;
    let wasOpen = rootOpen.value;

    watch([visible, () => panels.value.length, rootOpen], () => {
      const open = rootOpen.value;
      if (visible.value) {
        // Panels coming and going move the state between homes, so the root stays
        // as the person left it. That isn't a change to report or snap for.
        const count = panels.value.length;
        const previous = layout;
        layout = { count, open };
        if (previous && previous.count !== count && previous.open !== open && moveOpenState(previous.open, previous.count)) {
          layout = { count, open: previous.open };
          return;
        }
        if (reportedOpen !== null && reportedOpen !== open) emit('openChange', open);
        reportedOpen = open;
      }

      // Snap to a corner on open, and restore the dragged position on close.
      if (wasOpen === open) return;
      wasOpen = open;
      if (props.mode === 'inline') return;
      const offset = dragOffset.value;
      if (open) {
        lastDragOffset = offset ?? lastDragOffset;
        activePosition.value = offset ? getPanelCorner(props.position, offset) : props.position;
        dragOffset.value = null;
      } else if (offset) {
        lastDragOffset = offset;
      } else if (lastDragOffset) {
        dragOffset.value = lastDragOffset;
      }
    });

    watch(() => props.position, (position) => {
      if (!dragOffset.value && !lastDragOffset) activePosition.value = position;
    });

    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.value;
      const handle = getPanelDragHandle(event.target, panel);
      if (!panel || !handle || stopDrag) return;

      const start = getPanelDragStart(event.clientX, event.clientY, panel);
      const startOffset = dragOffset.value;
      let moved = false;
      stopDrag = startPointerGesture(event, handle, {
        move(next) {
          if (!moved && !hasPanelDragMoved(start, next.clientX, next.clientY)) return;
          moved = true;
          dragOffset.value = getPanelDragOffset(start, next.clientX, next.clientY);
        },
        end(cancelled) {
          stopDrag = null;
          if (!moved) return;
          if (cancelled) dragOffset.value = startOffset;
          // A drag must not also count as a click that toggles the panel.
          else blockPanelDragClick(handle);
        },
      });
    };

    // Keep a dragged panel on screen when the window shrinks.
    const handleResize = () => {
      if (props.mode === 'inline') return;
      if (dragOffset.value) dragOffset.value = clampPanelOffset(dragOffset.value, panelRef.value?.getBoundingClientRect().width);
      if (lastDragOffset) lastDragOffset = clampPanelOffset(lastDragOffset);
    };

    const handleShellOpenChange = (open: boolean) => {
      shellOpen.value = open;
    };

    const getDragStyle = () => dragOffset.value
      ? {
        top: `${dragOffset.value.y}px`,
        left: `${dragOffset.value.x}px`,
        right: 'auto',
        bottom: 'auto',
      }
      : undefined;
    const originX = computed(() => props.mode === 'inline' ? undefined : getPanelOriginX(activePosition.value, dragOffset.value));
    const originY = computed(() => props.mode === 'inline' ? undefined : getPanelOriginY(activePosition.value, dragOffset.value));

    let unsubscribePanels: (() => void) | undefined;
    let unsubscribeTimelines: (() => void) | undefined;
    let unsubscribeDock: (() => void) | undefined;
    let unsubscribeOpen: (() => void) | undefined;

    onMounted(() => {
      // Timeline-backed panels render in DialTimeline, but their presence adds a
      // visibility toggle here, as long as a dock is mounted for it to show and hide.
      const syncTimelines = () => {
        timelineCount.value = TimelineUiStore.hasDock() ? TimelineStore.getTimelines().length : 0;
      };
      mounted.value = true;
      panels.value = DialStore.getPanels('panel');
      syncTimelines();
      unsubscribePanels = DialStore.subscribeGlobal(() => {
        panels.value = DialStore.getPanels('panel');
      });
      unsubscribeTimelines = TimelineStore.subscribeGlobal(syncTimelines);
      unsubscribeDock = TimelineUiStore.subscribe(syncTimelines);
      // Requests to open a panel also reveal the shell it sits in.
      unsubscribeOpen = DialStore.subscribePanelOpen((id, open) => {
        if (open && panels.value.length > 1 && panels.value.some(panel => panel.id === id)) shellOpen.value = true;
      });
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      unsubscribePanels?.();
      unsubscribeTimelines?.();
      unsubscribeDock?.();
      unsubscribeOpen?.();
      window.removeEventListener('resize', handleResize);
      stopDrag?.(false);
    });

    const timelineToggle = () => h(TimelineToggleButton);

    const renderPanels = () => {
      const toggle = timelineCount.value > 0 ? timelineToggle : null;
      if (panels.value.length === 0) {
        return [h('div', { class: 'dialkit-panel-wrapper' }, [
          h(Folder, {
            title: 'DialKit',
            open: shellOpen.value,
            defaultOpen: fallbackOpen.value,
            isRoot: true,
            inline: props.mode === 'inline',
            toolbar: toggle,
            onOpenChange: handleShellOpenChange,
          }, { default: () => [h('div', { class: 'dialkit-timeline-toolkit-only' }, 'Timeline')] }),
        ])];
      }
      if (panels.value.length > 1) {
        return [h('div', { class: 'dialkit-panel-wrapper' }, [
          h(Folder, {
            title: 'DialKit',
            open: shellOpen.value,
            defaultOpen: fallbackOpen.value,
            isRoot: true,
            inline: props.mode === 'inline',
            toolbar: toggle,
            onOpenChange: handleShellOpenChange,
          }, {
            default: () => panels.value.map((panel) => h(Panel, {
              key: panel.id,
              panel,
              defaultOpen: true,
              variant: 'section',
              versions: props.versions,
              theme: props.theme,
            })),
          }),
        ])];
      }
      return panels.value.map((panel) => h(Panel, {
        key: panel.id,
        panel,
        defaultOpen: fallbackOpen.value,
        inline: props.mode === 'inline',
        toolbarExtra: toggle ?? undefined,
        versions: props.versions,
        theme: props.theme,
      }));
    };

    const renderContent = () => h(ShortcutListener, null, {
      default: () => h('div', { class: 'dialkit-root', 'data-mode': props.mode, 'data-theme': props.theme }, [
        h('div', {
          ref: panelRef,
          class: 'dialkit-panel',
          'data-position': props.mode === 'inline' ? undefined : (dragOffset.value ? undefined : activePosition.value),
          'data-origin-x': originX.value,
          'data-origin-y': originY.value,
          'data-mode': props.mode,
          'data-multiple': panels.value.length > 1 ? 'true' : undefined,
          style: getDragStyle(),
          onPointerdown: props.mode === 'inline' ? undefined : handlePointerDown,
        }, renderPanels()),
      ]),
    });

    return () => {
      if (!visible.value || typeof window === 'undefined') {
        return null;
      }

      if (props.mode === 'inline') {
        return renderContent();
      }

      return h(Teleport, { to: 'body' }, renderContent());
    };
  },
});

// The production gate is a wrapper, so when it is off nothing subscribes and
// nothing fires.
export const DialRoot = defineComponent({
  name: 'DialKitDialRoot',
  props: {
    position: {
      type: String as () => DialPosition,
      default: 'top-right',
    },
    defaultOpen: {
      type: Boolean,
      default: true,
    },
    mode: {
      type: String as () => DialMode,
      default: 'popover',
    },
    theme: {
      type: String as () => DialTheme,
      default: 'system',
    },
    productionEnabled: {
      type: Boolean,
      default: isDevDefault,
    },
    /** How saved versions appear: captured thumbnails (default), or a menu. */
    versions: {
      type: String as () => DialVersions,
      default: 'thumbnails',
    },
  },
  emits: ['openChange'],
  setup(props, { emit }) {
    return () => props.productionEnabled
      ? h(DialRootContent, {
        position: props.position,
        defaultOpen: props.defaultOpen,
        mode: props.mode,
        theme: props.theme,
        versions: props.versions,
        onOpenChange: (open: boolean) => emit('openChange', open),
      })
      : null;
  },
});
