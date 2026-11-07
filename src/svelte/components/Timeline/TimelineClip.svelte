<script lang="ts">
  import { formatSeconds, pressClipFromKey, startClipDrag } from 'dialkit/timeline';
  import type { TimelineClipLoop, TimelineClipMeta, TimelineStepStatic } from 'dialkit/timeline';
  import type { StopGesture } from '../../../pointer-gesture';

  let {
    timelineId,
    clip,
    at,
    duration,
    loop,
    steps,
    fixedDuration,
    composite = false,
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

  let stopDrag: StopGesture | null = null;
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

  $effect(() => () => stopDrag?.(false));

  function handlePointerDown(event: PointerEvent) {
    if (event.shiftKey) return;
    event.stopPropagation();
    if (stopDrag) return;
    stopDrag = startClipDrag(event, event.currentTarget as HTMLElement, {
      timelineId,
      clipKey: clip.key,
      at,
      duration,
      steps,
      fixedDuration,
      baseAt,
      delayMode,
      getScale: () => ({ pxPerSecond, timelineDuration }),
      onDragStart: () => {
        dragging = true;
        onDrag();
      },
      onClick: (stepKey, anchor) => onClick(clip, anchor.getBoundingClientRect(), stepKey),
      onEnd: () => {
        stopDrag = null;
        dragging = false;
      },
    });
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

<div
  class="dialkit-timeline-clip"
  data-clip-key={clip.key}
  data-steps={isSteps || undefined}
  data-composite={composite || undefined}
  data-selected={selected || undefined}
  data-dragging={dragging || undefined}
  style:left={`${(at - viewStart) * pxPerSecond}px`}
  style:width={`${width}px`}
  style:background={composite ? `${clip.color}80` : clip.color}
  onpointerdown={handlePointerDown}
  onkeydown={(event) => pressClipFromKey(event, () => onClick(clip, event.currentTarget.getBoundingClientRect()))}
  tabindex="0"
  role="button"
  aria-label={`Edit ${clip.label}`}
  title={barTitle}
>
  {#if composite}
    {#if width > 56}<span class="dialkit-timeline-clip-duration">{durationText}</span>{/if}
  {:else if isSteps}
    {#each steps ?? [] as step, index (step.key ?? index)}
      <div
        class="dialkit-timeline-clip-segment"
        data-step={step.key ?? undefined}
        data-selected={selectedStepKey === step.key || undefined}
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
