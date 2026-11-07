<script lang="ts">
  import { untrack } from 'svelte';
  import { TimelineStore, TimelineUiStore, clampDockHeight, resizeDockFromKey } from 'dialkit/timeline';
  import type { TimelineMeta } from 'dialkit/timeline';
  import { startPointerGesture, type StopGesture } from '../../../pointer-gesture';
  import Portal from '../../Portal.svelte';
  import type { DialTheme } from '../DialRoot.svelte';
  import TimelineSection from './TimelineSection.svelte';

  const DEFAULT_DOCK_MAX_HEIGHT = 400;

  let {
    theme = 'system',
    defaultVisible = true,
    visible,
    onVisibilityChange,
    defaultOpen = true,
  } = $props<{
    theme?: DialTheme;
    defaultVisible?: boolean;
    visible?: boolean;
    onVisibilityChange?: (visible: boolean) => void;
    defaultOpen?: boolean;
  }>();

  const controllerId = Symbol('dialkit-timeline-visibility');
  let mounted = $state(false);
  let timelines = $state.raw<TimelineMeta[]>([]);
  let dockVisible = $state(TimelineUiStore.getVisible());
  let dockMaxHeight = $state(DEFAULT_DOCK_MAX_HEIGHT);
  let dockElement = $state<HTMLDivElement>();
  let stopResize: StopGesture | null = null;

  $effect(() => {
    mounted = true;
    timelines = TimelineStore.getTimelines();
    const unsubscribeVisibility = TimelineUiStore.subscribe(() => {
      dockVisible = TimelineUiStore.getVisible();
    });
    // Registered once: prop changes go through updateController below.
    const unregisterController = untrack(() => TimelineUiStore.registerController(controllerId, {
      visible,
      defaultVisible,
      onVisibilityChange,
    }));
    dockVisible = TimelineUiStore.getVisible();
    const unsubscribeTimelines = TimelineStore.subscribeGlobal(() => {
      timelines = TimelineStore.getTimelines();
    });
    return () => {
      unregisterController();
      unsubscribeTimelines();
      unsubscribeVisibility();
    };
  });

  $effect(() => {
    TimelineUiStore.updateController(controllerId, {
      visible,
      defaultVisible,
      onVisibilityChange,
    });
  });

  $effect(() => () => stopResize?.(false));

  function handleResizePointerDown(event: PointerEvent) {
    if (!dockElement || stopResize) return;
    event.preventDefault();
    event.stopPropagation();

    const pointerY = event.clientY;
    const startHeight = dockElement.getBoundingClientRect().height;
    stopResize = startPointerGesture(event, event.currentTarget as Element, {
      move(next) {
        dockMaxHeight = clampDockHeight(startHeight + pointerY - next.clientY);
      },
      end() { stopResize = null; },
    });
  }
</script>

{#if mounted && timelines.length > 0}
  <Portal target="body">
    <div class="dialkit-root dialkit-timeline" data-theme={theme} hidden={!dockVisible}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="dialkit-timeline-resize-handle"
        onpointerdown={handleResizePointerDown}
        onkeydown={(event) => resizeDockFromKey(dockElement, event, (height) => { dockMaxHeight = height; })}
        tabindex="0"
        role="separator"
        aria-label="Resize timeline height"
        aria-orientation="horizontal"
        title="Drag to resize timeline"
      ></div>
      <div
        bind:this={dockElement}
        class="dialkit-timeline-dock"
        style:max-height={`min(${dockMaxHeight}px, calc(100vh - 24px))`}
      >
        {#each timelines as timeline (timeline.id)}
          <TimelineSection meta={timeline} {defaultOpen} {theme} {dockVisible} />
        {/each}
      </div>
    </div>
  </Portal>
{/if}
