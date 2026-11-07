<script lang="ts">
  import { untrack } from 'svelte';
  import { DialStore, formatLabel } from 'dialkit/store';
  import type { DialValue } from 'dialkit/store';
  import {
    TimelineStore,
    clamp,
    computeClipStaticFromValues,
    formatRulerSeconds,
    isTimeInView,
    normalizeTimelineValuesForCopy,
    seekFromKey,
    startScrubGesture,
  } from 'dialkit/timeline';
  import type {
    TimelineClipMeta,
    TimelineClipStatic,
    TimelineMeta,
    TimelineTrackStatic,
    TimelineTransport,
  } from 'dialkit/timeline';
  import {
    ICON_CHEVRON,
    ICON_CHECK,
    ICON_CLIPBOARD_PLAIN,
    ICON_PAUSE,
    ICON_PLAY,
    ICON_REPLAY,
  } from '../../../icons';
  import { buildCopyInstruction, copyText } from '../../../copy-instruction';
  import { clipAnchorRect, returnFocusToClip } from '../../../dropdown-position';
  import { startPointerGesture, type StopGesture } from '../../../pointer-gesture';
  import { findControl } from '../../../shortcut-utils';
  import PresetManager from '../PresetManager.svelte';
  import type { DialTheme } from '../DialRoot.svelte';
  import ClipPopover from './ClipPopover.svelte';
  import type { PopoverState } from './ClipPopover.svelte';
  import TimelineClip from './TimelineClip.svelte';

  const DRAG_THRESHOLD_PX = 3;
  const MAJOR_TICK_TARGET_PX = 140;
  const MILLISECOND_STEP = 0.001;
  const SECOND_TICK_STEPS = [
    0.001, 0.002, 0.005,
    0.01, 0.02, 0.05,
    0.1, 0.2, 0.5,
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
  ];
  const MIN_TIMELINE_MAX_ZOOM = 8;
  const PLAYHEAD_FLAG_WIDTH = 52;
  const PLAYHEAD_FLAG_EDGE_OVERHANG = 1;
  const ZOOM_DRAG_DISTANCE = 180;

  type GroupRow = {
    kind: 'group';
    key: string;
    group: string;
    collapsed: boolean;
  };

  type ClipRow = {
    kind: 'clip';
    key: string;
    clip: TimelineClipMeta;
    stat: TimelineClipStatic;
    tracksOpen: boolean;
    selected: boolean;
  };

  type TrackRow = {
    kind: 'track';
    key: string;
    parent: TimelineClipMeta;
    clip: TimelineClipMeta;
    stat: TimelineClipStatic;
    track: TimelineTrackStatic;
    selected: boolean;
  };

  let { meta, defaultOpen, theme, dockVisible } = $props<{
    meta: TimelineMeta;
    defaultOpen: boolean;
    theme: DialTheme;
    dockVisible: boolean;
  }>();

  const id = $derived(meta.id);
  let open = $state(untrack(() => defaultOpen));
  let copied = $state(false);
  let popover = $state.raw<PopoverState | null>(null);
  let collapsedGroups = $state(new Set<string>());
  let expandedTracks = $state(new Set<string>());
  let zoom = $state(1);
  let viewStart = $state(0);
  let values = $state.raw<Record<string, DialValue>>(DialStore.getValues(untrack(() => meta.id)));
  let transport = $state<TimelineTransport>(TimelineStore.getTransport(untrack(() => meta.id)));
  let laneArea = $state<HTMLDivElement>();
  let horizontalScrollElement = $state<HTMLDivElement>();
  let section = $state<HTMLDivElement>();
  let laneWidth = $state(0);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  // One gesture per surface, each stopped with stop(false) on unmount.
  function createScrub() {
    let stop: StopGesture | null = null;
    return {
      start(event: PointerEvent, handle: Element | null, seek: (clientX: number) => void) {
        if (stop) return false;
        stop = startScrubGesture(id, event, handle, seek, () => { stop = null; });
        return stop !== null;
      },
      stop() {
        stop?.(false);
      },
    };
  }
  const playheadScrub = createScrub();
  const overviewScrub = createScrub();
  const rulerScrub = createScrub();
  const trackScrub = createScrub();
  let stopZoom: StopGesture | null = null;

  const presets = $derived.by(() => {
    values;
    return DialStore.getPresets(id);
  });
  const activePresetId = $derived.by(() => {
    values;
    return DialStore.getActivePresetId(id);
  });
  const visibleDuration = $derived(meta.duration > 0 ? meta.duration / zoom : meta.duration);
  const safeViewStart = $derived(clampViewStart(viewStart, meta.duration, visibleDuration));
  const viewEnd = $derived(safeViewStart + visibleDuration);
  const pxPerSecond = $derived(visibleDuration > 0 && laneWidth > 0 ? laneWidth / visibleDuration : 0);
  const maxZoom = $derived(Math.max(
    MIN_TIMELINE_MAX_ZOOM,
    laneWidth > 0 && meta.duration > 0
      ? (MAJOR_TICK_TARGET_PX * meta.duration) / (MILLISECOND_STEP * 10 * laneWidth)
      : MIN_TIMELINE_MAX_ZOOM
  ));
  const playheadX = $derived(clamp((transport.time - safeViewStart) * pxPerSecond, 0, laneWidth));
  const playheadVisible = $derived(
    isTimeInView(transport.time, safeViewStart, viewEnd, pxPerSecond) && laneWidth > 0
  );
  const playheadFlagCenter = $derived(clamp(
    playheadX,
    PLAYHEAD_FLAG_WIDTH / 2 - PLAYHEAD_FLAG_EDGE_OVERHANG,
    laneWidth - PLAYHEAD_FLAG_WIDTH / 2 + PLAYHEAD_FLAG_EDGE_OVERHANG
  ));
  const playheadFlagOffset = $derived(playheadFlagCenter - playheadX);
  const playheadEdge = $derived(
    playheadFlagOffset > 0.5 ? 'start' : playheadFlagOffset < -0.5 ? 'end' : 'center'
  );
  const overviewViewportWidth = $derived(
    meta.duration > 0 ? ((viewEnd - safeViewStart) / meta.duration) * 100 : 100
  );
  const overviewPlayheadPercent = $derived(
    meta.duration > 0 ? (transport.time / meta.duration) * 100 : 0
  );

  const ticks = $derived.by(() => {
    const rawStep = pxPerSecond > 0 ? MAJOR_TICK_TARGET_PX / pxPerSecond : 1;
    const adaptive = SECOND_TICK_STEPS.find((step) => step >= rawStep)
      ?? SECOND_TICK_STEPS[SECOND_TICK_STEPS.length - 1];
    const majorStep = zoom < 1.5 && meta.duration >= 1 ? Math.max(1, adaptive) : adaptive;
    const fineStep = majorStep / 10;
    const major: number[] = [];
    const medium: number[] = [];
    const fine: number[] = [];
    const firstMajor = Math.ceil((safeViewStart - 1e-6) / majorStep) * majorStep;
    for (let time = firstMajor; time <= viewEnd + 1e-6; time += majorStep) {
      major.push(Number(time.toFixed(4)));
    }
    const firstFine = Math.ceil((safeViewStart - 1e-6) / fineStep);
    const lastFine = Math.floor((viewEnd + 1e-6) / fineStep);
    for (let index = firstFine; index <= lastFine; index++) {
      if (index % 10 === 0) continue;
      const tick = Number((index * fineStep).toFixed(6));
      if (index % 5 === 0) medium.push(tick);
      else fine.push(tick);
    }
    return { major, medium, fine, majorStep };
  });

  const rows = $derived.by(() => {
    const result: Array<GroupRow | ClipRow | TrackRow> = [];
    let lastGroup: string | undefined;
    for (const clip of meta.clips) {
      if (clip.group !== lastGroup) {
        lastGroup = clip.group;
        if (clip.group) {
          result.push({
            kind: 'group',
            key: `group:${clip.group}`,
            group: clip.group,
            collapsed: collapsedGroups.has(clip.group),
          });
        }
      }
      if (clip.group && collapsedGroups.has(clip.group)) continue;
      const tracksOpen = Boolean(clip.tracks?.length) && expandedTracks.has(clip.key);
      const stat = computeClipStaticFromValues(values, clip, meta.duration);
      result.push({
        kind: 'clip',
        key: clip.key,
        clip,
        stat,
        tracksOpen,
        selected: popover?.clip.key === clip.key,
      });
      if (!tracksOpen) continue;
      for (const trackRef of clip.tracks ?? []) {
        const track = stat.tracks.find((candidate) => candidate.prop === trackRef.prop);
        if (!track) continue;
        const key = `${clip.key}.${trackRef.prop}`;
        result.push({
          kind: 'track',
          key,
          parent: clip,
          clip: {
            key,
            label: `${clip.label} · ${formatLabel(trackRef.prop)}`,
            color: clip.color,
            loop: clip.loop,
            group: clip.group,
            stepKeys: trackRef.stepKeys,
          },
          stat,
          track,
          selected: popover?.clip.key === key,
        });
      }
    }
    return result;
  });

  $effect(() => {
    const current = id;
    values = DialStore.getValues(current);
    transport = TimelineStore.getTransport(current);
    const unsubscribeValues = DialStore.subscribe(current, () => {
      values = DialStore.getValues(current);
    });
    const unsubscribeTransport = TimelineStore.subscribe(current, () => {
      transport = TimelineStore.getTransport(current);
    });
    return () => {
      unsubscribeValues();
      unsubscribeTransport();
    };
  });

  $effect(() => () => {
    playheadScrub.stop();
    overviewScrub.stop();
    rulerScrub.stop();
    trackScrub.stop();
    stopZoom?.(false);
    clearTimeout(copyTimeout);
  });

  // The overview unmounts when the section opens.
  $effect(() => {
    if (open) overviewScrub.stop();
  });

  $effect(() => {
    if (!open || !laneArea) return;
    const measure = () => {
      if (laneArea) laneWidth = laneArea.getBoundingClientRect().width;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(laneArea);
    return () => observer.disconnect();
  });

  $effect(() => {
    const nextZoom = clamp(zoom, 1, maxZoom);
    if (nextZoom !== zoom) zoom = nextZoom;
    const nextStart = clampViewStart(viewStart, meta.duration, meta.duration / zoom);
    if (nextStart !== viewStart) viewStart = nextStart;
  });

  $effect(() => {
    if (!open || !horizontalScrollElement || pxPerSecond <= 0) return;
    const next = safeViewStart * pxPerSecond;
    if (Math.abs(horizontalScrollElement.scrollLeft - next) > 0.5) {
      horizontalScrollElement.scrollLeft = next;
    }
  });

  $effect(() => {
    if (!dockVisible) popover = null;
  });

  const popoverClipKey = $derived(popover?.clip.key);
  const popoverStepKey = $derived(popover?.stepKey);

  // The popover closes when its bar is gone: a removed clip, a collapsed row.
  $effect(() => {
    collapsedGroups;
    expandedTracks;
    meta.clips;
    open;
    values;
    if (popoverClipKey && !clipAnchorRect(section ?? null, popoverClipKey, popoverStepKey)) popover = null;
  });

  // It follows the bar through zoom, panning, and page scroll. Edits made inside
  // the popover are left out: a bar resizing must not move the slider under the pointer.
  $effect(() => {
    const clipKey = popoverClipKey;
    const stepKey = popoverStepKey;
    pxPerSecond;
    safeViewStart;
    if (!clipKey) return;
    const follow = () => untrack(() => {
      const anchor = clipAnchorRect(section ?? null, clipKey, stepKey);
      if (anchor && popover) popover = { ...popover, anchor };
    });
    follow();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  });

  function centerViewAt(time: number) {
    if (zoom <= 1 || meta.duration <= 0) return;
    const duration = meta.duration / zoom;
    viewStart = clampViewStart(time - duration / 2, meta.duration, duration);
  }

  function resetView() {
    zoom = 1;
    viewStart = 0;
  }

  function handleReplay() {
    viewStart = 0;
    TimelineStore.replay(id);
  }

  function handleHorizontalScroll(event: Event) {
    if (pxPerSecond <= 0) return;
    viewStart = clampViewStart(
      (event.currentTarget as HTMLDivElement).scrollLeft / pxPerSecond,
      meta.duration,
      visibleDuration
    );
  }

  function handleTimelineWheel(event: WheelEvent) {
    if (!horizontalScrollElement || zoom <= 1) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.shiftKey
        ? event.deltaY
        : 0;
    if (delta === 0) return;
    event.preventDefault();
    horizontalScrollElement.scrollLeft += delta;
  }

  // Dragging scrubs. Option/Alt-drag preserves detailed zooming, while
  // Shift-drag first restores the full 1x range.
  function handleRulerPointerDown(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLDivElement;
    const rect = handle.getBoundingClientRect();
    const contentWidth = rect.width;
    if (contentWidth <= 0) return;

    if (!event.altKey) {
      const shouldReset = event.shiftKey;
      const start = shouldReset ? 0 : safeViewStart;
      const span = shouldReset ? meta.duration : visibleDuration;
      const started = rulerScrub.start(event, handle, (clientX) => {
        TimelineStore.seek(id, clamp(start + ((clientX - rect.left) / contentWidth) * span, start, start + span));
      });
      if (started && shouldReset) resetView();
      return;
    }

    if (stopZoom) return;
    const pointerX = event.clientX;
    const startZoom = zoom;
    const startView = safeViewStart;
    const anchorRatio = clamp((pointerX - rect.left) / contentWidth, 0, 1);
    const anchorTime = safeViewStart + anchorRatio * visibleDuration;
    let moved = false;
    stopZoom = startPointerGesture(event, handle, {
      move(next) {
        if (meta.duration <= 0) return;
        const dx = next.clientX - pointerX;
        if (!moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        moved = true;
        const nextZoom = clamp(startZoom * Math.exp(dx / ZOOM_DRAG_DISTANCE), 1, maxZoom);
        const nextVisibleDuration = meta.duration / nextZoom;
        zoom = nextZoom;
        viewStart = clampViewStart(anchorTime - anchorRatio * nextVisibleDuration, meta.duration, nextVisibleDuration);
      },
      end(cancelled) {
        stopZoom = null;
        if (cancelled && moved) {
          zoom = startZoom;
          viewStart = startView;
        }
      },
    });
  }

  function handleTrackPointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.dialkit-timeline-label, .dialkit-timeline-scroll-row, button')) return;
    if (!event.shiftKey && target.closest('.dialkit-timeline-clip')) return;
    const rect = laneArea?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const shouldReset = event.shiftKey;
    const start = shouldReset ? 0 : safeViewStart;
    const span = shouldReset ? meta.duration : visibleDuration;
    const started = trackScrub.start(event, event.currentTarget as Element, (clientX) => {
      if (rect.width <= 0) return;
      TimelineStore.seek(id, clamp(start + ((clientX - rect.left) / rect.width) * span, start, start + span));
    });
    if (!started) return;
    if (shouldReset) resetView();
    popover = null;
  }

  function handleOverviewPointerDown(event: PointerEvent) {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const rect = handle.getBoundingClientRect();
    overviewScrub.start(event, handle, (clientX) => {
      if (rect.width <= 0 || meta.duration <= 0) return;
      const next = clamp(((clientX - rect.left) / rect.width) * meta.duration, 0, meta.duration);
      TimelineStore.seek(id, next);
      centerViewAt(next);
    });
  }

  function handlePlayheadPointerDown(event: PointerEvent) {
    const rect = laneArea?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const shouldReset = event.shiftKey;
    const start = shouldReset ? 0 : safeViewStart;
    const end = shouldReset ? meta.duration : viewEnd;
    // No capture: this flag unmounts whenever the playhead leaves the visible range.
    const started = playheadScrub.start(event, null, (clientX) => {
      if (rect.width <= 0) return;
      TimelineStore.seek(id, clamp(start + ((clientX - rect.left) / rect.width) * (end - start), start, end));
    });
    if (started && shouldReset) resetView();
  }

  async function handleCopy() {
    const normalized = normalizeTimelineValuesForCopy(DialStore.getValues(id), meta.clips);
    if (!(await copyText(buildCopyInstruction('createDialTimeline', meta.name, normalized)))) return;
    copied = true;
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => { copied = false; }, 1500);
  }

  function toggleSet(current: Set<string>, key: string): Set<string> {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function toggleTracks(key: string) {
    expandedTracks = toggleSet(expandedTracks, key);
  }

  function toggleGroup(key: string) {
    collapsedGroups = toggleSet(collapsedGroups, key);
  }

  function clipPopoverExclusions(clip: TimelineClipMeta): Set<string> {
    return new Set([...(clip.stepKeys ?? []), ...(clip.tracks?.map((track) => track.prop) ?? [])]);
  }

  function getClipControls(path: string, exclusions?: Set<string>) {
    const panel = DialStore.getPanel(id);
    const folder = panel ? findControl(panel.controls, path) : null;
    if (!folder?.children) return [];
    return folder.children.filter((control) => {
      const key = control.path.slice(path.length + 1);
      return key !== 'at' && key !== 'duration' && !exclusions?.has(key);
    });
  }

  // Escape and the close button hand focus back to the bar. Other closes leave it where the press put it.
  function dismissPopover() {
    if (popover) returnFocusToClip(section ?? null, popover.clip.key);
    popover = null;
  }

  function openClipPopover(clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) {
    const targetPath = stepKey ? `${clip.key}.${stepKey}` : clip.key;
    if (getClipControls(targetPath, stepKey ? undefined : clipPopoverExclusions(clip)).length === 0) return;
    popover = popover?.clip.key === clip.key && popover.stepKey === stepKey
      ? null
      : {
          clip,
          stepKey,
          anchor: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
        };
  }

  function handleBarClick(clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) {
    if (!stepKey && clip.tracks?.length) toggleTracks(clip.key);
    else openClipPopover(clip, rect, stepKey);
  }

  function clampViewStart(start: number, duration: number, shownDuration: number): number {
    return clamp(start, 0, Math.max(0, duration - shownDuration));
  }
</script>

<div bind:this={section} class="dialkit-timeline-section">
  <div class="dialkit-timeline-header" data-open={open || undefined}>
    <div class="dialkit-timeline-identity">
      <span class="dialkit-timeline-title">{meta.name}</span>
    </div>

    {#if !open}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="dialkit-timeline-overview"
        onpointerdown={handleOverviewPointerDown}
        title="Drag to scrub the full timeline"
      >
        <div
          class="dialkit-timeline-overview-viewport"
          data-zoomed={overviewViewportWidth < 99.999 || undefined}
          style:left={`${meta.duration > 0 ? (safeViewStart / meta.duration) * 100 : 0}%`}
          style:width={`${overviewViewportWidth}%`}
        ></div>
        <div class="dialkit-timeline-overview-progress" style:width={`${overviewPlayheadPercent}%`}></div>
        <div class="dialkit-timeline-overview-playhead" style:left={`${overviewPlayheadPercent}%`}></div>
      </div>
    {/if}

    <div class="dialkit-timeline-actions">
      <button
        class="dialkit-toolbar-add"
        onclick={() => transport.playing ? TimelineStore.pause(id) : TimelineStore.play(id)}
        title={transport.playing ? 'Pause' : 'Play'}
        aria-label={transport.playing ? 'Pause' : 'Play'}
      >
        <span style="position:relative;width:16px;height:16px;">
          {#if transport.playing}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="position:absolute;inset:0;width:16px;height:16px;color:var(--dial-text-label);">
              {#each ICON_PAUSE as path}<path d={path} fill="currentColor" />{/each}
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="position:absolute;inset:0;width:16px;height:16px;color:var(--dial-text-label);">
              <path d={ICON_PLAY} fill="currentColor" />
            </svg>
          {/if}
        </span>
      </button>
      <button class="dialkit-toolbar-add" onclick={handleReplay} title="Replay" aria-label="Replay">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:16px;height:16px;color:var(--dial-text-label);">
          {#each ICON_REPLAY as path}<path d={path} fill="currentColor" />{/each}
        </svg>
      </button>
      <PresetManager panelId={id} {presets} {activePresetId} />
      <button
        class="dialkit-toolbar-add dialkit-toolbar-primary"
        onclick={handleCopy}
        title="Copy parameters"
        aria-label={copied ? 'Copied parameters' : 'Copy parameters'}
      >
        <span style="position:relative;width:16px;height:16px;">
          {#if copied}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="position:absolute;inset:0;width:16px;height:16px;color:inherit;">
              <path d={ICON_CHECK} />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="position:absolute;inset:0;width:16px;height:16px;color:inherit;">
              <path d={ICON_CLIPBOARD_PLAIN.board} stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d={ICON_CLIPBOARD_PLAIN.body} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {/if}
        </span>
      </button>
      <button
        class="dialkit-timeline-chevron"
        data-open={open}
        aria-expanded={open}
        onclick={() => { open = !open; }}
        title={open ? 'Collapse timeline' : 'Expand timeline'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d={ICON_CHEVRON} />
        </svg>
      </button>
    </div>
  </div>

  {#if open}
    <div
      class="dialkit-timeline-body"
      onwheel={handleTimelineWheel}
      onpointerdown={handleTrackPointerDown}
      role="presentation"
    >
      <div class="dialkit-timeline-grid">
        <div class="dialkit-timeline-row dialkit-timeline-ruler-row">
          <div class="dialkit-timeline-label"></div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            bind:this={laneArea}
            class="dialkit-timeline-ruler"
            onpointerdown={handleRulerPointerDown}
            title="Drag to seek · Option-drag to zoom · Shift-drag to reset zoom"
          >
            {#each ticks.fine as time}
              <div class="dialkit-timeline-tick dialkit-timeline-tick-fine" style:left={`${(time - safeViewStart) * pxPerSecond}px`}></div>
            {/each}
            {#each ticks.medium as time}
              <div class="dialkit-timeline-tick dialkit-timeline-tick-medium" style:left={`${(time - safeViewStart) * pxPerSecond}px`}></div>
            {/each}
            {#each ticks.major as time}
              <div class="dialkit-timeline-tick" style:left={`${(time - safeViewStart) * pxPerSecond}px`}>
                <span class="dialkit-timeline-tick-label">{formatRulerSeconds(time, ticks.majorStep)}</span>
              </div>
            {/each}
          </div>
        </div>

        {#each rows as row (row.key)}
          {#if row.kind === 'group'}
            <div class="dialkit-timeline-row dialkit-timeline-group-row">
              <div class="dialkit-timeline-label">
                <button
                  class="dialkit-timeline-group-toggle"
                  data-open={!row.collapsed}
                  onclick={() => toggleGroup(row.group)}
                  title={row.collapsed ? 'Expand layer' : 'Collapse layer'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d={ICON_CHEVRON} />
                  </svg>
                </button>
                <span>{formatLabel(row.group)}</span>
              </div>
              <div class="dialkit-timeline-lane"></div>
            </div>
          {:else if row.kind === 'clip'}
            <div class="dialkit-timeline-row" data-grouped={row.clip.group ? '' : undefined}>
              <div class="dialkit-timeline-label">
                {#if row.clip.tracks?.length}
                  <button
                    class="dialkit-timeline-group-toggle"
                    data-open={row.tracksOpen}
                    onclick={(event) => {
                      event.stopPropagation();
                      toggleTracks(row.clip.key);
                    }}
                    title={row.tracksOpen ? 'Collapse properties' : 'Expand properties'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d={ICON_CHEVRON} />
                    </svg>
                  </button>
                {/if}
                {row.clip.label}
              </div>
              <div class="dialkit-timeline-lane">
                <TimelineClip
                  timelineId={id}
                  clip={row.clip}
                  at={row.stat.at}
                  duration={row.stat.duration}
                  loop={row.stat.loop}
                  steps={row.clip.stepKeys?.length ? row.stat.tracks[0]?.steps : undefined}
                  fixedDuration={row.clip.tracks?.length ? true : row.stat.isPhysics}
                  composite={Boolean(row.clip.tracks?.length)}
                  {pxPerSecond}
                  viewStart={safeViewStart}
                  timelineDuration={meta.duration}
                  selected={row.selected}
                  selectedStepKey={row.selected ? popover?.stepKey : undefined}
                  onClick={handleBarClick}
                  onDrag={() => { popover = null; }}
                />
              </div>
            </div>
          {:else}
            <div class="dialkit-timeline-row dialkit-timeline-track-row" data-grouped={row.parent.group ? '' : undefined}>
              <div class="dialkit-timeline-label">{formatLabel(row.track.prop ?? '')}</div>
              <div class="dialkit-timeline-lane">
                <TimelineClip
                  timelineId={id}
                  clip={row.clip}
                  at={row.stat.at + row.track.delay}
                  duration={row.track.duration}
                  loop={row.stat.loop}
                  steps={row.clip.stepKeys?.length ? row.track.steps : undefined}
                  fixedDuration={!row.clip.stepKeys?.length && row.track.steps[0]?.isPhysics === true}
                  baseAt={row.stat.at}
                  delayMode={true}
                  {pxPerSecond}
                  viewStart={safeViewStart}
                  timelineDuration={meta.duration}
                  selected={row.selected}
                  selectedStepKey={row.selected ? popover?.stepKey : undefined}
                  onClick={openClipPopover}
                  onDrag={() => { popover = null; }}
                />
              </div>
            </div>
          {/if}
        {/each}

        {#if pxPerSecond > 0 && playheadVisible}
          <div
            class="dialkit-timeline-playhead-control"
            data-edge={playheadEdge}
            style={`left:calc(var(--dial-timeline-label-w) + ${playheadX}px);--dial-timeline-playhead-flag-offset:${playheadFlagOffset}px;`}
            onpointerdown={handlePlayheadPointerDown}
            onkeydown={(event) => seekFromKey(id, event, { start: safeViewStart, end: viewEnd, pxPerSecond, reveal: centerViewAt })}
            tabindex="0"
            role="slider"
            aria-label="Timeline current time"
            aria-valuemin={0}
            aria-valuemax={meta.duration}
            aria-valuenow={transport.time}
            title="Drag to scrub the timeline"
          >
            <div class="dialkit-timeline-playhead-stem"></div>
            <div class="dialkit-timeline-playhead-anchor">
              <div class="dialkit-timeline-playhead-flag">{transport.time.toFixed(2)}</div>
            </div>
          </div>
        {/if}
      </div>
      {#if zoom > 1}
        <div class="dialkit-timeline-scroll-row">
          <div class="dialkit-timeline-label"></div>
          <div
            bind:this={horizontalScrollElement}
            class="dialkit-timeline-horizontal-scroll"
            onscroll={handleHorizontalScroll}
            aria-label="Timeline horizontal scroll"
          >
            <div style:width={`${laneWidth * zoom}px`}></div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if popover}
    <ClipPopover panelId={id} {popover} {values} {theme} onClose={() => { popover = null; }} onDismiss={dismissPopover} />
  {/if}
</div>
