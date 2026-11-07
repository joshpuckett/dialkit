<script lang="ts">
  import { untrack } from 'svelte';
  import { DialStore } from 'dialkit/store';
  import type { PanelConfig } from 'dialkit/store';
  import { TimelineStore, TimelineUiStore } from 'dialkit/timeline';
  import { themeCSS } from '../theme-css';
  import type { DialVersions } from '../../version-gallery';
  import Portal from '../Portal.svelte';
  import Folder from './Folder.svelte';
  import Panel from './Panel.svelte';
  import TimelineToggleButton from './Timeline/TimelineToggleButton.svelte';
  import ShortcutListener from './ShortcutListener.svelte';
  import type { DialMode, DialPosition, DialTheme } from './DialRoot.svelte';
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

  let { position = 'top-right', defaultOpen = true, mode = 'popover', theme = 'system' as DialTheme, versions = 'thumbnails', onOpenChange } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
    versions?: DialVersions;
    onOpenChange?: (open: boolean) => void;
  }>();

  const inline = $derived(mode === 'inline');
  let shellOpen = $state(untrack(() => mode === 'inline' || defaultOpen));

  let panels = $state.raw<PanelConfig[]>([]);
  let timelineCount = $state(0);
  let mounted = $state(false);
  let panelRef = $state<HTMLDivElement>();
  let dragOffset = $state.raw<PanelDragOffset | null>(null);
  let activePosition = $state<DialPosition>(untrack(() => position));
  let lastDragOffset: PanelDragOffset | null = null;
  let stopDrag: StopGesture | null = null;

  const dragStyle = $derived(
    dragOffset
      ? `top:${dragOffset.y}px;left:${dragOffset.x}px;right:auto;bottom:auto;`
      : undefined
  );
  const originX = $derived(inline ? undefined : getPanelOriginX(activePosition, dragOffset));
  const originY = $derived(inline ? undefined : getPanelOriginY(activePosition, dragOffset));

  $effect(() => {
    const id = 'dialkit-theme';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = themeCSS;
      document.head.appendChild(style);
    }
  });

  // Timeline-backed panels render in DialTimeline, but their presence adds a
  // visibility toggle here, as long as a dock is mounted for it to show and hide.
  $effect(() => {
    const syncTimelines = () => {
      timelineCount = TimelineUiStore.hasDock() ? TimelineStore.getTimelines().length : 0;
    };
    mounted = true;
    panels = DialStore.getPanels('panel');
    syncTimelines();

    const unsubscribePanels = DialStore.subscribeGlobal(() => {
      panels = DialStore.getPanels('panel');
    });
    const unsubscribeTimelines = TimelineStore.subscribeGlobal(syncTimelines);
    const unsubscribeDock = TimelineUiStore.subscribe(syncTimelines);

    return () => {
      unsubscribePanels();
      unsubscribeTimelines();
      unsubscribeDock();
    };
  });

  // The root's open state has one home per layout: a lone panel is its own root,
  // and everything else lives in the shell.
  const singleId = $derived(panels.length === 1 ? panels[0].id : undefined);
  let singleOpen = $state<boolean | undefined>(undefined);
  const rootOpen = $derived(singleId ? (singleOpen ?? (inline || defaultOpen)) : shellOpen);
  const visible = $derived(mounted && (panels.length > 0 || timelineCount > 0));

  // Pre effects, in this order: the layout effect needs the new panel's state,
  // and must run before that panel mounts and applies its own default.
  $effect.pre(() => {
    const id = singleId;
    const sync = () => {
      singleOpen = id ? DialStore.getPanelOpen(id) : undefined;
    };
    sync();
    return id ? DialStore.subscribe(id, sync) : undefined;
  });

  // Panels coming and going move that state between homes, so the root stays as
  // the person left it.
  let layout: { count: number; open: boolean } | null = null;
  $effect.pre(() => {
    const count = panels.length;
    const open = rootOpen;
    if (!visible) return;
    untrack(() => {
      const previous = layout;
      layout = { count, open };
      if (!previous || previous.count === count || previous.open === open) return;
      if (count !== 1) {
        shellOpen = previous.open;
      } else if (previous.count > 1) {
        DialStore.setPanelOpen(panels[0].id, previous.open);
      } else if (DialStore.getPanelOpen(panels[0].id) === undefined) {
        DialStore.initPanelOpen(panels[0].id, previous.open);
      } else {
        return;
      }
      layout = { count, open: previous.open };
    });
  });

  // Snap to a corner on open, and restore the dragged position on close.
  let wasOpen = untrack(() => rootOpen);
  $effect.pre(() => {
    const open = rootOpen;
    if (wasOpen === open) return;
    wasOpen = open;
    if (inline) return;
    untrack(() => {
      const offset = dragOffset;
      if (open) {
        lastDragOffset = offset ?? lastDragOffset;
        activePosition = offset ? getPanelCorner(position, offset) : position;
        dragOffset = null;
      } else if (offset) {
        lastDragOffset = offset;
      } else if (lastDragOffset) {
        dragOffset = lastDragOffset;
      }
    });
  });

  // Report changes to the root, whichever home they happened in. Moves between
  // homes settle in the layout effect above, before this reads the state.
  let reportedOpen: boolean | null = null;
  $effect(() => {
    const open = rootOpen;
    if (!visible) return;
    if (reportedOpen !== null && reportedOpen !== open) {
      untrack(() => onOpenChange?.(open));
    }
    reportedOpen = open;
  });

  $effect(() => {
    const next = position;
    if (!untrack(() => dragOffset) && !lastDragOffset) activePosition = next;
  });

  // Keep a dragged panel on screen when the window shrinks.
  $effect(() => {
    if (inline) return;
    const onResize = () => {
      if (dragOffset) dragOffset = clampPanelOffset(dragOffset, panelRef?.getBoundingClientRect().width);
      if (lastDragOffset) lastDragOffset = clampPanelOffset(lastDragOffset);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  $effect(() => () => stopDrag?.(false));

  // Requests to open a panel also reveal the shell it sits in.
  $effect(() => DialStore.subscribePanelOpen((id, open) => {
    untrack(() => {
      if (open && panels.length > 1 && panels.some((panel) => panel.id === id)) shellOpen = true;
    });
  }));

  function handlePointerDown(event: PointerEvent) {
    const panel = panelRef ?? null;
    const handle = getPanelDragHandle(event.target, panel);
    if (!panel || !handle || stopDrag) return;

    const start = getPanelDragStart(event.clientX, event.clientY, panel);
    const startOffset = dragOffset;
    let moved = false;
    stopDrag = startPointerGesture(event, handle, {
      move(next) {
        if (!moved && !hasPanelDragMoved(start, next.clientX, next.clientY)) return;
        moved = true;
        dragOffset = getPanelDragOffset(start, next.clientX, next.clientY);
      },
      end(cancelled) {
        stopDrag = null;
        if (!moved) return;
        if (cancelled) dragOffset = startOffset;
        // A drag must not also count as a click that toggles the panel.
        else blockPanelDragClick(handle);
      },
    });
  }
</script>

{#snippet timelineToolbar()}
  <TimelineToggleButton />
{/snippet}

{#if visible}
  {#snippet content()}
    <ShortcutListener>
      <div class="dialkit-root" data-mode={mode} data-theme={theme}>
        <div
          bind:this={panelRef}
          class="dialkit-panel"
          data-mode={mode}
          data-position={inline ? undefined : (dragOffset ? undefined : activePosition)}
          data-origin-x={originX}
          data-origin-y={originY}
          data-multiple={panels.length > 1 ? 'true' : undefined}
          style={dragStyle}
          onpointerdown={!inline ? handlePointerDown : undefined}
        >
          {#if panels.length === 0}
            <div class="dialkit-panel-wrapper">
              <Folder
                title="DialKit"
                open={shellOpen}
                defaultOpen={inline || defaultOpen}
                isRoot={true}
                {inline}
                onOpenChange={(open) => { shellOpen = open; }}
                toolbar={timelineCount > 0 ? timelineToolbar : undefined}
              >
                <div class="dialkit-timeline-toolkit-only">Timeline</div>
              </Folder>
            </div>
          {:else if panels.length > 1}
            <div class="dialkit-panel-wrapper">
              <Folder
                title="DialKit"
                open={shellOpen}
                defaultOpen={inline || defaultOpen}
                isRoot={true}
                {inline}
                onOpenChange={(open) => { shellOpen = open; }}
                toolbar={timelineCount > 0 ? timelineToolbar : undefined}
              >
                {#each panels as panel (panel.id)}
                  <Panel
                    {panel}
                    defaultOpen={true}
                    variant="section"
                    {versions}
                    {theme}
                  />
                {/each}
              </Folder>
            </div>
          {:else}
            {#each panels as panel (panel.id)}
              <Panel
                {panel}
                defaultOpen={inline || defaultOpen}
                {inline}
                toolbarExtra={timelineCount > 0 ? timelineToolbar : undefined}
                {versions}
                {theme}
              />
            {/each}
          {/if}
        </div>
      </div>
    </ShortcutListener>
  {/snippet}

  {#if inline}
    {@render content()}
  {:else}
    <Portal target="body">
      {@render content()}
    </Portal>
  {/if}
{/if}
