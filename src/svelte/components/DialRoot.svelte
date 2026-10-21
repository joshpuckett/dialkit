<script lang="ts">
  import { untrack } from 'svelte';
  import { DialStore } from 'dialkit/store';
  import type { PanelConfig } from 'dialkit/store';
  import { TimelineStore } from 'dialkit/timeline';
  import type { TimelineMeta } from 'dialkit/timeline';
  import { themeCSS } from '../theme-css';
  import Portal from '../Portal.svelte';
  import Folder from './Folder.svelte';
  import Panel from './Panel.svelte';
  import TimelineToggleButton from './Timeline/TimelineToggleButton.svelte';
  import ShortcutListener from './ShortcutListener.svelte';
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

  const nodeEnv = (globalThis as typeof globalThis & { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  const viteMode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
  const isDevDefault = nodeEnv
    ? nodeEnv !== 'production'
    : viteMode
      ? viteMode !== 'production'
      : true;

  let { position = 'top-right', defaultOpen = true, mode = 'popover', theme = 'system' as DialTheme, productionEnabled = isDevDefault, hotkey, onOpenChange } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
    productionEnabled?: boolean;
    /** Shortcut that opens the panel and moves focus into it, such as `"mod+period"`. Off by default. */
    hotkey?: string;
    onOpenChange?: (open: boolean) => void;
  }>();

  const inline = $derived(mode === 'inline');
  let shellOpen = $state(untrack(() => mode === 'inline' || defaultOpen));

  let panels = $state<PanelConfig[]>([]);
  let timelines = $state<TimelineMeta[]>([]);
  let mounted = $state(false);
  let panelRef = $state<HTMLDivElement>();
  let dragOffset = $state<PanelDragOffset | null>(null);
  let activePosition = $state<DialPosition>(position);
  let lastDragOffset: PanelDragOffset | null = null;
  let dragging = false;
  let dragStart: PanelDragStart | null = null;
  let didDrag = false;
  let dragTarget: HTMLElement | null = null;
  let panelOpenStates = new Map<string, boolean>();
  let rootOpen: boolean | undefined;
  let keyboard: ReturnType<typeof observePanelKeyboard> | undefined;

  const dragStyle = $derived(
    dragOffset
      ? `top:${dragOffset.y}px;left:${dragOffset.x}px;right:auto;bottom:auto;`
      : undefined
  );
  const originX = $derived(inline ? undefined : getPanelOriginX(activePosition, dragOffset));
  const originY = $derived(inline ? undefined : getPanelOriginY(activePosition, dragOffset));

  $effect(() => {
    if (typeof document === 'undefined') return;
    const id = 'dialkit-theme';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = themeCSS;
      document.head.appendChild(style);
    }
  });

  $effect(() => {
    if (typeof window === 'undefined') return;

    mounted = true;
    panels = DialStore.getPanels('panel');
    timelines = TimelineStore.getTimelines();

    const unsubscribePanels = DialStore.subscribeGlobal(() => {
      panels = DialStore.getPanels('panel');
    });
    const unsubscribeOpen = DialStore.subscribePanelOpen((id, open) => {
      if (!panels.some(panel => panel.id === id)) return;
      if (panels.length > 1 && open) handleRootOpenChange(true);
      else if (panels.length === 1) handlePanelOpenChange(id, open);
    });
    const unsubscribeTimelines = TimelineStore.subscribeGlobal(() => {
      timelines = TimelineStore.getTimelines();
    });

    return () => {
      unsubscribePanels();
      unsubscribeTimelines();
      unsubscribeOpen();
    };
  });

  $effect(() => {
    const fallbackOpen = inline || defaultOpen;
    const nextStates = new Map<string, boolean>();
    for (const panel of panels) {
      nextStates.set(panel.id, panelOpenStates.get(panel.id) ?? DialStore.getPanelOpen(panel.id) ?? fallbackOpen);
    }
    panelOpenStates = nextStates;
    rootOpen = Array.from(nextStates.values()).some(Boolean);
  });

  $effect(() => {
    if (inline || !panelRef) return;

    const observer = new MutationObserver(() => {
      const inners = panelRef?.querySelectorAll('.dialkit-panel-inner');
      if (!inners || inners.length === 0) return;
      const collapsed = Array.from(inners).every((el) => el.getAttribute('data-collapsed') === 'true');

      if (!collapsed) {
        if (dragOffset) {
          lastDragOffset = dragOffset;
          activePosition = getPanelCorner(position, dragOffset);
        } else {
          activePosition = position;
        }
        dragOffset = null;
      } else if (dragOffset) {
        lastDragOffset = dragOffset;
      } else if (lastDragOffset) {
        dragOffset = lastDragOffset;
      }
    });

    observer.observe(panelRef, { subtree: true, attributes: true, attributeFilter: ['data-collapsed'] });
    return () => observer.disconnect();
  });

  function movePanel(dx: number, dy: number) {
    const rect = panelRef?.getBoundingClientRect();
    if (rect) dragOffset = getPanelKeyboardOffset(rect, dx, dy, window.innerWidth, window.innerHeight);
  }

  $effect(() => {
    const panel = panelRef;
    if (!panel) return;
    const observer = untrack(() => observePanelKeyboard(panel, { hotkey, inline, move: movePanel }));
    keyboard = observer;
    return () => {
      observer.destroy();
      keyboard = undefined;
    };
  });

  // Also runs when the panels change, since that can rebuild the root header.
  $effect(() => {
    void panels;
    keyboard?.update({ hotkey, inline, move: movePanel });
  });

  function handlePointerDown(event: PointerEvent) {
    const panel = panelRef ?? null;
    const handle = getPanelDragHandle(event.target, panel);
    if (!panel || !handle) return;

    dragTarget = handle;
    dragStart = getPanelDragStart(event.clientX, event.clientY, panel);
    didDrag = false;
    dragging = true;
    capturePanelPointer(handle, event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragging || !dragStart) return;

    if (!didDrag && !hasPanelDragMoved(dragStart, event.clientX, event.clientY)) return;
    didDrag = true;

    dragOffset = getPanelDragOffset(dragStart, event.clientX, event.clientY);
  }

  function handlePointerUp(event: PointerEvent) {
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
  }

  function handlePanelOpenChange(panelId: string, open: boolean) {
    panelOpenStates.set(panelId, open);
    const fallbackOpen = inline || defaultOpen;
    const nextRootOpen = panels.some((panel) => (
      panelOpenStates.get(panel.id) ?? fallbackOpen
    ));

    if (rootOpen === nextRootOpen) return;
    rootOpen = nextRootOpen;
    onOpenChange?.(nextRootOpen);
  }

  function handleRootOpenChange(open: boolean) {
    shellOpen = open;
    if (rootOpen === open) return;
    rootOpen = open;
    onOpenChange?.(open);
  }

</script>

{#snippet timelineToolbar()}
  {#if timelines.length > 0}
    <TimelineToggleButton />
  {/if}
{/snippet}

{#if productionEnabled && mounted && (panels.length > 0 || timelines.length > 0)}
  {#snippet content()}
    <ShortcutListener>
      <div class="dialkit-root" data-mode={mode} data-theme={theme}>
        <div
          bind:this={panelRef}
          class="dialkit-panel"
          role="region"
          aria-label="DialKit"
          data-mode={mode}
          data-position={inline ? undefined : (dragOffset ? undefined : activePosition)}
          data-origin-x={originX}
          data-origin-y={originY}
          data-multiple={panels.length > 1 ? 'true' : undefined}
          style={dragStyle}
          onpointerdown={!inline ? handlePointerDown : undefined}
          onpointermove={!inline ? handlePointerMove : undefined}
          onpointerup={!inline ? handlePointerUp : undefined}
          onpointercancel={!inline ? handlePointerUp : undefined}
        >
          {#if panels.length === 0}
            <div class="dialkit-panel-wrapper">
              <Folder
                title="DialKit"
                open={shellOpen}
                defaultOpen={inline || defaultOpen}
                isRoot={true}
                {inline}
                onOpenChange={handleRootOpenChange}
              >
                {#snippet toolbar()}
                  {@render timelineToolbar()}
                {/snippet}
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
                onOpenChange={handleRootOpenChange}
              >
                {#snippet toolbar()}
                  {@render timelineToolbar()}
                {/snippet}
                {#each panels as panel (panel.id)}
                  <Panel
                    {panel}
                    defaultOpen={true}
                    variant="section"
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
                toolbarExtra={timelineToolbar}
                onOpenChange={(open) => handlePanelOpenChange(panel.id, open)}
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
