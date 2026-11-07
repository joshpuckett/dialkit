import { createComputed, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack, Show, For } from 'solid-js';
import { Portal, isServer } from 'solid-js/web';
import { DialStore } from '../../store/DialStore';
import { TimelineStore } from '../../store/TimelineStore';
import { TimelineUiStore } from '../../store/TimelineUiStore';
import { fromStore } from '../primitives';
import { ShortcutListener } from './ShortcutListener';
import { RootPanel } from './RootPanel';
import { Panel } from './Panel';
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
  /** How saved versions appear: captured thumbnails (default), or a menu. */
  versions?: DialVersions;
  onOpenChange?: (open: boolean) => void;
}

export function DialRoot(props: DialRootProps) {
  const enabled = () => (props.productionEnabled ?? isDevDefault) !== false;
  return (
    <Show when={enabled()}>
      <DialRootInner {...props} />
    </Show>
  );
}

function DialRootInner(props: DialRootProps) {
  const panels = fromStore(
    () => DialStore.getPanels('panel'),
    (notify) => DialStore.subscribeGlobal(notify)
  );
  // Timeline-backed panels render in DialTimeline, but their presence adds a
  // visibility toggle here, as long as a dock is mounted for it to show and hide.
  const timelineCount = fromStore(
    () => (TimelineUiStore.hasDock() ? TimelineStore.getTimelines().length : 0),
    (notify) => {
      const stopTimelines = TimelineStore.subscribeGlobal(notify);
      const stopDock = TimelineUiStore.subscribe(notify);
      return () => {
        stopTimelines();
        stopDock();
      };
    }
  );
  // Hydration gate: server renders nothing, client's first render must match.
  const [mounted, setMounted] = createSignal(false);
  const [dragOffset, setDragOffset] = createSignal<PanelDragOffset | null>(null);
  const [activePosition, setActivePosition] = createSignal<DialPosition>(props.position ?? 'top-right');
  const inline = () => (props.mode ?? 'popover') === 'inline';
  let panelRef: HTMLDivElement | undefined;
  let lastDragOffset: PanelDragOffset | null = null;
  let stopDrag: StopGesture | null = null;

  onMount(() => setMounted(true));
  onCleanup(() => stopDrag?.(false));

  const fallbackOpen = () => inline() || (props.defaultOpen ?? true);
  const [shellOpen, setShellOpen] = createSignal(fallbackOpen());
  const panelCount = createMemo(() => panels().length);
  const panelIds = createMemo(() => panels().map((panel) => panel.id));
  const singleId = createMemo(() => (panelCount() === 1 ? panels()[0].id : undefined));

  // The root's open state has one home per layout: a lone panel is its own root,
  // and everything else lives in the shell.
  const [singleOpenChanges, bumpSingleOpen] = createSignal(0);
  createComputed(() => {
    const id = singleId();
    if (id && !isServer) onCleanup(DialStore.subscribe(id, () => bumpSingleOpen((count) => count + 1)));
  });
  const rootOpen = createMemo(() => {
    singleOpenChanges();
    const id = singleId();
    return id ? (DialStore.getPanelOpen(id) ?? fallbackOpen()) : shellOpen();
  });
  const visible = createMemo(() => mounted() && (panelCount() > 0 || timelineCount() > 0));

  // Panels coming and going move that state between homes, so the root stays as
  // the person left it. Moving it is not a change to report; anything else is.
  let layout: { count: number; open: boolean } | null = null;
  let reportedOpen: boolean | null = null;
  const carryOpenState = (previous: { count: number; open: boolean }, count: number) => {
    if (count !== 1) {
      setShellOpen(previous.open);
      return true;
    }
    const id = panels()[0].id;
    if (previous.count > 1) {
      DialStore.setPanelOpen(id, previous.open);
      return true;
    }
    if (DialStore.getPanelOpen(id) === undefined) {
      DialStore.initPanelOpen(id, previous.open);
      return true;
    }
    return false;
  };
  createEffect(() => {
    if (!visible()) return;
    const count = panelCount();
    const open = rootOpen();
    untrack(() => {
      const previous = layout;
      layout = { count, open };
      if (previous && previous.count !== count && previous.open !== open && carryOpenState(previous, count)) {
        layout = { count, open: previous.open };
        return;
      }
      if (reportedOpen !== null && reportedOpen !== open) props.onOpenChange?.(open);
      reportedOpen = open;
    });
  });

  // Snap to a corner on open, and restore the dragged position on close.
  createEffect(on(rootOpen, (open) => {
    if (inline()) return;
    const offset = dragOffset();
    if (open) {
      const position = props.position ?? 'top-right';
      lastDragOffset = offset ?? lastDragOffset;
      setActivePosition(offset ? getPanelCorner(position, offset) : position);
      setDragOffset(null);
    } else if (offset) {
      lastDragOffset = offset;
    } else if (lastDragOffset) {
      setDragOffset(lastDragOffset);
    }
  }, { defer: true }));

  createEffect(on(() => props.position, (position) => {
    if (!dragOffset() && !lastDragOffset) setActivePosition(position ?? 'top-right');
  }, { defer: true }));

  // Keep a dragged panel on screen when the window shrinks.
  createEffect(() => {
    if (inline()) return;
    const onResize = () => {
      setDragOffset((offset) => offset && clampPanelOffset(offset, panelRef?.getBoundingClientRect().width));
      if (lastDragOffset) lastDragOffset = clampPanelOffset(lastDragOffset);
    };
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  });

  // Requests to open a panel also reveal the shell it sits in.
  onMount(() => {
    onCleanup(DialStore.subscribePanelOpen((id, open) => {
      const list = untrack(panels);
      if (open && list.length > 1 && list.some((panel) => panel.id === id)) setShellOpen(true);
    }));
  });

  const handlePointerDown = (event: PointerEvent) => {
    if (inline()) return;
    const panel = panelRef ?? null;
    const handle = getPanelDragHandle(event.target, panel);
    if (!panel || !handle || stopDrag) return;

    const start = getPanelDragStart(event.clientX, event.clientY, panel);
    const startOffset = dragOffset();
    let moved = false;
    stopDrag = startPointerGesture(event, handle, {
      move(next) {
        if (!moved && !hasPanelDragMoved(start, next.clientX, next.clientY)) return;
        moved = true;
        setDragOffset(getPanelDragOffset(start, next.clientX, next.clientY));
      },
      end(cancelled) {
        stopDrag = null;
        if (!moved) return;
        if (cancelled) setDragOffset(startOffset);
        // A drag must not also count as a click that toggles the panel.
        else blockPanelDragClick(handle);
      },
    });
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

  // Keyed by id, not identity: DialStore.updatePanel replaces the PanelConfig.
  const panelById = (id: string) => panels().find((panel) => panel.id === id)!;

  const timelineToggle = () => (
    <Show when={timelineCount() > 0}>
      <TimelineToggleButton />
    </Show>
  );

  const content = () => (
    <ShortcutListener>
      <div class="dialkit-root" data-mode={props.mode ?? 'popover'} data-theme={props.theme ?? 'system'}>
        <div
          ref={panelRef}
          class="dialkit-panel"
          data-position={inline() ? undefined : (dragOffset() ? undefined : activePosition())}
          data-origin-x={inline() ? undefined : getPanelOriginX(activePosition(), dragOffset())}
          data-origin-y={inline() ? undefined : getPanelOriginY(activePosition(), dragOffset())}
          data-mode={props.mode ?? 'popover'}
          data-multiple={panelCount() > 1 ? 'true' : undefined}
          style={dragStyle()}
          onPointerDown={handlePointerDown}
        >
          <Show when={panelCount() > 0} fallback={
            <div class="dialkit-panel-wrapper">
              <RootPanel
                title="DialKit"
                open={shellOpen()}
                defaultOpen={fallbackOpen()}
                inline={inline()}
                onOpenChange={setShellOpen}
                toolbar={timelineToggle()}
              >
                <div class="dialkit-timeline-toolkit-only">Timeline</div>
              </RootPanel>
            </div>
          }>
            <Show
              when={panelCount() > 1}
              fallback={
              <For each={panelIds()}>
                {(id) => (
                  <Panel
                    panel={panelById(id)}
                    defaultOpen={fallbackOpen()}
                    inline={inline()}
                    toolbarExtra={timelineToggle()}
                    versions={props.versions}
                    theme={props.theme}
                  />
                )}
              </For>
              }
            >
              <div class="dialkit-panel-wrapper">
                <RootPanel
                  title="DialKit"
                  open={shellOpen()}
                  defaultOpen={fallbackOpen()}
                  inline={inline()}
                  onOpenChange={setShellOpen}
                  toolbar={timelineToggle()}
                >
                  <For each={panelIds()}>
                    {(id) => (
                      <Panel
                        panel={panelById(id)}
                        defaultOpen={true}
                        variant="section"
                        versions={props.versions}
                        theme={props.theme}
                      />
                    )}
                  </For>
                </RootPanel>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </ShortcutListener>
  );

  return (
    <Show when={visible()}>
      <Show when={!inline()} fallback={content()}>
        <Portal mount={document.body}>
          {content()}
        </Portal>
      </Show>
    </Show>
  );
}
