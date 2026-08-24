import { createEffect, createSignal, onCleanup, onMount, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { DialStore } from '../../store/DialStore';
import { TimelineStore } from '../../store/TimelineStore';
import { getSharedMidiController, resumeMidiConnection } from '../../midi';
import type { MidiController, MidiMappingOwner } from '../../midi';
import { fromStore } from '../primitives';
import { ShortcutListener } from './ShortcutListener';
import { RootPanel } from './RootPanel';
import { Panel } from './Panel';
import { TimelineToggleButton } from './Timeline/TimelineToggleButton';
import { MidiMenu } from './MidiMenu';
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
  /**
   * Opt in to the Web MIDI mapping UI. Pass `true` to use the shared controller,
   * or your own controller from `createMidiController()`. Permission is only
   * requested when the user enters "MIDI Map mode".
   */
  midi?: boolean | MidiController;
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
  const midiOwner: MidiMappingOwner = {};
  const midiController = (): MidiController | undefined =>
    props.midi === true ? getSharedMidiController() : props.midi || undefined;
  const panels = fromStore(
    () => DialStore.getPanels('panel'),
    (notify) => DialStore.subscribeGlobal(notify)
  );
  const timelines = fromStore(
    () => TimelineStore.getTimelines(),
    (notify) => TimelineStore.subscribeGlobal(notify)
  );
  // Hydration gate: server renders nothing, client's first render must match.
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

  onMount(() => setMounted(true));

  createEffect(() => {
    const controller = midiController();
    if (!controller) return;
    void resumeMidiConnection(controller);
    onCleanup(() => controller.stopMapping(midiOwner));
  });

  // Open state is lifted from the panels/root folder via onOpenChange
  // callbacks (this replaces the old data-collapsed MutationObserver).
  // Panels that have not reported yet fall back to defaultOpen.
  const fallbackOpen = () => inline() || (props.defaultOpen ?? true);
  const panelOpenStates = new Map<string, boolean>();
  let rootFolderOpen: boolean | undefined;

  const anyOpen = () => {
    const list = panels();
    if (list.length > 1) return rootFolderOpen ?? fallbackOpen();
    return list.some((panel) => panelOpenStates.get(panel.id) ?? fallbackOpen());
  };

  // On collapse/expand: swap the drag offset between the expanded panel and
  // the collapsed bubble so a dragged bubble returns to where it was left.
  const applyDragOffsetForOpen = (open: boolean) => {
    if (inline()) return;
    const currentDragOffset = dragOffset();

    if (open) {
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
  };

  const reactToOpenChange = (before: boolean) => {
    const after = anyOpen();
    if (after === before) return;
    applyDragOffsetForOpen(after);
    props.onOpenChange?.(after);
  };

  const handlePanelOpenChange = (panelId: string, open: boolean) => {
    const before = anyOpen();
    panelOpenStates.set(panelId, open);
    reactToOpenChange(before);
  };

  const handleRootOpenChange = (open: boolean) => {
    const before = anyOpen();
    rootFolderOpen = open;
    reactToOpenChange(before);
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (inline()) return;
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

  const timelineToggle = () => (
    <Show when={timelines().length > 0}>
      <TimelineToggleButton />
    </Show>
  );
  const midiMenu = () => (
    <Show when={midiController()}>
      {(controller) => <MidiMenu controller={controller()} ownerToken={midiOwner} />}
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
          data-mode={props.mode ?? 'popover'}
          data-multiple={panels().length > 1 ? 'true' : undefined}
          style={dragStyle()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <Show when={panels().length > 0} fallback={
            <div class="dialkit-panel-wrapper">
              <RootPanel
                title="DialKit"
                defaultOpen={fallbackOpen()}
                inline={inline()}
                onOpenChange={handleRootOpenChange}
                headerActions={midiMenu()}
                toolbar={timelineToggle()}
                panelHeightOffset={2}
              >
                <div class="dialkit-timeline-toolkit-only">Timeline</div>
              </RootPanel>
            </div>
          }>
            <Show
              when={panels().length > 1}
              fallback={
              <For each={panels()}>
                {(panel) => (
                  <Panel
                    panel={panel}
                    defaultOpen={fallbackOpen()}
                    inline={inline()}
                    toolbarExtra={timelineToggle()}
                    headerActions={midiMenu()}
                    onOpenChange={(open) => handlePanelOpenChange(panel.id, open)}
                    midi={midiController()}
                    midiOwner={midiOwner}
                  />
                )}
              </For>
              }
            >
              <div class="dialkit-panel-wrapper">
                <RootPanel
                  title="DialKit"
                  defaultOpen={fallbackOpen()}
                  inline={inline()}
                  onOpenChange={handleRootOpenChange}
                  headerActions={midiMenu()}
                  toolbar={timelineToggle()}
                  panelHeightOffset={2}
                >
                  <For each={panels()}>
                    {(panel) => (
                      <Panel
                        panel={panel}
                        defaultOpen={true}
                        variant="section"
                        midi={midiController()}
                        midiOwner={midiOwner}
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
    <Show when={mounted() && (panels().length > 0 || timelines().length > 0)}>
      <Show when={!inline()} fallback={content()}>
        <Portal mount={document.body}>
          {content()}
        </Portal>
      </Show>
    </Show>
  );
}
