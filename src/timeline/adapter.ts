import { DialStore } from '../store/DialStore';
import type { DialKitPersistOptions, DialValue } from '../store/DialStore';
import type { TimelineMeta, TimelineTransport } from '../store/TimelineStore';
import { loopSpan, TimelineStore } from '../store/TimelineStore';
import { startPointerGesture, type StopGesture } from '../pointer-gesture';
import { activateOnKey, type KeyEvent } from '../control-keyboard';
import { clamp } from '../transition-math';
import {
  clampClipMove,
  clampClipResizeEnd,
  clampClipResizeStart,
  clampStepResize,
  clampTrackDelay,
  computeClipState,
  isTimelineWheelZoom,
  zoomTimelineFromWheel,
  type DialTimelineValues,
  type ParsedTimeline,
  type TimelineClipStatic,
  type TimelineConfig,
  type TimelineView,
} from '../timeline-core';

export interface DialTimelineOptions {
  id?: string;
  persist?: DialKitPersistOptions;
  /** Start playing on mount. Defaults to true. */
  autoplay?: boolean;
  /**
   * Loop when the playhead reaches the end. `true` restarts the whole
   * timeline; `{ from }` wraps back to that time instead, so clips before it
   * play once and looping clips keep cycling forever. Defaults to false.
   */
  loop?: boolean | { from: number };
}

export type TimelineActions = {
  play: () => void;
  pause: () => void;
  replay: () => void;
  seek: (time: number) => void;
};

/** One resolution of the public loop option, shared by every adapter. */
export function resolveTimelineLoop(
  loop: DialTimelineOptions['loop']
): { enabled: boolean; start: number } {
  if (typeof loop === 'object' && loop !== null) {
    return {
      enabled: true,
      start: Number.isFinite(loop.from) ? Math.max(0, loop.from) : 0,
    };
  }
  return { enabled: Boolean(loop), start: 0 };
}

export function buildTimelineMeta(
  id: string,
  name: string,
  duration: number,
  parsed: ParsedTimeline,
  loop: DialTimelineOptions['loop']
): TimelineMeta {
  const resolvedLoop = resolveTimelineLoop(loop);
  return {
    id,
    name,
    duration,
    loop: resolvedLoop.enabled,
    loopStart: resolvedLoop.start,
    clips: parsed.clips,
  };
}

/**
 * Framework-neutral frame pass. Adapters only own lifecycle and reactivity;
 * the value shape and loop-cycle math stay identical everywhere.
 */
export function buildTimelineValues<T extends TimelineConfig>(
  staticClips: TimelineClipStatic[],
  transport: TimelineTransport,
  timelineDuration: number,
  loopStart: number,
  actions: TimelineActions
): DialTimelineValues<T> {
  // The transport learns about a new duration in an effect, one render after
  // the clips do. Keep this frame consistent with the clips it is built from.
  const time = Math.min(transport.time, timelineDuration);
  const result: Record<string, unknown> = {
    time,
    playing: transport.playing,
    duration: timelineDuration,
    ...actions,
  };

  const span = loopSpan(timelineDuration, loopStart);
  const cycleTime = (span > 0 ? transport.wraps * span : 0) + time;
  for (const clip of staticClips) {
    const state = computeClipState(clip, time, cycleTime);
    if (clip.group) {
      const bucket = (result[clip.group] ??= {}) as Record<string, unknown>;
      bucket[clip.childKey] = state;
    } else {
      result[clip.key] = state;
    }
  }

  return result as DialTimelineValues<T>;
}

/** Scrubbing, the same way from every surface that can start it. */
export function startScrubGesture(
  id: string,
  event: PointerEvent,
  handle: Element | null,
  seek: (clientX: number) => void,
  onEnd?: () => void
): StopGesture | null {
  let endScrub = () => {};
  const stop = startPointerGesture(event, handle, {
    move: (next) => seek(next.clientX),
    end: () => {
      endScrub();
      onEnd?.();
    },
  });
  if (!stop) return null;
  endScrub = TimelineStore.beginScrub(id);
  seek(event.clientX);
  return stop;
}

export type TimelineWheelOptions = TimelineView & {
  duration: number;
  maxZoom: number;
  /** The ruler, whose span maps pointer x to time. */
  lane: HTMLElement | null | undefined;
  /** The horizontal scroller, present while zoomed. */
  scroller: HTMLElement | null | undefined;
  setView(view: TimelineView): void;
};

/**
 * Wheel over the timeline body. Cmd/Ctrl + scroll zooms around the pointer;
 * horizontal (or Shift) scroll pans while zoomed. Needs a non-passive listener.
 */
export function wheelTimeline(event: WheelEvent, options: TimelineWheelOptions): void {
  if (isTimelineWheelZoom(event)) {
    // Keep the page and the track list still, and keep browser zoom and
    // modifier-scroll slider shortcuts from also handling this wheel.
    event.preventDefault();
    event.stopPropagation();
    const rect = options.lane?.getBoundingClientRect();
    if (!rect) return;
    const next = zoomTimelineFromWheel(event, rect, options);
    if (next) options.setView(next);
    return;
  }
  const { scroller } = options;
  if (!scroller || options.zoom <= 1) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.shiftKey
      ? event.deltaY
      : 0;
  if (delta === 0) return;
  event.preventDefault();
  scroller.scrollLeft += delta;
}

type TimelineKeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>;

const PLAYHEAD_KEY_STEP = 0.001;
const PLAYHEAD_SHIFT_KEY_STEP = 0.1;

/** Whether a time is on screen. A pixel of slack absorbs rounding, so a playhead at the very end of a panned view stays. */
export function isTimeInView(time: number, start: number, end: number, pxPerSecond: number): boolean {
  const slack = pxPerSecond > 0 ? 1 / pxPerSecond : 0;
  return time >= start - slack && time <= end + slack;
}

/**
 * Playhead keys: arrows step it, further with Shift; Home and End jump to the ends.
 * A key that would take it off screen moves the view first: out of view, it can't hold focus.
 */
export function seekFromKey(
  id: string,
  event: TimelineKeyEvent,
  view: { start: number; end: number; pxPerSecond: number; reveal: (time: number) => void }
): void {
  const { time, duration } = TimelineStore.getTransport(id);
  const step = event.shiftKey ? PLAYHEAD_SHIFT_KEY_STEP : PLAYHEAD_KEY_STEP;
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? duration
    : event.key === 'ArrowLeft' ? time - step
    : event.key === 'ArrowRight' ? time + step
    : undefined;
  if (next === undefined) return;
  event.preventDefault();
  const target = clamp(next, 0, duration);
  if (!isTimeInView(target, view.start, view.end, view.pxPerSecond)) view.reveal(target);
  TimelineStore.seek(id, target);
}

const MIN_DOCK_MAX_HEIGHT = 120;
const DOCK_KEY_STEP_PX = 20;

export function clampDockHeight(height: number): number {
  return clamp(height, MIN_DOCK_MAX_HEIGHT, Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24));
}

/** Resize handle keys step from the height the dock actually has, where a drag starts too. */
export function resizeDockFromKey(
  dock: Element | null | undefined,
  event: TimelineKeyEvent,
  setHeight: (height: number) => void
): void {
  if (!dock || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
  event.preventDefault();
  const step = event.key === 'ArrowUp' ? DOCK_KEY_STEP_PX : -DOCK_KEY_STEP_PX;
  setHeight(clampDockHeight(dock.getBoundingClientRect().height + step));
}

/** Enter and Space press a clip bar, once per press: focus moves between the bar and its editor, so a held key would flip it open and shut. */
export function pressClipFromKey(event: KeyEvent & Pick<KeyboardEvent, 'repeat'>, press: () => void): void {
  activateOnKey(event, () => {
    if (!event.repeat) press();
  });
}

const CLIP_DRAG_THRESHOLD_PX = 3;

export type ClipDragOptions = {
  timelineId: string;
  clipKey: string;
  at: number;
  duration: number;
  /** Set for sequence clips: their legs, as the bar shows them. */
  steps?: ReadonlyArray<{ key: string | null; duration: number }>;
  /** The bar's length is derived, so its edges don't resize it. */
  fixedDuration?: boolean;
  /** Track rows: the bar sits at baseAt + delay, and dragging edits the delay. */
  baseAt?: number;
  delayMode?: boolean;
  /** Read on every move, because zoom and the timeline length can change mid-drag. */
  getScale: () => { pxPerSecond: number; timelineDuration: number };
  onDragStart?: () => void;
  onClick?: (stepKey: string | undefined, anchor: HTMLElement) => void;
  onEnd?: () => void;
};

/**
 * Press on a clip bar: a click, or a drag that moves it, resizes an edge, or
 * retimes a leg, chosen by the handle under the pointer. Cancelling puts back
 * every value the drag changed.
 */
export function startClipDrag(event: PointerEvent, bar: HTMLElement, options: ClipDragOptions): StopGesture | null {
  const { timelineId: id, clipKey, at, duration, steps, fixedDuration, baseAt = 0, delayMode = false } = options;
  const target = event.target as HTMLElement;
  const boundary = target.dataset?.boundary;
  const edge = fixedDuration ? undefined : target.dataset?.edge as 'start' | 'end' | undefined;
  const mode = boundary !== undefined ? 'boundary' : edge ?? 'move';
  const boundaryIndex = Number(boundary ?? 0);
  const stepDurations = steps?.map((step) => step.duration);
  const clickEl = target.closest?.<HTMLElement>('[data-step]') ?? null;
  const pointerX = event.clientX;
  const originals: Record<string, DialValue> = {};
  let moved = false;

  const write = (updates: Record<string, number>) => {
    for (const path of Object.keys(updates)) {
      if (path in originals) continue;
      const original = DialStore.getValue(id, path);
      if (original !== undefined) originals[path] = original;
    }
    DialStore.updateValues(id, updates);
  };
  const startPath = delayMode ? `${clipKey}.delay` : `${clipKey}.at`;
  const startValue = (nextAt: number) => (delayMode ? Math.max(0, nextAt - baseAt) : nextAt);

  return startPointerGesture(event, bar, {
    move(next) {
      const { pxPerSecond, timelineDuration } = options.getScale();
      if (pxPerSecond <= 0) return;
      const dx = next.clientX - pointerX;
      if (!moved) {
        if (Math.abs(dx) <= CLIP_DRAG_THRESHOLD_PX) return;
        moved = true;
        options.onDragStart?.();
      }

      const dt = dx / pxPerSecond;
      if (mode === 'boundary' && steps && stepDurations) {
        // Trimming a leg ripples the later legs, so the bar grows or shrinks.
        const others = stepDurations.reduce((sum, value, index) => (index === boundaryIndex ? sum : sum + value), 0);
        write({
          [`${clipKey}.${steps[boundaryIndex].key ?? ''}.duration`]:
            clampStepResize(stepDurations[boundaryIndex] + dt, at, others, timelineDuration),
        });
      } else if (mode === 'move') {
        write(delayMode
          ? { [startPath]: clampTrackDelay(at + dt - baseAt, baseAt, duration, timelineDuration) }
          : { [startPath]: clampClipMove(at + dt, duration, timelineDuration) });
      } else if (mode === 'end') {
        write({ [`${clipKey}.duration`]: clampClipResizeEnd(duration + dt, at, timelineDuration) });
      } else if (steps && stepDurations) {
        // The start edge of a sequence trades time between position and first leg.
        const clamped = clampClipResizeStart(Math.max(at + dt, Math.max(baseAt, 0)), at, stepDurations[0]);
        write({
          [startPath]: startValue(clamped.at),
          [`${clipKey}.${steps[0].key ?? ''}.duration`]: clamped.duration,
        });
      } else {
        const clamped = clampClipResizeStart(Math.max(at + dt, Math.max(baseAt, 0)), at, duration);
        write({ [startPath]: startValue(clamped.at), [`${clipKey}.duration`]: clamped.duration });
      }
    },
    end(cancelled, last) {
      if (cancelled && moved) DialStore.updateValues(id, originals);
      options.onEnd?.();
      // Only a real release is a click: unmounting mid-press ends the gesture too.
      if (!cancelled && !moved && last) options.onClick?.(clickEl?.dataset?.step, clickEl ?? bar);
    },
  });
}
