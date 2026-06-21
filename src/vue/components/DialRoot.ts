import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref, Teleport } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { Folder } from './Folder';
import { Panel } from './Panel';
import { ShortcutListener } from './ShortcutListener';
import {
  blockPanelDragClick,
  getPanelDragHandle,
  getPanelDragOffset,
  getPanelDragStart,
  getPanelOriginX,
  hasPanelDragMoved,
  type PanelDragOffset,
  type PanelDragStart,
} from '../../panel-drag';

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
  },
  emits: ['openChange'],
  setup(props, { emit }) {
    const panels = ref<PanelConfig[]>([]);
    const mounted = ref(false);
    const panelRef = ref<HTMLDivElement | null>(null);
    const dragOffset = ref<PanelDragOffset | null>(null);
    const activePosition = ref<DialPosition>(props.position);
    let unsubscribe: (() => void) | undefined;
    let observer: MutationObserver | undefined;
    let lastDragOffset: PanelDragOffset | null = null;
    let dragging = false;
    let dragStart: PanelDragStart | null = null;
    let didDrag = false;
    let dragTarget: HTMLElement | null = null;
    let panelOpenStates = new Map<string, boolean>();
    let rootOpen: boolean | undefined;

    const syncPanelOpenStates = () => {
      const fallbackOpen = props.mode === 'inline' || props.defaultOpen;
      const nextStates = new Map<string, boolean>();
      for (const panel of panels.value) {
        nextStates.set(panel.id, panelOpenStates.get(panel.id) ?? fallbackOpen);
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
            const bubbleCenterX = currentDragOffset.x + 21;
            activePosition.value = bubbleCenterX < window.innerWidth / 2 ? 'top-left' : 'top-right';
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

    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.value;
      const handle = getPanelDragHandle(event.target, panel);
      if (!panel || !handle) return;

      dragTarget = handle;
      dragStart = getPanelDragStart(event.clientX, event.clientY, panel);
      didDrag = false;
      dragging = true;
      handle.setPointerCapture(event.pointerId);
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
        handle.releasePointerCapture(event.pointerId);
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

    onMounted(() => {
      mounted.value = true;
      panels.value = DialStore.getPanels();
      syncPanelOpenStates();
      unsubscribe = DialStore.subscribeGlobal(() => {
        panels.value = DialStore.getPanels();
        syncPanelOpenStates();
      });
      nextTick(connectObserver);
    });

    onUnmounted(() => {
      unsubscribe?.();
      observer?.disconnect();
    });

    const renderContent = () => h(ShortcutListener, null, {
      default: () => h('div', { class: 'dialkit-root', 'data-mode': props.mode, 'data-theme': props.theme }, [
        h('div', {
          ref: (el) => {
            panelRef.value = el as HTMLDivElement | null;
            connectObserver();
          },
          class: 'dialkit-panel',
          'data-position': props.mode === 'inline' ? undefined : (dragOffset.value ? undefined : activePosition.value),
          'data-origin-x': originX.value,
          'data-mode': props.mode,
          'data-multiple': panels.value.length > 1 ? 'true' : undefined,
          style: getDragStyle(),
          onPointerdown: props.mode === 'inline' ? undefined : handlePointerDown,
          onPointermove: props.mode === 'inline' ? undefined : handlePointerMove,
          onPointerup: props.mode === 'inline' ? undefined : handlePointerUp,
          onPointercancel: props.mode === 'inline' ? undefined : handlePointerUp,
        }, panels.value.length > 1
          ? [
            h('div', { class: 'dialkit-panel-wrapper' }, [
              h(Folder, {
                title: 'DialKit',
                defaultOpen: props.mode === 'inline' || props.defaultOpen,
                isRoot: true,
                inline: props.mode === 'inline',
                onOpenChange: handleRootOpenChange,
                panelHeightOffset: 2,
              }, {
                default: () => panels.value.map((panel) => h(Panel, {
                  key: panel.id,
                  panel,
                  defaultOpen: true,
                  variant: 'section',
                })),
              }),
            ]),
          ]
          : panels.value.map((panel) => h(Panel, {
            key: panel.id,
            panel,
            defaultOpen: props.mode === 'inline' || props.defaultOpen,
            inline: props.mode === 'inline',
            onOpenChange: (open: boolean) => handlePanelOpenChange(panel.id, open),
          }))),
      ]),
    });

    return () => {
      if (!props.productionEnabled || !mounted.value || typeof window === 'undefined' || panels.value.length === 0) {
        return null;
      }

      if (props.mode === 'inline') {
        return renderContent();
      }

      return h(Teleport, { to: 'body' }, renderContent());
    };
  },
});
