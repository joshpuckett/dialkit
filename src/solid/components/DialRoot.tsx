import { createEffect, createSignal, onCleanup, onMount, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { ShortcutListener } from './ShortcutListener';
import { Folder } from './Folder';
import { Panel } from './Panel';
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

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  theme?: DialTheme;
  productionEnabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DialRoot(props: DialRootProps) {
  if ((props.productionEnabled ?? isDevDefault) === false) return null;
  const [panels, setPanels] = createSignal<PanelConfig[]>([]);
  const [mounted, setMounted] = createSignal(false);
  const [dragOffset, setDragOffset] = createSignal<PanelDragOffset | null>(null);
  const [activePosition, setActivePosition] = createSignal<DialPosition>(props.position ?? 'top-right');
  const inline = () => (props.mode ?? 'popover') === 'inline';
  let panelRef: HTMLDivElement | undefined;
  let lastDragOffset: PanelDragOffset | null = null;
  let dragging = false;
  let dragStart: PanelDragStart | null = null;
  let didDrag = false;
  let dragTarget: HTMLElement | null = null;
  let panelOpenStates = new Map<string, boolean>();
  let rootOpen: boolean | undefined;

  onMount(() => {
    setMounted(true);
    setPanels(DialStore.getPanels());
    const unsub = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });
    onCleanup(unsub);
  });

  createEffect(() => {
    const fallbackOpen = inline() || (props.defaultOpen ?? true);
    const nextStates = new Map<string, boolean>();
    for (const panel of panels()) {
      nextStates.set(panel.id, panelOpenStates.get(panel.id) ?? fallbackOpen);
    }
    panelOpenStates = nextStates;
    rootOpen = Array.from(nextStates.values()).some(Boolean);
  });

  createEffect(() => {
    if (!mounted() || inline() || !panelRef) return;

    const observer = new MutationObserver(() => {
      const inners = panelRef?.querySelectorAll('.dialkit-panel-inner');
      if (!inners || inners.length === 0) return;
      const collapsed = Array.from(inners).every((el) => el.getAttribute('data-collapsed') === 'true');
      const currentDragOffset = dragOffset();

      if (!collapsed) {
        if (currentDragOffset) {
          lastDragOffset = currentDragOffset;
          const bubbleCenterX = currentDragOffset.x + 21;
          setActivePosition(bubbleCenterX < window.innerWidth / 2 ? 'top-left' : 'top-right');
        } else {
          setActivePosition(props.position ?? 'top-right');
        }
        setDragOffset(null);
      } else if (currentDragOffset) {
        lastDragOffset = currentDragOffset;
      } else if (lastDragOffset) {
        setDragOffset(lastDragOffset);
      }
    });

    observer.observe(panelRef, { subtree: true, attributes: true, attributeFilter: ['data-collapsed'] });
    onCleanup(() => observer.disconnect());
  });

  const handlePointerDown = (event: PointerEvent) => {
    const panel = panelRef ?? null;
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

    setDragOffset(getPanelDragOffset(dragStart, event.clientX, event.clientY));
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
    const fallbackOpen = inline() || (props.defaultOpen ?? true);
    const nextRootOpen = panels().some((panel) => (
      panelOpenStates.get(panel.id) ?? fallbackOpen
    ));

    if (rootOpen === nextRootOpen) return;
    rootOpen = nextRootOpen;
    props.onOpenChange?.(nextRootOpen);
  };

  const handleRootOpenChange = (open: boolean) => {
    if (rootOpen === open) return;
    rootOpen = open;
    props.onOpenChange?.(open);
  };

  const dragStyle = () => {
    const offset = dragOffset();
    return offset
      ? {
        top: `${offset.y}px`,
        left: `${offset.x}px`,
        right: 'auto',
        bottom: 'auto',
      }
      : undefined;
  };

  const content = () => (
    <ShortcutListener>
      <div class="dialkit-root" data-mode={props.mode ?? 'popover'} data-theme={props.theme ?? 'system'}>
        <div
          ref={panelRef}
          class="dialkit-panel"
          data-position={inline() ? undefined : (dragOffset() ? undefined : activePosition())}
          data-origin-x={inline() ? undefined : getPanelOriginX(activePosition(), dragOffset())}
          data-mode={props.mode ?? 'popover'}
          data-multiple={panels().length > 1 ? 'true' : undefined}
          style={dragStyle()}
          onPointerDown={!inline() ? handlePointerDown : undefined}
          onPointerMove={!inline() ? handlePointerMove : undefined}
          onPointerUp={!inline() ? handlePointerUp : undefined}
          onPointerCancel={!inline() ? handlePointerUp : undefined}
        >
          <Show
            when={panels().length > 1}
            fallback={
              <For each={panels()}>
                {(panel) => (
                  <Panel
                    panel={panel}
                    defaultOpen={inline() || (props.defaultOpen ?? true)}
                    inline={inline()}
                    onOpenChange={(open) => handlePanelOpenChange(panel.id, open)}
                  />
                )}
              </For>
            }
          >
            <div class="dialkit-panel-wrapper">
              <Folder
                title="DialKit"
                defaultOpen={inline() || (props.defaultOpen ?? true)}
                isRoot={true}
                inline={inline()}
                onOpenChange={handleRootOpenChange}
                panelHeightOffset={2}
              >
                <For each={panels()}>
                  {(panel) => (
                    <Panel
                      panel={panel}
                      defaultOpen={true}
                      variant="section"
                    />
                  )}
                </For>
              </Folder>
            </div>
          </Show>
        </div>
      </div>
    </ShortcutListener>
  );

  return (
    <Show when={mounted() && typeof window !== 'undefined' && panels().length > 0}>
      <Show when={!inline()} fallback={content()}>
        <Portal mount={document.body}>
          {content()}
        </Portal>
      </Show>
    </Show>
  );
}
