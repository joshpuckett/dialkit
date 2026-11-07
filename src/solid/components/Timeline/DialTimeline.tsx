import {
  For,
  Index,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { DialStore, formatLabel } from '../../../store/DialStore';
import type { ControlMeta, DialValue } from '../../../store/DialStore';
import { TimelineStore } from '../../../store/TimelineStore';
import type { TimelineClipMeta, TimelineClipTrackMeta, TimelineMeta } from '../../../store/TimelineStore';
import { TimelineUiStore } from '../../../store/TimelineUiStore';
import {
  TIMELINE_MIN_CLIP_DURATION,
  computeClipStaticFromValues,
  formatRulerSeconds,
  formatSeconds,
  formatStepLabel,
  normalizeTimelineValuesForCopy,
  timelinePopoverDisplayValues,
} from '../../../timeline-core';
import type { TimelineClipLoop, TimelineStepStatic } from '../../../timeline-core';
import { clamp } from '../../../transition-math';
import { buildCopyInstruction, copyText } from '../../../copy-instruction';
import { clipAnchorRect, isFloatingControlTarget, returnFocusToClip, type AnchorRect } from '../../../dropdown-position';
import { startPointerGesture, type StopGesture } from '../../../pointer-gesture';
import { clampDockHeight, isTimeInView, pressClipFromKey, resizeDockFromKey, seekFromKey, startClipDrag, startScrubGesture } from '../../../timeline/adapter';
import { isDevDefault } from '../../../env';
import {
  ICON_CHEVRON,
  ICON_CHECK,
  ICON_CLIPBOARD_PLAIN,
  ICON_PAUSE,
  ICON_PLAY,
  ICON_REPLAY,
} from '../../../icons';
import { findControl } from '../../../shortcut-utils';
import { fromStore } from '../../primitives';
import { ControlRenderer } from '../ControlRenderer';
import { PresetManager } from '../PresetManager';
import type { DialTheme } from '../DialRoot';

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
const POPOVER_WIDTH = 280;
const ZOOM_DRAG_DISTANCE = 180;
const DEFAULT_DOCK_MAX_HEIGHT = 400;

function createScrubGesture(id: () => string) {
  let stop: StopGesture | null = null;
  onCleanup(() => stop?.(false));
  return (event: PointerEvent, handle: Element | null, seek: (clientX: number) => void) => {
    if (stop) return false;
    stop = startScrubGesture(id(), event, handle, seek, () => { stop = null; });
    return stop !== null;
  };
}

export interface DialTimelineProps {
  theme?: DialTheme;
  defaultVisible?: boolean;
  visible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  defaultOpen?: boolean;
  productionEnabled?: boolean;
}

export function DialTimeline(props: DialTimelineProps) {
  const enabled = () => (props.productionEnabled ?? isDevDefault) !== false;
  return (
    <Show when={enabled()}>
      <DialTimelineDock {...props} />
    </Show>
  );
}

function DialTimelineDock(props: DialTimelineProps) {
  const timelines = fromStore(
    () => TimelineStore.getTimelines(),
    (notify) => TimelineStore.subscribeGlobal(notify)
  );
  const visible = fromStore(
    () => TimelineUiStore.getVisible(),
    (notify) => TimelineUiStore.subscribe(notify)
  );
  const [mounted, setMounted] = createSignal(false);
  const [dockMaxHeight, setDockMaxHeight] = createSignal(DEFAULT_DOCK_MAX_HEIGHT);
  const controllerId = Symbol('dialkit-timeline-visibility');
  let dockRef: HTMLDivElement | undefined;
  let stopResize: StopGesture | null = null;

  onMount(() => {
    setMounted(true);
    const unregister = TimelineUiStore.registerController(controllerId, {
      visible: props.visible,
      defaultVisible: props.defaultVisible ?? true,
      onVisibilityChange: props.onVisibilityChange,
    });
    onCleanup(unregister);
  });

  createEffect(() => {
    TimelineUiStore.updateController(controllerId, {
      visible: props.visible,
      defaultVisible: props.defaultVisible ?? true,
      onVisibilityChange: props.onVisibilityChange,
    });
  });

  onCleanup(() => stopResize?.(false));

  const handleResizePointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!dockRef || stopResize) return;
    event.preventDefault();
    event.stopPropagation();

    const pointerY = event.clientY;
    const startHeight = dockRef.getBoundingClientRect().height;
    stopResize = startPointerGesture(event, event.currentTarget, {
      move(next) {
        setDockMaxHeight(clampDockHeight(startHeight + pointerY - next.clientY));
      },
      end() { stopResize = null; },
    });
  };

  return (
    <Show when={mounted() && timelines().length > 0}>
      <Portal mount={document.body}>
        <div
          class="dialkit-root dialkit-timeline"
          data-theme={props.theme ?? 'system'}
          hidden={!visible()}
        >
          <div
            class="dialkit-timeline-resize-handle"
            onPointerDown={handleResizePointerDown}
            onKeyDown={(event) => resizeDockFromKey(dockRef, event, (height) => setDockMaxHeight(height))}
            tabIndex={0}
            role="separator"
            aria-label="Resize timeline height"
            aria-orientation="horizontal"
            title="Drag to resize timeline"
          />
          <div
            ref={dockRef}
            class="dialkit-timeline-dock"
            style={{ 'max-height': `min(${dockMaxHeight()}px, calc(100vh - 24px))` }}
          >
            <For each={timelines().map(timeline => timeline.id)}>
              {(id) => (
                <TimelineSection
                  meta={timelines().find(timeline => timeline.id === id)!}
                  defaultOpen={props.defaultOpen ?? true}
                  theme={props.theme ?? 'system'}
                  dockVisible={visible()}
                />
              )}
            </For>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

function PlayPauseButton(props: { id: string }) {
  const playing = fromStore(
    () => TimelineStore.getTransport(props.id).playing,
    (notify) => TimelineStore.subscribe(props.id, notify)
  );
  const label = () => playing() ? 'Pause' : 'Play';
  return (
    <button
      class="dialkit-toolbar-add"
      onClick={() => playing() ? TimelineStore.pause(props.id) : TimelineStore.play(props.id)}
      title={label()}
      aria-label={label()}
    >
      <span style={{ position: 'relative', width: '16px', height: '16px' }}>
        <Show
          when={playing()}
          fallback={
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={iconStyle}>
              <path d={ICON_PLAY} fill="currentColor" />
            </svg>
          }
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={iconStyle}>
            <For each={ICON_PAUSE}>{(path) => <path d={path} fill="currentColor" />}</For>
          </svg>
        </Show>
      </span>
    </button>
  );
}

function ReplayButton(props: { onReplay: () => void }) {
  return (
    <button
      class="dialkit-toolbar-add"
      onClick={props.onReplay}
      title="Replay"
      aria-label="Replay"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <For each={ICON_REPLAY}>{(path) => <path d={path} fill="currentColor" />}</For>
      </svg>
    </button>
  );
}

const iconStyle = {
  position: 'absolute',
  inset: '0',
  width: '16px',
  height: '16px',
  color: 'var(--dial-text-label)',
} as const;

function TimelineOverview(props: {
  id: string;
  duration: number;
  viewStart: number;
  viewEnd: number;
  onNavigate: (time: number) => void;
}) {
  const time = fromStore(
    () => TimelineStore.getTransport(props.id).time,
    (notify) => TimelineStore.subscribe(props.id, notify)
  );
  const startScrub = createScrubGesture(() => props.id);

  return (
    <div
      class="dialkit-timeline-overview"
      onPointerDown={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        startScrub(event, event.currentTarget, (clientX) => {
          if (rect.width <= 0 || props.duration <= 0) return;
          const next = clamp(((clientX - rect.left) / rect.width) * props.duration, 0, props.duration);
          TimelineStore.seek(props.id, next);
          props.onNavigate(next);
        });
      }}
      title="Drag to scrub the full timeline"
    >
      <div
        class="dialkit-timeline-overview-viewport"
        data-zoomed={(props.duration > 0 ? ((props.viewEnd - props.viewStart) / props.duration) * 100 : 100) < 99.999 || undefined}
        style={{
          left: `${props.duration > 0 ? (props.viewStart / props.duration) * 100 : 0}%`,
          width: `${props.duration > 0 ? ((props.viewEnd - props.viewStart) / props.duration) * 100 : 100}%`,
        }}
      />
      <div
        class="dialkit-timeline-overview-progress"
        style={{ width: `${props.duration > 0 ? (time() / props.duration) * 100 : 0}%` }}
      />
      <div
        class="dialkit-timeline-overview-playhead"
        style={{ left: `${props.duration > 0 ? (time() / props.duration) * 100 : 0}%` }}
      />
    </div>
  );
}

function TimelinePlayheadFlag(props: {
  id: string;
  duration: number;
  pxPerSecond: number;
  viewStart: number;
  viewEnd: number;
  laneWidth: number;
  ruler: HTMLDivElement | undefined;
  onResetView: () => void;
  onNavigate: (time: number) => void;
}) {
  const time = fromStore(
    () => TimelineStore.getTransport(props.id).time,
    (notify) => TimelineStore.subscribe(props.id, notify)
  );
  const startScrub = createScrubGesture(() => props.id);

  const x = () => clamp((time() - props.viewStart) * props.pxPerSecond, 0, props.laneWidth);
  const flagCenter = () => clamp(
    x(),
    PLAYHEAD_FLAG_WIDTH / 2 - PLAYHEAD_FLAG_EDGE_OVERHANG,
    props.laneWidth - PLAYHEAD_FLAG_WIDTH / 2 + PLAYHEAD_FLAG_EDGE_OVERHANG
  );
  const flagOffset = () => flagCenter() - x();
  const edge = () => flagOffset() > 0.5 ? 'start' : flagOffset() < -0.5 ? 'end' : 'center';

  return (
    <Show when={isTimeInView(time(), props.viewStart, props.viewEnd, props.pxPerSecond) && props.laneWidth > 0}>
      <div
        class="dialkit-timeline-playhead-control"
        data-edge={edge()}
        style={{
          left: `calc(var(--dial-timeline-label-w) + ${x()}px)`,
          '--dial-timeline-playhead-flag-offset': `${flagOffset()}px`,
        }}
        onPointerDown={(event) => {
          const rect = props.ruler?.getBoundingClientRect();
          if (!rect) return;
          event.preventDefault();
          event.stopPropagation();
          const reset = event.shiftKey;
          const start = reset ? 0 : props.viewStart;
          const end = reset ? props.duration : props.viewEnd;
          // No capture: this flag unmounts whenever the playhead leaves the visible range.
          const started = startScrub(event, null, (clientX) => {
            if (rect.width <= 0) return;
            TimelineStore.seek(props.id, clamp(start + ((clientX - rect.left) / rect.width) * (end - start), start, end));
          });
          if (started && reset) props.onResetView();
        }}
        // Batched: if the view and the time changed apart, the flag could unmount between them and lose focus.
        onKeyDown={(event) => batch(() => seekFromKey(props.id, event, {
          start: props.viewStart,
          end: props.viewEnd,
          pxPerSecond: props.pxPerSecond,
          reveal: props.onNavigate,
        }))}
        tabIndex={0}
        role="slider"
        aria-label="Timeline current time"
        aria-valuemin={0}
        aria-valuemax={props.duration}
        aria-valuenow={time()}
        title="Drag to scrub the timeline"
      >
        <div class="dialkit-timeline-playhead-stem" />
        <div class="dialkit-timeline-playhead-anchor">
          <div class="dialkit-timeline-playhead-flag">{time().toFixed(2)}</div>
        </div>
      </div>
    </Show>
  );
}

type PopoverState = {
  clip: TimelineClipMeta;
  stepKey?: string;
  anchor: AnchorRect;
};

// A row's kind and identity live in its key, so <For> keeps the row and its
// clip bar through value edits; everything that changes reads through accessors.
type TimelineRow =
  | { kind: 'group'; key: string; group: string }
  | { kind: 'clip'; key: string; clip: TimelineClipMeta }
  | { kind: 'track'; key: string; clip: TimelineClipMeta; track: TimelineClipTrackMeta };

function clampViewStart(start: number, duration: number, visibleDuration: number): number {
  return clamp(start, 0, Math.max(0, duration - visibleDuration));
}

function TimelineSection(props: {
  meta: TimelineMeta;
  defaultOpen: boolean;
  theme: DialTheme;
  dockVisible: boolean;
}) {
  const [open, setOpen] = createSignal(props.defaultOpen);
  const [copied, setCopied] = createSignal(false);
  const [popover, setPopover] = createSignal<PopoverState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = createSignal(new Set<string>());
  const [expandedTracks, setExpandedTracks] = createSignal(new Set<string>());
  const [zoom, setZoom] = createSignal(1);
  const [viewStart, setViewStart] = createSignal(0);
  const values = fromStore(
    () => DialStore.getValues(props.meta.id),
    (notify) => DialStore.subscribe(props.meta.id, notify)
  );
  const presets = () => {
    values();
    return DialStore.getPresets(props.meta.id);
  };
  const activePresetId = () => {
    values();
    return DialStore.getActivePresetId(props.meta.id);
  };
  let sectionRef: HTMLDivElement | undefined;
  let laneAreaRef: HTMLDivElement | undefined;
  let horizontalScrollRef: HTMLDivElement | undefined;
  const [laneWidth, setLaneWidth] = createSignal(0);

  createEffect(() => {
    if (!open() || !laneAreaRef) return;
    const measure = () => {
      if (laneAreaRef) setLaneWidth(laneAreaRef.getBoundingClientRect().width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(laneAreaRef);
    onCleanup(() => observer.disconnect());
  });

  const visibleDuration = createMemo(() => props.meta.duration > 0 ? props.meta.duration / zoom() : props.meta.duration);
  const safeViewStart = createMemo(() => clampViewStart(viewStart(), props.meta.duration, visibleDuration()));
  const viewEnd = () => safeViewStart() + visibleDuration();
  const pxPerSecond = createMemo(() => visibleDuration() > 0 && laneWidth() > 0 ? laneWidth() / visibleDuration() : 0);
  const maxZoom = () => Math.max(
    MIN_TIMELINE_MAX_ZOOM,
    laneWidth() > 0 && props.meta.duration > 0
      ? (MAJOR_TICK_TARGET_PX * props.meta.duration) / (MILLISECOND_STEP * 10 * laneWidth())
      : MIN_TIMELINE_MAX_ZOOM
  );

  createEffect(() => setZoom((current) => clamp(current, 1, maxZoom())));
  createEffect(() => setViewStart((current) => clampViewStart(current, props.meta.duration, props.meta.duration / zoom())));
  createEffect(() => {
    open();
    const scroller = horizontalScrollRef;
    const next = safeViewStart() * pxPerSecond();
    if (!scroller || pxPerSecond() <= 0) return;
    if (Math.abs(scroller.scrollLeft - next) > 0.5) scroller.scrollLeft = next;
  });
  createEffect(() => {
    if (!props.dockVisible) setPopover(null);
  });

  const centerViewAt = (time: number) => {
    if (zoom() <= 1 || props.meta.duration <= 0) return;
    const duration = props.meta.duration / zoom();
    setViewStart(clampViewStart(time - duration / 2, props.meta.duration, duration));
  };
  const resetView = () => {
    setZoom(1);
    setViewStart(0);
  };
  const handleReplay = () => {
    setViewStart(0);
    TimelineStore.replay(props.meta.id);
  };
  const handleHorizontalScroll: JSX.EventHandler<HTMLDivElement, Event> = (event) => {
    if (pxPerSecond() <= 0) return;
    setViewStart(clampViewStart(
      event.currentTarget.scrollLeft / pxPerSecond(),
      props.meta.duration,
      visibleDuration()
    ));
  };
  const handleTimelineWheel: JSX.EventHandler<HTMLDivElement, WheelEvent> = (event) => {
    if (!horizontalScrollRef || zoom() <= 1) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.shiftKey
        ? event.deltaY
        : 0;
    if (delta === 0) return;
    event.preventDefault();
    horizontalScrollRef.scrollLeft += delta;
  };

  // Dragging scrubs. Option/Alt-drag preserves detailed zooming, while
  // Shift-drag first restores the full 1x range.
  const startRulerScrub = createScrubGesture(() => props.meta.id);
  const startTrackScrub = createScrubGesture(() => props.meta.id);
  let stopZoom: StopGesture | null = null;
  onCleanup(() => stopZoom?.(false));

  const handleRulerPointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const rect = handle.getBoundingClientRect();
    if (rect.width <= 0) return;

    if (!event.altKey) {
      const reset = event.shiftKey;
      const start = reset ? 0 : safeViewStart();
      const span = reset ? props.meta.duration : visibleDuration();
      const started = startRulerScrub(event, handle, (clientX) => {
        TimelineStore.seek(props.meta.id, clamp(start + ((clientX - rect.left) / rect.width) * span, start, start + span));
      });
      if (started && reset) resetView();
      return;
    }

    if (stopZoom) return;
    const pointerX = event.clientX;
    const startZoom = zoom();
    const startView = safeViewStart();
    const anchorRatio = clamp((pointerX - rect.left) / rect.width, 0, 1);
    const anchorTime = startView + anchorRatio * visibleDuration();
    let moved = false;
    stopZoom = startPointerGesture(event, handle, {
      move(next) {
        if (props.meta.duration <= 0) return;
        const dx = next.clientX - pointerX;
        if (!moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        moved = true;
        const nextZoom = clamp(startZoom * Math.exp(dx / ZOOM_DRAG_DISTANCE), 1, maxZoom());
        const nextDuration = props.meta.duration / nextZoom;
        setZoom(nextZoom);
        setViewStart(clampViewStart(anchorTime - anchorRatio * nextDuration, props.meta.duration, nextDuration));
      },
      end(cancelled) {
        stopZoom = null;
        if (cancelled && moved) {
          setZoom(startZoom);
          setViewStart(startView);
        }
      },
    });
  };

  const handleTrackPointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.dialkit-timeline-label, .dialkit-timeline-scroll-row, button')) return;
    if (!event.shiftKey && target.closest('.dialkit-timeline-clip')) return;
    const rect = laneAreaRef?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const reset = event.shiftKey;
    const start = reset ? 0 : safeViewStart();
    const span = reset ? props.meta.duration : visibleDuration();
    const started = startTrackScrub(event, event.currentTarget, (clientX) => {
      if (rect.width <= 0) return;
      TimelineStore.seek(props.meta.id, clamp(start + ((clientX - rect.left) / rect.width) * span, start, start + span));
    });
    if (!started) return;
    if (reset) resetView();
    setPopover(null);
  };

  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copyTimeout));

  const handleCopy = async () => {
    const normalized = normalizeTimelineValuesForCopy(DialStore.getValues(props.meta.id), props.meta.clips);
    if (!(await copyText(buildCopyInstruction('createDialTimeline', props.meta.name, normalized)))) return;
    setCopied(true);
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => setCopied(false), 1500);
  };

  const popoverClipKey = createMemo(() => popover()?.clip.key);
  const popoverStepKey = createMemo(() => popover()?.stepKey);

  // The popover closes when its bar is gone: a removed clip, a collapsed row.
  createEffect(() => {
    const clipKey = popoverClipKey();
    const stepKey = popoverStepKey();
    values();
    void props.meta.clips;
    collapsedGroups();
    expandedTracks();
    open();
    if (clipKey && !clipAnchorRect(sectionRef ?? null, clipKey, stepKey)) setPopover(null);
  });

  // It follows the bar through zoom, panning, and page scroll. Edits made inside
  // the popover are left out: a bar resizing must not move the slider under the pointer.
  createEffect(() => {
    const clipKey = popoverClipKey();
    const stepKey = popoverStepKey();
    pxPerSecond();
    safeViewStart();
    if (!clipKey) return;
    const follow = () => {
      const anchor = clipAnchorRect(sectionRef ?? null, clipKey, stepKey);
      if (anchor) setPopover((current) => current && { ...current, anchor });
    };
    follow();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    onCleanup(() => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    });
  });

  const closePopover = () => setPopover(null);

  // Escape and the close button hand focus back to the bar. Other closes leave it where the press put it.
  const dismissPopover = () => {
    const current = popover();
    if (current) returnFocusToClip(sectionRef ?? null, current.clip.key);
    setPopover(null);
  };

  const openClipPopover = (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => {
    const targetPath = stepKey ? `${clip.key}.${stepKey}` : clip.key;
    if (getClipControls(props.meta.id, targetPath, stepKey ? undefined : clipPopoverExclusions(clip)).length === 0) return;
    setPopover((previous) => previous?.clip.key === clip.key && previous.stepKey === stepKey
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
        });
  };
  const toggleSet = (setter: typeof setExpandedTracks, key: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleTracks = (key: string) => toggleSet(setExpandedTracks, key);
  const toggleGroup = (key: string) => toggleSet(setCollapsedGroups, key);
  const handleBarClick = (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => {
    if (!stepKey && clip.tracks?.length) toggleTracks(clip.key);
    else openClipPopover(clip, rect, stepKey);
  };

  const ticks = createMemo(() => {
    const rawStep = pxPerSecond() > 0 ? MAJOR_TICK_TARGET_PX / pxPerSecond() : 1;
    const adaptive = SECOND_TICK_STEPS.find((step) => step >= rawStep) ?? SECOND_TICK_STEPS[SECOND_TICK_STEPS.length - 1];
    const majorStep = zoom() < 1.5 && props.meta.duration >= 1 ? Math.max(1, adaptive) : adaptive;
    const fineStep = majorStep / 10;
    const major: number[] = [];
    const medium: number[] = [];
    const fine: number[] = [];
    const firstMajor = Math.ceil((safeViewStart() - 1e-6) / majorStep) * majorStep;
    for (let time = firstMajor; time <= viewEnd() + 1e-6; time += majorStep) {
      major.push(Number(time.toFixed(4)));
    }
    const firstFine = Math.ceil((safeViewStart() - 1e-6) / fineStep);
    const lastFine = Math.floor((viewEnd() + 1e-6) / fineStep);
    for (let index = firstFine; index <= lastFine; index++) {
      if (index % 10 === 0) continue;
      const tick = Number((index * fineStep).toFixed(6));
      if (index % 5 === 0) medium.push(tick);
      else fine.push(tick);
    }
    return { major, medium, fine, majorStep };
  });

  // Rows: clips in config order, grouped clips under a collapsible header,
  // props clips expandable into full per-property track rows. Structure only:
  // this must not read values, so an edit never touches the list.
  const rows = createMemo(() => {
    const result: TimelineRow[] = [];
    let lastGroup: string | undefined;
    for (const clip of props.meta.clips) {
      if (clip.group !== lastGroup) {
        lastGroup = clip.group;
        if (clip.group) result.push({ kind: 'group', key: `group:${clip.group}`, group: clip.group });
      }
      if (clip.group && collapsedGroups().has(clip.group)) continue;
      result.push({ kind: 'clip', key: `clip:${clip.key}`, clip });
      if (!clip.tracks?.length || !expandedTracks().has(clip.key)) continue;
      for (const track of clip.tracks) {
        result.push({ kind: 'track', key: `track:${clip.key}.${track.prop}`, clip, track });
      }
    }
    return result;
  });
  const rowKeys = createMemo(() => rows().map((row) => row.key));
  const rowByKey = (key: string) => rows().find((row) => row.key === key)!;
  const clipStats = createMemo(() => new Map(props.meta.clips.map((clip) => [
    clip.key,
    computeClipStaticFromValues(values(), clip, props.meta.duration),
  ])));

  const renderGroupRow = (group: string) => {
    const collapsed = () => collapsedGroups().has(group);
    return (
      <div class="dialkit-timeline-row dialkit-timeline-group-row">
        <div class="dialkit-timeline-label">
          <button
            class="dialkit-timeline-group-toggle"
            data-open={!collapsed()}
            onClick={() => toggleGroup(group)}
            title={collapsed() ? 'Expand layer' : 'Collapse layer'}
          >
            <ChevronIcon />
          </button>
          <span>{formatLabel(group)}</span>
        </div>
        <div class="dialkit-timeline-lane" />
      </div>
    );
  };

  const renderClipRow = (clip: () => TimelineClipMeta) => {
    const stat = () => clipStats().get(clip().key)!;
    const isProps = () => Boolean(clip().tracks?.length);
    const tracksOpen = () => isProps() && expandedTracks().has(clip().key);
    const selected = () => popoverClipKey() === clip().key;
    // Not inline: Solid compiles a conditional JSX prop to a memo created on each
    // read, and the bar reads these in its press handler, outside any owner.
    const steps = () => (clip().stepKeys?.length ? stat().tracks[0]?.steps : undefined);
    const fixedDuration = () => isProps() || stat().isPhysics;
    const selectedStepKey = () => (selected() ? popoverStepKey() : undefined);
    return (
      <div class="dialkit-timeline-row" data-grouped={clip().group ? '' : undefined}>
        <div class="dialkit-timeline-label">
          <Show when={isProps()}>
            <button
              class="dialkit-timeline-group-toggle"
              data-open={tracksOpen()}
              onClick={(event) => {
                event.stopPropagation();
                toggleTracks(clip().key);
              }}
              title={tracksOpen() ? 'Collapse properties' : 'Expand properties'}
            >
              <ChevronIcon />
            </button>
          </Show>
          {clip().label}
        </div>
        <div class="dialkit-timeline-lane">
          <TimelineClip
            timelineId={props.meta.id}
            clip={clip()}
            at={stat().at}
            duration={stat().duration}
            loop={stat().loop}
            steps={steps()}
            fixedDuration={fixedDuration()}
            composite={isProps()}
            pxPerSecond={pxPerSecond()}
            viewStart={safeViewStart()}
            timelineDuration={props.meta.duration}
            selected={selected()}
            selectedStepKey={selectedStepKey()}
            onClick={handleBarClick}
            onDrag={closePopover}
          />
        </div>
      </div>
    );
  };

  // Each property is a full clip row of its own; the bar position is the
  // track's delay (its phase offset from the clip's `at`).
  const renderTrackRow = (clip: () => TimelineClipMeta, trackRef: () => TimelineClipTrackMeta) => {
    const stat = () => clipStats().get(clip().key)!;
    const track = () => stat().tracks.find((candidate) => candidate.prop === trackRef().prop);
    const trackMeta = createMemo<TimelineClipMeta>(() => ({
      key: `${clip().key}.${trackRef().prop}`,
      label: `${clip().label} · ${formatLabel(trackRef().prop)}`,
      color: clip().color,
      loop: clip().loop,
      group: clip().group,
      stepKeys: trackRef().stepKeys,
    }));
    const selected = () => popoverClipKey() === trackMeta().key;
    const selectedStepKey = () => (selected() ? popoverStepKey() : undefined);
    return (
      <Show when={track()}>
        {(current) => {
          const steps = () => (trackRef().stepKeys?.length ? current().steps : undefined);
          const fixedDuration = () => !trackRef().stepKeys?.length && current().steps[0]?.isPhysics === true;
          return (
            <div class="dialkit-timeline-row dialkit-timeline-track-row" data-grouped={clip().group ? '' : undefined}>
              <div class="dialkit-timeline-label">{formatLabel(trackRef().prop)}</div>
              <div class="dialkit-timeline-lane">
                <TimelineClip
                  timelineId={props.meta.id}
                  clip={trackMeta()}
                  at={stat().at + current().delay}
                  duration={current().duration}
                  loop={stat().loop}
                  steps={steps()}
                  fixedDuration={fixedDuration()}
                  baseAt={stat().at}
                  delayMode
                  pxPerSecond={pxPerSecond()}
                  viewStart={safeViewStart()}
                  timelineDuration={props.meta.duration}
                  selected={selected()}
                  selectedStepKey={selectedStepKey()}
                  onClick={openClipPopover}
                  onDrag={closePopover}
                />
              </div>
            </div>
          );
        }}
      </Show>
    );
  };

  const renderRow = (key: string) => {
    const row = rowByKey(key);
    if (row.kind === 'group') return renderGroupRow(row.group);
    const clip = () => (rowByKey(key) as Exclude<TimelineRow, { kind: 'group' }>).clip;
    if (row.kind === 'clip') return renderClipRow(clip);
    return renderTrackRow(clip, () => (rowByKey(key) as Extract<TimelineRow, { kind: 'track' }>).track);
  };

  return (
    <div ref={sectionRef} class="dialkit-timeline-section">
      <div class="dialkit-timeline-header" data-open={open() || undefined}>
        <div class="dialkit-timeline-identity">
          <span class="dialkit-timeline-title">{props.meta.name}</span>
        </div>
        <Show when={!open()}>
          <TimelineOverview
            id={props.meta.id}
            duration={props.meta.duration}
            viewStart={safeViewStart()}
            viewEnd={viewEnd()}
            onNavigate={centerViewAt}
          />
        </Show>
        <div class="dialkit-timeline-actions">
          <PlayPauseButton id={props.meta.id} />
          <ReplayButton onReplay={handleReplay} />

          <PresetManager
            panelId={props.meta.id}
            presets={presets()}
            activePresetId={activePresetId()}
          />
          <button
            class="dialkit-toolbar-add dialkit-toolbar-primary"
            onClick={handleCopy}
            title="Copy parameters"
            aria-label={copied() ? 'Copied parameters' : 'Copy parameters'}
          >
            <span style={{ position: 'relative', width: '16px', height: '16px' }}>
              <Show
                when={copied()}
                fallback={
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ ...iconStyle, color: 'inherit' }}>
                    <path d={ICON_CLIPBOARD_PLAIN.board} stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                    <path d={ICON_CLIPBOARD_PLAIN.body} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ ...iconStyle, color: 'inherit' }}>
                  <path d={ICON_CHECK} />
                </svg>
              </Show>
            </span>
          </button>
          <button
            class="dialkit-timeline-chevron"
            data-open={open()}
            aria-expanded={open()}
            onClick={() => setOpen((current) => !current)}
            title={open() ? 'Collapse timeline' : 'Expand timeline'}
          >
            <ChevronIcon />
          </button>
        </div>
      </div>

      <Show when={open()}>
        <div
          class="dialkit-timeline-body"
          onWheel={handleTimelineWheel}
          onPointerDown={handleTrackPointerDown}
        >
          <div class="dialkit-timeline-grid">
            <div class="dialkit-timeline-row dialkit-timeline-ruler-row">
              <div class="dialkit-timeline-label" />
              <div
                ref={laneAreaRef}
                class="dialkit-timeline-ruler"
                onPointerDown={handleRulerPointerDown}
                title="Drag to seek · Option-drag to zoom · Shift-drag to reset zoom"
              >
                <For each={ticks().fine}>{(time) => <div class="dialkit-timeline-tick dialkit-timeline-tick-fine" style={{ left: `${(time - safeViewStart()) * pxPerSecond()}px` }} />}</For>
                <For each={ticks().medium}>{(time) => <div class="dialkit-timeline-tick dialkit-timeline-tick-medium" style={{ left: `${(time - safeViewStart()) * pxPerSecond()}px` }} />}</For>
                <For each={ticks().major}>{(time) => (
                  <div class="dialkit-timeline-tick" style={{ left: `${(time - safeViewStart()) * pxPerSecond()}px` }}>
                    <span class="dialkit-timeline-tick-label">{formatRulerSeconds(time, ticks().majorStep)}</span>
                  </div>
                )}</For>
              </div>
            </div>
            <For each={rowKeys()}>{renderRow}</For>
            <Show when={pxPerSecond() > 0}>
              <TimelinePlayheadFlag
                id={props.meta.id}
                duration={props.meta.duration}
                pxPerSecond={pxPerSecond()}
                viewStart={safeViewStart()}
                viewEnd={viewEnd()}
                laneWidth={laneWidth()}
                ruler={laneAreaRef}
                onResetView={resetView}
                onNavigate={centerViewAt}
              />
            </Show>
          </div>
          <Show when={zoom() > 1}>
            <div class="dialkit-timeline-scroll-row">
              <div class="dialkit-timeline-label" />
              <div
                ref={horizontalScrollRef}
                class="dialkit-timeline-horizontal-scroll"
                onScroll={handleHorizontalScroll}
                aria-label="Timeline horizontal scroll"
              >
                <div style={{ width: `${laneWidth() * zoom()}px` }} />
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={popover()}>
        {(current) => (
          <ClipPopover
            panelId={props.meta.id}
            popover={current()}
            values={values()}
            theme={props.theme}
            onClose={closePopover}
            onDismiss={dismissPopover}
          />
        )}
      </Show>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d={ICON_CHEVRON} />
    </svg>
  );
}

function ClipPopover(props: {
  panelId: string;
  popover: PopoverState;
  values: Record<string, DialValue>;
  theme: DialTheme;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const [element, setElement] = createSignal<HTMLDivElement>();
  const [naturalHeight, setNaturalHeight] = createSignal(0);
  const [viewport, setViewport] = createSignal(readViewport());
  const target = createMemo(() => `${props.popover.clip.key}/${props.popover.stepKey ?? ''}`);
  const measured = createMemo(() => naturalHeight() > 0);
  let closeButton: HTMLButtonElement | undefined;

  // Focus moves in once it has a height: until then it's hidden, and can't take focus.
  createEffect(() => {
    target();
    if (measured()) closeButton?.focus({ preventScroll: true });
  });

  createEffect(() => {
    target();
    const current = element();
    if (!current) return;
    const measure = () => setNaturalHeight(current.scrollHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(current.querySelector('.dialkit-timeline-popover-body') ?? current);
    onCleanup(() => observer.disconnect());
  });

  onMount(() => {
    const updateViewport = () => setViewport(readViewport());
    const outside = (event: PointerEvent) => {
      const pressed = event.target as HTMLElement;
      if (element()?.contains(pressed) || isFloatingControlTarget(pressed)) return;
      // Clips and labels handle their own toggle or switch.
      if (pressed.closest?.('.dialkit-timeline-clip') || pressed.closest?.('.dialkit-timeline-label')) return;
      props.onClose();
    };
    // On the window, because Solid delegates to the document: a control's
    // stopPropagation can't stop a listener there. It runs after the delegated
    // handlers, and an Escape they handled is not ours to act on.
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) props.onDismiss();
    };
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', keydown);
    onCleanup(() => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', keydown);
    });
  });

  const presentation = createMemo(() => {
    const { clip, stepKey } = props.popover;
    let controls: ControlMeta[];
    let title: string;
    if (stepKey) {
      controls = getClipControls(props.panelId, `${clip.key}.${stepKey}`);
      if (stepKey === clip.stepKeys?.[0]) {
        const from = getControlAt(props.panelId, `${clip.key}.from`);
        if (from) {
          const target = `${clip.key}.${stepKey}.to`;
          const index = controls.findIndex((control) => control.path === target);
          controls = index >= 0
            ? [...controls.slice(0, index), from, ...controls.slice(index)]
            : [...controls, from];
        }
      }
      title = `${clip.label} · ${formatStepLabel(stepKey)}`;
    } else {
      controls = getClipControls(props.panelId, clip.key, clipPopoverExclusions(clip));
      title = clip.label;
    }
    const targetPath = stepKey ? `${clip.key}.${stepKey}` : clip.key;
    const durationMeta = getControlAt(props.panelId, `${targetPath}.duration`);
    const durationValue = durationMeta ? props.values[durationMeta.path] : undefined;
    const transitionDuration = durationMeta?.type === 'slider' && typeof durationValue === 'number'
      ? {
          value: durationValue,
          onChange: (next: number) => DialStore.updateValue(props.panelId, durationMeta.path, next),
          min: Math.max(TIMELINE_MIN_CLIP_DURATION, durationMeta.min ?? 0),
          max: durationMeta.max,
          step: durationMeta.step,
        }
      : undefined;
    return {
      controls,
      title,
      transitionDuration,
      displayValues: timelinePopoverDisplayValues(props.values, clip.key, clip.stepKeys, stepKey),
    };
  });

  const position = createMemo(() => {
    const current = viewport();
    const right = current.offsetLeft + current.width;
    const bottom = current.offsetTop + current.height;
    const width = Math.min(POPOVER_WIDTH, Math.max(220, current.width - 24));
    const left = clamp(
      props.popover.anchor.left + props.popover.anchor.width / 2 - width / 2,
      current.offsetLeft + 12,
      Math.max(current.offsetLeft + 12, right - width - 12)
    );
    const above = Math.max(0, props.popover.anchor.top - current.offsetTop - 22);
    const below = Math.max(0, bottom - props.popover.anchor.bottom - 22);
    const placeAbove = naturalHeight() === 0
      ? above >= below
      : naturalHeight() <= above || (naturalHeight() > below && above >= below);
    const availableHeight = placeAbove ? above : below;
    const renderedHeight = Math.min(naturalHeight() || availableHeight, availableHeight);
    const rawTop = placeAbove
      ? props.popover.anchor.top - 10 - renderedHeight
      : props.popover.anchor.bottom + 10;
    return {
      width,
      left,
      top: clamp(rawTop, current.offsetTop + 12, Math.max(current.offsetTop + 12, bottom - renderedHeight - 12)),
      availableHeight,
      placeAbove,
    };
  });

  return (
    <Show when={presentation().controls.length > 0}>
      <Portal mount={document.body}>
        <div class="dialkit-root" data-theme={props.theme}>
          <div
            ref={(el) => setElement(el)}
            class="dialkit-timeline-popover"
            data-placement={position().placeAbove ? 'above' : 'below'}
            style={{
              left: `${position().left}px`,
              top: `${position().top}px`,
              width: `${position().width}px`,
              'max-height': `${position().availableHeight}px`,
              visibility: naturalHeight() > 0 ? 'visible' : 'hidden',
            }}
            role="dialog"
            aria-label={`Edit ${presentation().title}`}
          >
            <div class="dialkit-timeline-popover-header">
              <span class="dialkit-timeline-popover-title">{presentation().title}</span>
              <button ref={closeButton} class="dialkit-timeline-popover-close" onClick={props.onDismiss} title="Close editor" aria-label="Close editor">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M6 6L18 18M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div class="dialkit-timeline-popover-body">
              <ControlRenderer
                panelId={props.panelId}
                controls={presentation().controls}
                values={presentation().displayValues}
                transitionDuration={presentation().transitionDuration}
              />
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

function readViewport() {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetLeft: window.visualViewport?.offsetLeft ?? 0,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  };
}

function clipPopoverExclusions(clip: TimelineClipMeta): Set<string> {
  return new Set([...(clip.stepKeys ?? []), ...(clip.tracks?.map((track) => track.prop) ?? [])]);
}

function getClipControls(panelId: string, path: string, exclusions?: Set<string>): ControlMeta[] {
  const panel = DialStore.getPanel(panelId);
  const folder = panel ? findControl(panel.controls, path) : null;
  if (!folder?.children) return [];
  return folder.children.filter((control) => {
    const key = control.path.slice(path.length + 1);
    return key !== 'at' && key !== 'duration' && !exclusions?.has(key);
  });
}

function getControlAt(panelId: string, path: string): ControlMeta | null {
  const panel = DialStore.getPanel(panelId);
  return panel ? findControl(panel.controls, path) : null;
}

function TimelineClip(props: {
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
}) {
  let stop: StopGesture | null = null;
  let disposed = false;
  const [dragging, setDragging] = createSignal(false);
  const isSteps = () => Boolean(props.steps?.length);

  onCleanup(() => {
    disposed = true;
    stop?.(false);
  });

  const handlePointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (event.shiftKey) return;
    event.stopPropagation();
    if (stop) return;
    const clip = props.clip;
    stop = startClipDrag(event, event.currentTarget, {
      timelineId: props.timelineId,
      clipKey: clip.key,
      at: props.at,
      duration: props.duration,
      steps: props.steps,
      fixedDuration: props.fixedDuration,
      baseAt: props.baseAt,
      delayMode: props.delayMode,
      getScale: () => ({ pxPerSecond: props.pxPerSecond, timelineDuration: props.timelineDuration }),
      onDragStart: () => {
        setDragging(true);
        props.onDrag();
      },
      onClick: (stepKey, anchor) => {
        // Ending the press because the bar is going away is not a click.
        if (!disposed) props.onClick(clip, anchor.getBoundingClientRect(), stepKey);
      },
      onEnd: () => {
        stop = null;
        setDragging(false);
      },
    });
  };

  const ghostCycles = createMemo(() => {
    const cycles: Array<{ start: number; duration: number; index: number }> = [];
    if (props.loop !== 'repeat' || props.duration <= 0) return cycles;
    const first = Math.max(1, Math.floor((props.viewStart - props.at) / props.duration));
    for (let offset = 0; offset < 256; offset++) {
      const index = first + offset;
      const start = props.at + props.duration * index;
      if (start >= props.timelineDuration - 1e-6) break;
      cycles.push({ start, duration: Math.min(props.duration, props.timelineDuration - start), index });
    }
    return cycles;
  });
  const boundaries = createMemo(() => {
    let total = 0;
    return props.steps?.map((step) => (total += step.duration)) ?? [];
  });
  const width = () => Math.max(props.duration * props.pxPerSecond, 14);
  const resizable = () => props.duration > 0 && !props.fixedDuration && !props.composite;
  const durationText = () => `${props.fixedDuration && !props.composite ? '~' : ''}${formatSeconds(props.duration)}`;
  const looping = () => props.loop === 'repeat' && props.duration > 0;
  const title = () => props.composite
    ? `${props.clip.label} — composite of its property tracks${looping() ? ' · repeats through timeline' : ''} · click to expand`
    : `${props.clip.label} — ${formatSeconds(props.at)} for ${durationText()}${props.fixedDuration ? ' (duration set by spring physics)' : ''}${looping() ? ' · repeats through timeline' : ''}${props.delayMode ? ' · drag to phase-shift' : ''}`;

  return (
    <>
      <Index each={ghostCycles()}>{(cycle) => (
        <div
          class="dialkit-timeline-clip-ghost"
          data-steps={isSteps() || undefined}
          aria-hidden="true"
          style={{
            left: `${(cycle().start - props.viewStart) * props.pxPerSecond + 1}px`,
            width: `${Math.max(1, cycle().duration * props.pxPerSecond - 2)}px`,
            background: props.clip.color,
          }}
        >
          <Index each={props.steps}>{(step) => <span class="dialkit-timeline-clip-ghost-segment" style={{ width: `${step().duration * props.pxPerSecond}px` }} />}</Index>
        </div>
      )}</Index>
      <div
        class="dialkit-timeline-clip"
        data-clip-key={props.clip.key}
        data-steps={isSteps() || undefined}
        data-composite={props.composite || undefined}
        data-selected={props.selected || undefined}
        data-dragging={dragging() || undefined}
        style={{
          left: `${(props.at - props.viewStart) * props.pxPerSecond}px`,
          width: `${width()}px`,
          background: props.composite ? `${props.clip.color}80` : props.clip.color,
        }}
        onPointerDown={handlePointerDown}
        onKeyDown={(event) => pressClipFromKey(event, () => props.onClick(props.clip, event.currentTarget.getBoundingClientRect()))}
        tabIndex={0}
        role="button"
        aria-label={`Edit ${props.clip.label}`}
        title={title()}
      >
        <Show
          when={!props.composite}
          fallback={<Show when={width() > 56}><span class="dialkit-timeline-clip-duration">{durationText()}</span></Show>}
        >
          <Show
            when={isSteps()}
            fallback={
              <>
                <Show when={resizable()}><div class="dialkit-timeline-clip-handle" data-edge="start" /></Show>
                <Show when={width() > 56}><span class="dialkit-timeline-clip-duration">{durationText()}</span></Show>
                <Show when={resizable()}><div class="dialkit-timeline-clip-handle" data-edge="end" /></Show>
              </>
            }
          >
            <Index each={props.steps}>{(step) => {
              const segmentWidth = () => step().duration * props.pxPerSecond;
              return (
                <div
                  class="dialkit-timeline-clip-segment"
                  data-step={step().key ?? undefined}
                  data-selected={props.selectedStepKey === step().key || undefined}
                  style={{ width: `${segmentWidth()}px` }}
                >
                  <Show when={segmentWidth() > 52}><span class="dialkit-timeline-clip-duration">{formatSeconds(step().duration)}</span></Show>
                </div>
              );
            }}</Index>
            <Index each={props.steps}>{(step, index) => (
              <Show when={!step().isPhysics}>
                <div
                  class="dialkit-timeline-clip-handle"
                  data-boundary={index}
                  style={{ left: `${boundaries()[index] * props.pxPerSecond - 4}px` }}
                />
              </Show>
            )}</Index>
            <Show when={!props.steps?.[0]?.isPhysics}><div class="dialkit-timeline-clip-handle" data-edge="start" /></Show>
          </Show>
        </Show>
      </div>
      <Show when={looping()}><span class="dialkit-timeline-loop-infinity" aria-hidden="true" title="Repeats indefinitely">∞</span></Show>
    </>
  );
}
