<script lang="ts">
  import {
    TimelineStore,
    TimelineUiStore,
    dockResizeKeyHeight,
    isDevDefault,
  } from 'dialkit/timeline';
  import type { TimelineMeta } from 'dialkit/timeline';
  import Portal from '../../Portal.svelte';
  import type { DialTheme } from '../DialRoot.svelte';
  import TimelineSection from './TimelineSection.svelte';

  const DEFAULT_DOCK_MAX_HEIGHT = 400;
  const MIN_DOCK_MAX_HEIGHT = 120;

  let {
    theme = 'system',
    defaultVisible = true,
    visible,
    onVisibilityChange,
    defaultOpen = true,
    productionEnabled = isDevDefault,
  } = $props<{
    theme?: DialTheme;
    defaultVisible?: boolean;
    visible?: boolean;
    onVisibilityChange?: (visible: boolean) => void;
    defaultOpen?: boolean;
    productionEnabled?: boolean;
  }>();

  const controllerId = Symbol('dialkit-timeline-visibility');
  let mounted = $state(false);
  let timelines = $state<TimelineMeta[]>([]);
  let dockVisible = $state(TimelineUiStore.getVisible());
  let dockMaxHeight = $state(DEFAULT_DOCK_MAX_HEIGHT);
  let dockElement = $state<HTMLDivElement>();
  let resizeCleanup: (() => void) | null = null;

  $effect(() => {
    if (typeof window === 'undefined') return;
    mounted = true;
    timelines = TimelineStore.getTimelines();
    dockVisible = TimelineUiStore.getVisible();
    const unsubscribeVisibility = TimelineUiStore.subscribe(() => {
      dockVisible = TimelineUiStore.getVisible();
    });
    const unregisterController = TimelineUiStore.registerController(controllerId, {
      visible,
      defaultVisible,
      onVisibilityChange,
    });
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

  $effect(() => () => resizeCleanup?.());

  function handleResizePointerDown(event: PointerEvent) {
    if (!dockElement) return;
    event.preventDefault();
    event.stopPropagation();
    resizeCleanup?.();

    const pointerY = event.clientY;
    const startHeight = dockElement.getBoundingClientRect().height;
    const move = (next: PointerEvent) => {
      next.preventDefault();
      const viewportMax = Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24);
      dockMaxHeight = Math.min(
        viewportMax,
        Math.max(MIN_DOCK_MAX_HEIGHT, startHeight + pointerY - next.clientY)
      );
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      resizeCleanup = null;
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    resizeCleanup = finish;
  }

  function resizeMax() {
    return Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24);
  }

  function handleResizeKeyDown(event: KeyboardEvent) {
    const next = dockResizeKeyHeight(event.key, dockMaxHeight, MIN_DOCK_MAX_HEIGHT, resizeMax(), event.shiftKey);
    if (next === undefined) return;
    event.preventDefault();
    dockMaxHeight = next;
  }
</script>

{#if productionEnabled && mounted && timelines.length > 0}
  <Portal target="body">
    <div class="dialkit-root dialkit-timeline" data-theme={theme} hidden={!dockVisible}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a focusable separator is a resize widget) -->
      <div
        class="dialkit-timeline-resize-handle"
        onpointerdown={handleResizePointerDown}
        onkeydown={handleResizeKeyDown}
        role="separator"
        tabindex="0"
        aria-label="Resize timeline height"
        aria-orientation="horizontal"
        aria-valuemin={MIN_DOCK_MAX_HEIGHT}
        aria-valuemax={resizeMax()}
        aria-valuenow={Math.round(Math.min(dockMaxHeight, resizeMax()))}
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
