import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref, Teleport, watch } from 'vue';
import { MotionConfig } from 'motion-v';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { TimelineStore } from '../../store/TimelineStore';
import type { TimelineMeta } from '../../store/TimelineStore';
import { Folder } from './Folder';
import { Panel } from './Panel';
import { ShortcutListener } from './ShortcutListener';
import { TimelineToggleButton } from './Timeline/TimelineToggleButton';
import {
  blockPanelDragClick,
  capturePanelPointer,
  releasePanelPointer,
  getPanelCorner,
  getPanelDragHandle,
  getPanelDragOffset,
  getPanelDragStart,
  getPanelKeyboardOffset,
  getPanelOriginX,
  getPanelOriginY,
  hasPanelDragMoved,
  type PanelDragOffset,
  type PanelDragStart,
} from '../../panel-drag';
import { observePanelKeyboard } from '../../panel-keyboard';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';

declare const process: { env?: { NODE_ENV?: string } } | undefined;

const isDevDefault = typeof process !== 'undefined' && process?.env?.NODE_ENV
  ? process.env.NODE_ENV !== 'production'
  : typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE
    ? (import.meta as any).env.MODE !== 'production'
    : true;

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
    /** Shortcut that opens the panel and moves focus into it, such as `"mod+period"`. Off by default. */
    hotkey: {
      type: String,
      default: undefined,
    },
  },
  emits: ['openChange'],
  setup(props, { emit }) {
    const panels = ref<PanelConfig[]>([]);
    const timelines = ref<TimelineMeta[]>([]);
    const mounted = ref(false);
    const panelRef = ref<HTMLDivElement | null>(null);
    const dragOffset = ref<PanelDragOffset | null>(null);
    const activePosition = ref<DialPosition>(props.position);
    let unsubscribePanels: (() => void) | undefined;
    let unsubscribeTimelines: (() => void) | undefined;
    let observer: MutationObserver | undefined;
    let keyboard: ReturnType<typeof observePanelKeyboard> | undefined;
    let keyboardPanel: HTMLDivElement | null = null;
    let lastDragOffset: PanelDragOffset | null = null;
    let dragging = false;
    let dragStart: PanelDragStart | null = null;
    let didDrag = false;
    let dragTarget: HTMLElement | null = null;
    let panelOpenStates = new Map<string, boolean>();
    const shellOpen = ref(props.mode === 'inline' || props.defaultOpen);
    let unsubscribeOpen: (() => void) | undefined;
    let rootOpen: boolean | undefined;

    const syncPanelOpenStates = () => {
      const fallbackOpen = props.mode === 'inline' || props.defaultOpen;
      const nextStates = new Map<string, boolean>();
      for (const panel of panels.value) {
        nextStates.set(panel.id, panelOpenStates.get(panel.id) ?? DialStore.getPanelOpen(panel.id) ?? fallbackOpen);
      }
      panelOpenStates = nextStates;
      rootOpen = Array.from(nextStates.values()).some(Boolean);
    };

    const connectObserver = () => {
      if (observer || props.mode === 'inline' || !panelRef.value) return;

      observer = new MutationObserver(() => {
        const inners = panelRef.value?.querySelectorAll('.dialkit-panel-inner');
        if (!inners || inners.length === 0) return;
        const collapsed = Array.from(inners).every((el) => el.getAttribute('data-collapsed') === 'true');
        const currentDragOffset = dragOffset.value;

        if (!collapsed) {
          if (currentDragOffset) {
            lastDragOffset = currentDragOffset;
            activePosition.value = getPanelCorner(props.position, currentDragOffset);
          } else {
            activePosition.value = props.position;
          }
          dragOffset.value = null;
        } else if (currentDragOffset) {
          lastDragOffset = currentDragOffset;
        } else if (lastDragOffset) {
          dragOffset.value = lastDragOffset;
        }
      });

      observer.observe(panelRef.value, { subtree: true, attributes: true, attributeFilter: ['data-collapsed'] });
    };

    const movePanel = (dx: number, dy: number) => {
      const rect = panelRef.value?.getBoundingClientRect();
      if (rect) dragOffset.value = getPanelKeyboardOffset(rect, dx, dy, window.innerWidth, window.innerHeight);
    };

    const keyboardOptions = () => ({ hotkey: props.hotkey, inline: props.mode === 'inline', move: movePanel });

    const connectKeyboard = (panel: HTMLDivElement | null) => {
      if (panel === keyboardPanel) return;
      keyboard?.destroy();
      keyboard = panel ? observePanelKeyboard(panel, keyboardOptions()) : undefined;
      keyboardPanel = panel;
    };

    // Also runs when the panels change, since that can rebuild the root header.
    watch(() => [props.hotkey, props.mode, panels.value], () => keyboard?.update(keyboardOptions()), { flush: 'post' });

    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.value;
      const handle = getPanelDragHandle(event.target, panel);
      if (!panel || !handle) return;

      dragTarget = handle;
      dragStart = getPanelDragStart(event.clientX, event.clientY, panel);
      didDrag = false;
      dragging = true;
      capturePanelPointer(handle, event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragging || !dragStart) return;

      if (!didDrag && !hasPanelDragMoved(dragStart, event.clientX, event.clientY)) return;
      didDrag = true;

      dragOffset.value = getPanelDragOffset(dragStart, event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      dragStart = null;
      const handle = dragTarget;

      if (handle?.hasPointerCapture(event.pointerId)) {
        releasePanelPointer(handle, event.pointerId);
      }

      if (didDrag) {
        event.stopPropagation();
        if (handle) {
          blockPanelDragClick(handle);
        }
      }

      dragTarget = null;
    };

    const handlePanelOpenChange = (panelId: string, open: boolean) => {
      panelOpenStates.set(panelId, open);
      const fallbackOpen = props.mode === 'inline' || props.defaultOpen;
      const nextRootOpen = panels.value.some((panel) => (
        panelOpenStates.get(panel.id) ?? fallbackOpen
      ));

      if (rootOpen === nextRootOpen) return;
      rootOpen = nextRootOpen;
      emit('openChange', nextRootOpen);
    };

    const handleRootOpenChange = (open: boolean) => {
      shellOpen.value = open;
      if (rootOpen === open) return;
      rootOpen = open;
      emit('openChange', open);
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

    onMounted(() => {
      mounted.value = true;
      panels.value = DialStore.getPanels('panel');
      timelines.value = TimelineStore.getTimelines();
      syncPanelOpenStates();
      unsubscribePanels = DialStore.subscribeGlobal(() => {
        panels.value = DialStore.getPanels('panel');
        syncPanelOpenStates();
      });
      unsubscribeOpen = DialStore.subscribePanelOpen((id, open) => {
        if (!panels.value.some(panel => panel.id === id)) return;
        if (panels.value.length > 1 && open) handleRootOpenChange(true);
        else if (panels.value.length === 1) handlePanelOpenChange(id, open);
      });
      unsubscribeTimelines = TimelineStore.subscribeGlobal(() => {
        timelines.value = TimelineStore.getTimelines();
      });
      nextTick(connectObserver);
    });

    onUnmounted(() => {
      unsubscribePanels?.();
      unsubscribeTimelines?.();
      unsubscribeOpen?.();
      observer?.disconnect();
      connectKeyboard(null);
    });

    const timelineToggle = () => timelines.value.length > 0 ? h(TimelineToggleButton) : null;

    const renderPanels = () => {
      if (panels.value.length === 0) {
        return [h('div', { class: 'dialkit-panel-wrapper' }, [
          h(Folder, {
            title: 'DialKit',
            open: shellOpen.value,
            defaultOpen: props.mode === 'inline' || props.defaultOpen,
            isRoot: true,
            inline: props.mode === 'inline',
            toolbar: timelineToggle,
            onOpenChange: handleRootOpenChange,
            }, { default: () => [h('div', { class: 'dialkit-timeline-toolkit-only' }, 'Timeline')] }),
        ])];
      }
      if (panels.value.length > 1) {
        return [h('div', { class: 'dialkit-panel-wrapper' }, [
          h(Folder, {
            title: 'DialKit',
            open: shellOpen.value,
            defaultOpen: props.mode === 'inline' || props.defaultOpen,
            isRoot: true,
            inline: props.mode === 'inline',
            toolbar: timelineToggle,
            onOpenChange: handleRootOpenChange,
            }, {
            default: () => panels.value.map((panel) => h(Panel, {
              key: panel.id,
              panel,
              defaultOpen: true,
              variant: 'section',
            })),
          }),
        ])];
      }
      return panels.value.map((panel) => h(Panel, {
        key: panel.id,
        panel,
        defaultOpen: props.mode === 'inline' || props.defaultOpen,
        inline: props.mode === 'inline',
        toolbarExtra: timelineToggle,
        onOpenChange: (open: boolean) => handlePanelOpenChange(panel.id, open),
      }));
    };

    const renderContent = () => h(ShortcutListener, null, {
      default: () => h('div', { class: 'dialkit-root', 'data-mode': props.mode, 'data-theme': props.theme }, [
        h('div', {
          ref: (el) => {
            panelRef.value = el as HTMLDivElement | null;
            connectObserver();
            connectKeyboard(panelRef.value);
          },
          class: 'dialkit-panel',
          'data-position': props.mode === 'inline' ? undefined : (dragOffset.value ? undefined : activePosition.value),
          'data-origin-x': originX.value,
          'data-origin-y': originY.value,
          'data-mode': props.mode,
          'data-multiple': panels.value.length > 1 ? 'true' : undefined,
          style: getDragStyle(),
          onPointerdown: props.mode === 'inline' ? undefined : handlePointerDown,
          onPointermove: props.mode === 'inline' ? undefined : handlePointerMove,
          onPointerup: props.mode === 'inline' ? undefined : handlePointerUp,
          onPointercancel: props.mode === 'inline' ? undefined : handlePointerUp,
        }, renderPanels()),
      ]),
    });

    return () => {
      if (!props.productionEnabled || !mounted.value || typeof window === 'undefined' || (panels.value.length === 0 && timelines.value.length === 0)) {
        return null;
      }

      const content = h(MotionConfig, { reducedMotion: 'user' }, { default: renderContent });

      if (props.mode === 'inline') {
        return content;
      }

      return h(Teleport, { to: 'body' }, content);
    };
  },
});
