<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import {
    clampClipMove,
    clampClipResizeEnd,
    clampClipResizeStart,
    clampStepResize,
    clampTrackDelay,
    clipAccessibleName,
    formatSeconds,
    formatStepLabel,
    handleTimelineClipKey,
  } from 'dialkit/timeline';
  import type { TimelineClipLoop, TimelineClipMeta, TimelineStepStatic } from 'dialkit/timeline';

  const DRAG_THRESHOLD_PX = 3;

  type DragState = {
    mode: 'move' | 'start' | 'end' | 'boundary';
    boundaryIndex?: number;
    pointerX: number;
    at: number;
    duration: number;
    stepDurations?: number[];
    clickEl: HTMLElement | null;
    moved: boolean;
  };

  let {
    timelineId,
    clip,
    at,
    duration,
    loop,
    steps,
    fixedDuration,
    composite = false,
    expanded = false,
    baseAt = 0,
    delayMode = false,
    pxPerSecond,
    viewStart,
    timelineDuration,
    selected,
    selectedStepKey,
    onClick,
    onDrag,
  } = $props<{
    timelineId: string;
    clip: TimelineClipMeta;
    at: number;
    duration: number;
    loop: TimelineClipLoop;
    steps?: TimelineStepStatic[];
    fixedDuration: boolean;
    composite?: boolean;
    expanded?: boolean;
    baseAt?: number;
    delayMode?: boolean;
    pxPerSecond: number;
    viewStart: number;
    timelineDuration: number;
    selected: boolean;
    selectedStepKey?: string;
    onClick: (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => void;
    onDrag: () => void;
  }>();

  let drag: DragState | null = null;
  let dragging = $state(false);
  const isSteps = $derived(Boolean(steps?.length));
  const width = $derived(Math.max(duration * pxPerSecond, 14));
  const resizable = $derived(duration > 0 && !fixedDuration && !composite);
  const durationText = $derived(`${fixedDuration && !composite ? '~' : ''}${formatSeconds(duration)}`);
  const looping = $derived(loop === 'repeat' && duration > 0);
  const ghostCycles = $derived.by(() => {
    const result: Array<{ start: number; duration: number; index: number }> = [];
    if (!looping) return result;
    const first = Math.max(1, Math.floor((viewStart - at) / duration));
    for (let offset = 0; offset < 256; offset++) {
      const index = first + offset;
      const start = at + duration * index;
      if (start >= timelineDuration - 1e-6) break;
      result.push({ start, duration: Math.min(duration, timelineDuration - start), index });
    }
    return result;
  });
  const boundaries = $derived.by(() => {
    let total = 0;
    return steps?.map((step: TimelineStepStatic) => (total += step.duration)) ?? [];
  });
  const barTitle = $derived(composite
    ? `${clip.label} — composite of its property tracks${looping ? ' · repeats through timeline' : ''} · click to expand`
    : `${clip.label} — ${formatSeconds(at)} for ${durationText}${fixedDuration ? ' (duration set by spring physics)' : ''}${looping ? ' · repeats through timeline' : ''}${delayMode ? ' · drag to phase-shift' : ''}`);

  function handlePointerDown(event: PointerEvent) {
    if (event.shiftKey) return;
    event.stopPropagation();
    const target = event.target as HTMLElement;
    let mode: DragState['mode'] = 'move';
    let boundaryIndex: number | undefined;
    if (target.dataset.boundary !== undefined) {
      mode = 'boundary';
      boundaryIndex = Number(target.dataset.boundary);
    } else if (!fixedDuration) {
      const edge = target.dataset.edge as 'start' | 'end' | undefined;
      if (edge) mode = edge;
    }
    drag = {
      mode,
      boundaryIndex,
      pointerX: event.clientX,
      at,
      duration,
      stepDurations: steps?.map((step: TimelineStepStatic) => step.duration),
      clickEl: target.closest?.('[data-step]') as HTMLElement | null,
      moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!drag || pxPerSecond <= 0) return;
    const dx = event.clientX - drag.pointerX;
    if (!drag.moved) {
      if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      dragging = true;
      onDrag();
    }
    const dt = dx / pxPerSecond;
    if (drag.mode === 'boundary' && steps && drag.stepDurations) {
      const index = drag.boundaryIndex ?? 0;
      const others = drag.stepDurations.reduce((sum, value, stepIndex) => stepIndex === index ? sum : sum + value, 0);
      DialStore.updateValue(
        timelineId,
        `${clip.key}.${steps[index].key ?? ''}.duration`,
        clampStepResize(drag.stepDurations[index] + dt, drag.at, others, timelineDuration)
      );
    } else if (drag.mode === 'move') {
      if (delayMode) {
        DialStore.updateValue(timelineId, `${clip.key}.delay`, clampTrackDelay(drag.at + dt - baseAt, baseAt, drag.duration, timelineDuration));
      } else {
        DialStore.updateValue(timelineId, `${clip.key}.at`, clampClipMove(drag.at + dt, drag.duration, timelineDuration));
      }
    } else if (drag.mode === 'end') {
      DialStore.updateValue(timelineId, `${clip.key}.duration`, clampClipResizeEnd(drag.duration + dt, drag.at, timelineDuration));
    } else if (steps && drag.stepDurations) {
      const next = clampClipResizeStart(Math.max(drag.at + dt, Math.max(baseAt, 0)), drag.at, drag.stepDurations[0]);
      DialStore.updateValues(timelineId, {
        [delayMode ? `${clip.key}.delay` : `${clip.key}.at`]: delayMode ? Math.max(0, next.at - baseAt) : next.at,
        [`${clip.key}.${steps[0].key ?? ''}.duration`]: next.duration,
      });
    } else {
      const next = clampClipResizeStart(Math.max(drag.at + dt, Math.max(baseAt, 0)), drag.at, drag.duration);
      DialStore.updateValues(timelineId, {
        [delayMode ? `${clip.key}.delay` : `${clip.key}.at`]: delayMode ? Math.max(0, next.at - baseAt) : next.at,
        [`${clip.key}.duration`]: next.duration,
      });
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    handleTimelineClipKey(
      event,
      timelineId,
      { key: clip.key, label: clip.label, at, duration, timelineDuration, baseAt, delayMode, fixedDuration: fixedDuration || composite, steps },
      (element, stepKey) => onClick(clip, element.getBoundingClientRect(), stepKey)
    );
  }

  function finish(event?: PointerEvent) {
    const previous = drag;
    drag = null;
    dragging = false;
    if (previous && !previous.moved && event) {
      const anchor = previous.clickEl ?? event.currentTarget as HTMLElement;
      onClick(clip, anchor.getBoundingClientRect(), previous.clickEl?.dataset.step);
    }
  }
</script>

{#each ghostCycles as cycle (cycle.index)}
  <div
    class="dialkit-timeline-clip-ghost"
    data-steps={isSteps || undefined}
    aria-hidden="true"
    style:left={`${(cycle.start - viewStart) * pxPerSecond + 1}px`}
    style:width={`${Math.max(1, cycle.duration * pxPerSecond - 2)}px`}
    style:background={clip.color}
  >
    {#each steps ?? [] as step, index (step.key ?? index)}
      <span class="dialkit-timeline-clip-ghost-segment" style:width={`${step.duration * pxPerSecond}px`}></span>
    {/each}
  </div>
{/each}

<!-- svelte-ignore a11y_no_noninteractive_tabindex (a button unless it is a sequence, whose legs take focus instead) -->
<div
  class="dialkit-timeline-clip"
  data-clip={clip.key}
  data-steps={isSteps || undefined}
  data-composite={composite || undefined}
  data-selected={selected || undefined}
  data-dragging={dragging || undefined}
  style:left={`${(at - viewStart) * pxPerSecond}px`}
  style:width={`${width}px`}
  style:background={composite ? `${clip.color}80` : clip.color}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={finish}
  onpointercancel={() => finish()}
  onlostpointercapture={() => finish()}
  onkeydown={handleKeyDown}
  title={barTitle}
  role={isSteps ? undefined : 'button'}
  tabindex={isSteps ? undefined : 0}
  aria-label={isSteps ? undefined : clipAccessibleName(clip.label, at, duration)}
  aria-expanded={composite ? expanded : undefined}
>
  {#if composite}
    {#if width > 56}<span class="dialkit-timeline-clip-duration">{durationText}</span>{/if}
  {:else if isSteps}
    {#each steps ?? [] as step, index (step.key ?? index)}
      <div
        class="dialkit-timeline-clip-segment"
        data-step={step.key ?? undefined}
        data-selected={selectedStepKey === step.key || undefined}
        role="button"
        tabindex="0"
        aria-label={clipAccessibleName(`${clip.label} · ${formatStepLabel(step.key ?? '')}`, at + step.offset, step.duration)}
        style:width={`${step.duration * pxPerSecond}px`}
      >
        {#if step.duration * pxPerSecond > 52}
          <span class="dialkit-timeline-clip-duration">{formatSeconds(step.duration)}</span>
        {/if}
      </div>
    {/each}
    {#each steps ?? [] as step, index (step.key ?? index)}
      {#if !step.isPhysics}
        <div class="dialkit-timeline-clip-handle" data-boundary={index} style:left={`${boundaries[index] * pxPerSecond - 4}px`}></div>
      {/if}
    {/each}
    {#if !steps?.[0]?.isPhysics}<div class="dialkit-timeline-clip-handle" data-edge="start"></div>{/if}
  {:else}
    {#if resizable}<div class="dialkit-timeline-clip-handle" data-edge="start"></div>{/if}
    {#if width > 56}<span class="dialkit-timeline-clip-duration">{durationText}</span>{/if}
    {#if resizable}<div class="dialkit-timeline-clip-handle" data-edge="end"></div>{/if}
  {/if}
</div>

{#if looping}
  <span class="dialkit-timeline-loop-infinity" aria-hidden="true" title="Repeats indefinitely">∞</span>
{/if}
