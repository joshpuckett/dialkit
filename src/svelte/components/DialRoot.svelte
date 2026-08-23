<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { PanelConfig } from 'dialkit/store';
  import { TimelineStore } from 'dialkit/timeline';
  import type { TimelineMeta } from 'dialkit/timeline';
  import { getSharedMidiController } from 'dialkit/midi';
  import type { MidiController, MidiMappingOwner } from 'dialkit/midi';
  import { themeCSS } from '../theme-css';
  import Portal from '../Portal.svelte';
  import Folder from './Folder.svelte';
  import Panel from './Panel.svelte';
  import TimelineToggleButton from './Timeline/TimelineToggleButton.svelte';
  import MidiMenu from './MidiMenu.svelte';
  import ShortcutListener from './ShortcutListener.svelte';
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

  const nodeEnv = (globalThis as typeof globalThis & { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  const viteMode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
  const isDevDefault = nodeEnv
    ? nodeEnv !== 'production'
    : viteMode
      ? viteMode !== 'production'
      : true;

  let { position = 'top-right', defaultOpen = true, mode = 'popover', theme = 'system' as DialTheme, productionEnabled = isDevDefault, onOpenChange, midi } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
    productionEnabled?: boolean;
    onOpenChange?: (open: boolean) => void;
    midi?: boolean | MidiController;
  }>();

  const inline = $derived(mode === 'inline');
  const controller = $derived<MidiController | undefined>(
    midi === true ? getSharedMidiController() : (midi || undefined)
  );
  const midiOwner: MidiMappingOwner = {};

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

  const dragStyle = $derived(
    dragOffset
      ? `top:${dragOffset.y}px;left:${dragOffset.x}px;right:auto;bottom:auto;`
      : undefined
  );
  const originX = $derived(inline ? undefined : getPanelOriginX(activePosition, dragOffset));

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
    const unsubscribeTimelines = TimelineStore.subscribeGlobal(() => {
      timelines = TimelineStore.getTimelines();
    });

    return () => {
      unsubscribePanels();
      unsubscribeTimelines();
    };
  });

  $effect(() => {
    const activeController = controller;
    if (!activeController) return;
    return () => activeController.stopMapping(midiOwner);
  });

  $effect(() => {
    const fallbackOpen = inline || defaultOpen;
    const nextStates = new Map<string, boolean>();
    for (const panel of panels) {
      nextStates.set(panel.id, panelOpenStates.get(panel.id) ?? fallbackOpen);
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
          const bubbleCenterX = dragOffset.x + 21;
          activePosition = bubbleCenterX < window.innerWidth / 2 ? 'top-left' : 'top-right';
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

  function handlePointerDown(event: PointerEvent) {
    const panel = panelRef ?? null;
    const handle = getPanelDragHandle(event.target, panel);
    if (!panel || !handle) return;

    dragTarget = handle;
    dragStart = getPanelDragStart(event.clientX, event.clientY, panel);
    didDrag = false;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
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
      handle.releasePointerCapture(event.pointerId);
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

{#snippet midiHeaderAction()}
  {#if controller}
    <MidiMenu {controller} ownerToken={midiOwner} />
  {/if}
{/snippet}

{#if productionEnabled && mounted && (panels.length > 0 || timelines.length > 0)}
  {#snippet content()}
    <ShortcutListener>
      <div class="dialkit-root" data-mode={mode} data-theme={theme}>
        <div
          bind:this={panelRef}
          class="dialkit-panel"
          data-mode={mode}
          data-position={inline ? undefined : (dragOffset ? undefined : activePosition)}
          data-origin-x={originX}
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
                defaultOpen={inline || defaultOpen}
                isRoot={true}
                {inline}
                onOpenChange={handleRootOpenChange}
                panelHeightOffset={2}
              >
                {#snippet headerActions()}
                  {@render midiHeaderAction()}
                {/snippet}
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
                defaultOpen={inline || defaultOpen}
                isRoot={true}
                {inline}
                onOpenChange={handleRootOpenChange}
                panelHeightOffset={2}
              >
                {#snippet headerActions()}
                  {@render midiHeaderAction()}
                {/snippet}
                {#snippet toolbar()}
                  {@render timelineToolbar()}
                {/snippet}
                {#each panels as panel (panel.id)}
                  <Panel
                    {panel}
                    defaultOpen={true}
                    variant="section"
                    midi={controller}
                    midiOwner={midiOwner}
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
                headerActions={midiHeaderAction}
                onOpenChange={(open) => handlePanelOpenChange(panel.id, open)}
                midi={controller}
                midiOwner={midiOwner}
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
