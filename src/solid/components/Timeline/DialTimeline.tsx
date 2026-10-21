import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { DialStore, formatLabel } from '../../../store/DialStore';
import type { ControlMeta, DialValue } from '../../../store/DialStore';
import { TimelineStore } from '../../../store/TimelineStore';
import type { TimelineClipMeta, TimelineMeta } from '../../../store/TimelineStore';
import { TimelineUiStore } from '../../../store/TimelineUiStore';
import {
  TIMELINE_MIN_CLIP_DURATION,
  clampClipMove,
  clampClipResizeEnd,
  clampClipResizeStart,
  clampStepResize,
  clampTrackDelay,
  clipAccessibleName,
  computeClipStaticFromValues,
  dockResizeKeyHeight,
  formatClock,
  formatSeconds,
  formatStepLabel,
  handlePlayheadKey,
  handleTimelineClipKey,
  handleTimelineSpaceKey,
  normalizeTimelineValuesForCopy,
  observeClipPopover,
  playheadValueText,
  preserveTimelineFocus,
  timelinePopoverDisplayValues,
} from '../../../timeline-core';
import type { TimelineClipLoop, TimelineStepStatic } from '../../../timeline-core';
import { clamp } from '../../../transition-math';
import { buildCopyInstruction } from '../../../copy-instruction';
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
const MIN_DOCK_MAX_HEIGHT = 120;

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
  let resizeCleanup: (() => void) | null = null;

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

  onCleanup(() => resizeCleanup?.());

  const handleResizePointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!dockRef) return;
    event.preventDefault();
    event.stopPropagation();
    resizeCleanup?.();

    const pointerY = event.clientY;
    const startHeight = dockRef.getBoundingClientRect().height;
    const move = (next: PointerEvent) => {
      next.preventDefault();
      const viewportMax = Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24);
      setDockMaxHeight(clamp(startHeight + pointerY - next.clientY, MIN_DOCK_MAX_HEIGHT, viewportMax));
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
  };

  const resizeMax = () => Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24);
  const handleResizeKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    const next = dockResizeKeyHeight(event.key, dockMaxHeight(), MIN_DOCK_MAX_HEIGHT, resizeMax(), event.shiftKey);
    if (next === undefined) return;
    event.preventDefault();
    setDockMaxHeight(next);
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
            onKeyDown={handleResizeKeyDown}
            role="separator"
            tabIndex={0}
            aria-label="Resize timeline height"
            aria-orientation="horizontal"
            aria-valuemin={MIN_DOCK_MAX_HEIGHT}
            aria-valuemax={resizeMax()}
            aria-valuenow={Math.round(Math.min(dockMaxHeight(), resizeMax()))}
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
  let scrub: { wasPlaying: boolean; rect: DOMRect } | null = null;

  const seekFromClientX = (clientX: number) => {
    if (!scrub || scrub.rect.width <= 0 || props.duration <= 0) return;
    const next = clamp(((clientX - scrub.rect.left) / scrub.rect.width) * props.duration, 0, props.duration);
    TimelineStore.seek(props.id, next);
    props.onNavigate(next);
  };
  const finish = () => {
    if (scrub?.wasPlaying) TimelineStore.play(props.id);
    scrub = null;
  };

  return (
    <div
      class="dialkit-timeline-overview"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        scrub = {
          wasPlaying: TimelineStore.getTransport(props.id).playing,
          rect: event.currentTarget.getBoundingClientRect(),
        };
        TimelineStore.pause(props.id);
        seekFromClientX(event.clientX);
      }}
      onPointerMove={(event) => scrub && seekFromClientX(event.clientX)}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
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
  onReveal: (time: number) => void;
}) {
  const time = fromStore(
    () => TimelineStore.getTransport(props.id).time,
    (notify) => TimelineStore.subscribe(props.id, notify)
  );
  let scrub: { wasPlaying: boolean; rect: DOMRect; viewStart: number; viewEnd: number } | null = null;
  let cleanup: (() => void) | null = null;

  const seek = (clientX: number) => {
    if (!scrub || scrub.rect.width <= 0) return;
    TimelineStore.seek(
      props.id,
      clamp(
        scrub.viewStart + ((clientX - scrub.rect.left) / scrub.rect.width) * (scrub.viewEnd - scrub.viewStart),
        scrub.viewStart,
        scrub.viewEnd
      )
    );
  };

  onCleanup(() => cleanup?.());

  const x = () => clamp((time() - props.viewStart) * props.pxPerSecond, 0, props.laneWidth);
  const flagCenter = () => clamp(
    x(),
    PLAYHEAD_FLAG_WIDTH / 2 - PLAYHEAD_FLAG_EDGE_OVERHANG,
    props.laneWidth - PLAYHEAD_FLAG_WIDTH / 2 + PLAYHEAD_FLAG_EDGE_OVERHANG
  );
  const flagOffset = () => flagCenter() - x();
  const edge = () => flagOffset() > 0.5 ? 'start' : flagOffset() < -0.5 ? 'end' : 'center';

  return (
    <Show when={time() >= props.viewStart && time() <= props.viewEnd && props.laneWidth > 0}>
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
          cleanup?.();
          const reset = event.shiftKey;
          scrub = {
            wasPlaying: TimelineStore.getTransport(props.id).playing,
            rect,
            viewStart: reset ? 0 : props.viewStart,
            viewEnd: reset ? props.duration : props.viewEnd,
          };
          if (reset) props.onResetView();
          TimelineStore.pause(props.id);
          seek(event.clientX);
          const move = (next: PointerEvent) => {
            next.preventDefault();
            seek(next.clientX);
          };
          const finish = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            if (scrub?.wasPlaying) TimelineStore.play(props.id);
            scrub = null;
            cleanup = null;
          };
          window.addEventListener('pointermove', move, { passive: false });
          window.addEventListener('pointerup', finish);
          window.addEventListener('pointercancel', finish);
          cleanup = finish;
        }}
        // Keep a keyboard-scrubbed playhead in view so it keeps focus when zoomed.
        onKeyDown={(event) => handlePlayheadKey(event, props.id, (next) => {
          if (next < props.viewStart || next > props.viewEnd) props.onReveal(next);
        })}
        role="slider"
        tabIndex={0}
        aria-label="Timeline current time"
        aria-valuemin={0}
        aria-valuemax={props.duration}
        aria-valuenow={time()}
        aria-valuetext={playheadValueText(time(), props.duration)}
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
  anchor: { left: number; top: number; right: number; bottom: number; width: number; height: number };
};

type ZoomDragState = {
  pointerX: number;
  rect: DOMRect;
  zoom: number;
  viewStart: number;
  anchorRatio: number;
  anchorTime: number;
  moved: boolean;
};

function clampViewStart(start: number, duration: number, visibleDuration: number): number {
  return clamp(start, 0, Math.max(0, duration - visibleDuration));
}

function formatRulerSeconds(time: number, step: number): string {
  if (step >= 1 && Number.isInteger(time)) return formatClock(time);
  const decimals = Math.min(3, Math.max(1, Math.ceil(-Math.log10(step))));
  return `${time.toFixed(decimals)}s`;
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

  const visibleDuration = () => props.meta.duration > 0 ? props.meta.duration / zoom() : props.meta.duration;
  const safeViewStart = () => clampViewStart(viewStart(), props.meta.duration, visibleDuration());
  const viewEnd = () => safeViewStart() + visibleDuration();
  const pxPerSecond = () => visibleDuration() > 0 && laneWidth() > 0 ? laneWidth() / visibleDuration() : 0;
  const maxZoom = () => Math.max(
    MIN_TIMELINE_MAX_ZOOM,
    laneWidth() > 0 && props.meta.duration > 0
      ? (MAJOR_TICK_TARGET_PX * props.meta.duration) / (MILLISECOND_STEP * 10 * laneWidth())
      : MIN_TIMELINE_MAX_ZOOM
  );

  createEffect(() => setZoom((current) => clamp(current, 1, maxZoom())));
  createEffect(() => setViewStart((current) => clampViewStart(current, props.meta.duration, props.meta.duration / zoom())));
  createEffect(() => {
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

  let zoomDrag: ZoomDragState | null = null;
  let rulerScrub: { wasPlaying: boolean; rect: DOMRect; viewStart: number; visibleDuration: number } | null = null;
  let trackScrub: { wasPlaying: boolean; rect: DOMRect; viewStart: number; visibleDuration: number } | null = null;

  const seekRuler = (clientX: number) => {
    if (!rulerScrub || rulerScrub.rect.width <= 0) return;
    TimelineStore.seek(
      props.meta.id,
      clamp(
        rulerScrub.viewStart + ((clientX - rulerScrub.rect.left) / rulerScrub.rect.width) * rulerScrub.visibleDuration,
        rulerScrub.viewStart,
        rulerScrub.viewStart + rulerScrub.visibleDuration
      )
    );
  };
  const seekTrack = (clientX: number) => {
    if (!trackScrub || trackScrub.rect.width <= 0) return;
    TimelineStore.seek(
      props.meta.id,
      clamp(
        trackScrub.viewStart + ((clientX - trackScrub.rect.left) / trackScrub.rect.width) * trackScrub.visibleDuration,
        trackScrub.viewStart,
        trackScrub.viewStart + trackScrub.visibleDuration
      )
    );
  };

  const handleRulerPointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!event.altKey) {
      const reset = event.shiftKey;
      rulerScrub = {
        wasPlaying: TimelineStore.getTransport(props.meta.id).playing,
        rect,
        viewStart: reset ? 0 : safeViewStart(),
        visibleDuration: reset ? props.meta.duration : visibleDuration(),
      };
      if (reset) resetView();
      TimelineStore.pause(props.meta.id);
      seekRuler(event.clientX);
      return;
    }
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    zoomDrag = {
      pointerX: event.clientX,
      rect,
      zoom: zoom(),
      viewStart: safeViewStart(),
      anchorRatio: ratio,
      anchorTime: safeViewStart() + ratio * visibleDuration(),
      moved: false,
    };
  };

  const handleRulerPointerMove: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (rulerScrub) {
      seekRuler(event.clientX);
      return;
    }
    if (!zoomDrag || props.meta.duration <= 0) return;
    const dx = event.clientX - zoomDrag.pointerX;
    if (!zoomDrag.moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
    zoomDrag.moved = true;
    const nextZoom = clamp(zoomDrag.zoom * Math.exp(dx / ZOOM_DRAG_DISTANCE), 1, maxZoom());
    const nextDuration = props.meta.duration / nextZoom;
    setZoom(nextZoom);
    setViewStart(clampViewStart(
      zoomDrag.anchorTime - zoomDrag.anchorRatio * nextDuration,
      props.meta.duration,
      nextDuration
    ));
  };

  const finishRuler = () => {
    if (rulerScrub?.wasPlaying) TimelineStore.play(props.meta.id);
    rulerScrub = null;
    zoomDrag = null;
  };

  const handleTrackPointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.dialkit-timeline-label, button')) return;
    if (!event.shiftKey && target.closest('.dialkit-timeline-clip')) return;
    const rect = laneAreaRef?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const reset = event.shiftKey;
    trackScrub = {
      wasPlaying: TimelineStore.getTransport(props.meta.id).playing,
      rect,
      viewStart: reset ? 0 : safeViewStart(),
      visibleDuration: reset ? props.meta.duration : visibleDuration(),
    };
    if (reset) resetView();
    setPopover(null);
    TimelineStore.pause(props.meta.id);
    seekTrack(event.clientX);
  };
  const finishTrack = () => {
    if (trackScrub?.wasPlaying) TimelineStore.play(props.meta.id);
    trackScrub = null;
  };

  const handleCopy = () => {
    const normalized = normalizeTimelineValuesForCopy(DialStore.getValues(props.meta.id), props.meta.clips);
    void navigator.clipboard.writeText(buildCopyInstruction('createDialTimeline', props.meta.name, normalized));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const closePopover = () => setPopover(null);

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
  // Rows re-render on toggle; keep focus on the toggle that was pressed.
  const toggleSet = (setter: typeof setExpandedTracks, key: string) => {
    preserveTimelineFocus(sectionRef!, () => setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    }));
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

  const rows = createMemo<JSX.Element[]>(() => {
    const result: JSX.Element[] = [];
    let lastGroup: string | undefined;
    const currentValues = values();
    for (const clip of props.meta.clips) {
      if (clip.group !== lastGroup) {
        lastGroup = clip.group;
        if (clip.group) {
          const group = clip.group;
          const collapsed = collapsedGroups().has(group);
          result.push(
            <div class="dialkit-timeline-row dialkit-timeline-group-row">
              <div class="dialkit-timeline-label">
                <button
                  class="dialkit-timeline-group-toggle"
                  data-open={!collapsed}
                  onClick={() => toggleGroup(group)}
                  title={collapsed ? 'Expand layer' : 'Collapse layer'}
                  aria-label={collapsed ? 'Expand layer' : 'Collapse layer'}
                  aria-expanded={!collapsed}
                >
                  <ChevronIcon />
                </button>
                <span>{formatLabel(group)}</span>
              </div>
              <div class="dialkit-timeline-lane" />
            </div>
          );
        }
      }
      if (clip.group && collapsedGroups().has(clip.group)) continue;
      const isProps = Boolean(clip.tracks?.length);
      const tracksOpen = isProps && expandedTracks().has(clip.key);
      const stat = computeClipStaticFromValues(currentValues, clip, props.meta.duration);
      result.push(
        <div class="dialkit-timeline-row" data-grouped={clip.group ? '' : undefined}>
          <div class="dialkit-timeline-label">
            <Show when={isProps}>
              <button
                class="dialkit-timeline-group-toggle"
                data-open={tracksOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTracks(clip.key);
                }}
                title={tracksOpen ? 'Collapse properties' : 'Expand properties'}
                aria-label={tracksOpen ? 'Collapse properties' : 'Expand properties'}
                aria-expanded={tracksOpen}
              >
                <ChevronIcon />
              </button>
            </Show>
            {clip.label}
          </div>
          <div class="dialkit-timeline-lane">
            <TimelineClip
              timelineId={props.meta.id}
              clip={clip}
              at={stat.at}
              duration={stat.duration}
              loop={stat.loop}
              steps={clip.stepKeys?.length ? stat.tracks[0]?.steps : undefined}
              fixedDuration={isProps ? true : stat.isPhysics}
              composite={isProps}
              expanded={tracksOpen}
              pxPerSecond={pxPerSecond()}
              viewStart={safeViewStart()}
              timelineDuration={props.meta.duration}
              selected={popover()?.clip.key === clip.key}
              selectedStepKey={popover()?.clip.key === clip.key ? popover()?.stepKey : undefined}
              onClick={handleBarClick}
              onDrag={closePopover}
            />
          </div>
        </div>
      );
      if (!tracksOpen) continue;
      for (const trackRef of clip.tracks ?? []) {
        const track = stat.tracks.find((candidate) => candidate.prop === trackRef.prop);
        if (!track) continue;
        const trackKey = `${clip.key}.${trackRef.prop}`;
        const trackMeta: TimelineClipMeta = {
          key: trackKey,
          label: `${clip.label} · ${formatLabel(trackRef.prop)}`,
          color: clip.color,
          loop: clip.loop,
          group: clip.group,
          stepKeys: trackRef.stepKeys,
        };
        result.push(
          <div class="dialkit-timeline-row dialkit-timeline-track-row" data-grouped={clip.group ? '' : undefined}>
            <div class="dialkit-timeline-label">{formatLabel(trackRef.prop)}</div>
            <div class="dialkit-timeline-lane">
              <TimelineClip
                timelineId={props.meta.id}
                clip={trackMeta}
                at={stat.at + track.delay}
                duration={track.duration}
                loop={stat.loop}
                steps={trackRef.stepKeys?.length ? track.steps : undefined}
                fixedDuration={!trackRef.stepKeys?.length && track.steps[0]?.isPhysics === true}
                baseAt={stat.at}
                delayMode
                pxPerSecond={pxPerSecond()}
                viewStart={safeViewStart()}
                timelineDuration={props.meta.duration}
                selected={popover()?.clip.key === trackKey}
                selectedStepKey={popover()?.clip.key === trackKey ? popover()?.stepKey : undefined}
                onClick={openClipPopover}
                onDrag={closePopover}
              />
            </div>
          </div>
        );
      }
    }
    return result;
  });

  return (
    <div ref={sectionRef} class="dialkit-timeline-section" onKeyDown={(event) => handleTimelineSpaceKey(event, props.meta.id)}>
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
            aria-label={open() ? 'Collapse timeline' : 'Expand timeline'}
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
          onPointerMove={(event) => trackScrub && seekTrack(event.clientX)}
          onPointerUp={finishTrack}
          onPointerCancel={finishTrack}
          onLostPointerCapture={finishTrack}
        >
          <div class="dialkit-timeline-grid">
            <div class="dialkit-timeline-row dialkit-timeline-ruler-row">
              <div class="dialkit-timeline-label" />
              <div
                ref={laneAreaRef}
                class="dialkit-timeline-ruler"
                onPointerDown={handleRulerPointerDown}
                onPointerMove={handleRulerPointerMove}
                onPointerUp={finishRuler}
                onPointerCancel={finishRuler}
                onLostPointerCapture={finishRuler}
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
            {rows()}
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
                onReveal={centerViewAt}
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
          />
        )}
      </Show>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
}) {
  let ref: HTMLDivElement | undefined;
  const [naturalHeight, setNaturalHeight] = createSignal(0);
  const [viewport, setViewport] = createSignal(readViewport());

  onMount(() => {
    const measure = () => ref && setNaturalHeight(ref.scrollHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    if (ref) observer.observe(ref.querySelector('.dialkit-timeline-popover-body') ?? ref);
    const updateViewport = () => setViewport(readViewport());
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (ref?.contains(target) || target.closest?.('.dialkit-timeline-clip') || target.closest?.('.dialkit-timeline-label')) return;
      props.onClose();
    };
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    document.addEventListener('pointerdown', outside, true);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      document.removeEventListener('pointerdown', outside, true);
    });
  });

  createEffect(on(
    () => [props.popover.clip.key, props.popover.stepKey],
    () => { if (ref) onCleanup(observeClipPopover(ref, props.onClose)); }
  ));

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
            ref={ref}
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
              <button class="dialkit-timeline-popover-close" onClick={props.onClose} title="Close editor" aria-label="Close editor">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
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

function TimelineClip(props: {
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
}) {
  let drag: DragState | null = null;
  const [dragging, setDragging] = createSignal(false);
  const isSteps = () => Boolean(props.steps?.length);

  const handlePointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (event.shiftKey) return;
    event.stopPropagation();
    const target = event.target as HTMLElement;
    let mode: DragState['mode'] = 'move';
    let boundaryIndex: number | undefined;
    if (target.dataset.boundary !== undefined) {
      mode = 'boundary';
      boundaryIndex = Number(target.dataset.boundary);
    } else if (!props.fixedDuration) {
      const edge = target.dataset.edge as 'start' | 'end' | undefined;
      if (edge) mode = edge;
    }
    drag = {
      mode,
      boundaryIndex,
      pointerX: event.clientX,
      at: props.at,
      duration: props.duration,
      stepDurations: props.steps?.map((step) => step.duration),
      clickEl: target.closest?.('[data-step]'),
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!drag || props.pxPerSecond <= 0) return;
    const dx = event.clientX - drag.pointerX;
    if (!drag.moved) {
      if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      setDragging(true);
      props.onDrag();
    }
    const dt = dx / props.pxPerSecond;
    const baseAt = props.baseAt ?? 0;
    if (drag.mode === 'boundary' && props.steps && drag.stepDurations) {
      const index = drag.boundaryIndex ?? 0;
      const others = drag.stepDurations.reduce((sum, duration, stepIndex) => stepIndex === index ? sum : sum + duration, 0);
      DialStore.updateValue(
        props.timelineId,
        `${props.clip.key}.${props.steps[index].key ?? ''}.duration`,
        clampStepResize(drag.stepDurations[index] + dt, drag.at, others, props.timelineDuration)
      );
    } else if (drag.mode === 'move') {
      if (props.delayMode) {
        DialStore.updateValue(
          props.timelineId,
          `${props.clip.key}.delay`,
          clampTrackDelay(drag.at + dt - baseAt, baseAt, drag.duration, props.timelineDuration)
        );
      } else {
        DialStore.updateValue(props.timelineId, `${props.clip.key}.at`, clampClipMove(drag.at + dt, drag.duration, props.timelineDuration));
      }
    } else if (drag.mode === 'end') {
      DialStore.updateValue(
        props.timelineId,
        `${props.clip.key}.duration`,
        clampClipResizeEnd(drag.duration + dt, drag.at, props.timelineDuration)
      );
    } else if (props.steps && drag.stepDurations) {
      const next = clampClipResizeStart(Math.max(drag.at + dt, Math.max(baseAt, 0)), drag.at, drag.stepDurations[0]);
      DialStore.updateValues(props.timelineId, {
        [props.delayMode ? `${props.clip.key}.delay` : `${props.clip.key}.at`]: props.delayMode ? Math.max(0, next.at - baseAt) : next.at,
        [`${props.clip.key}.${props.steps[0].key ?? ''}.duration`]: next.duration,
      });
    } else {
      const next = clampClipResizeStart(Math.max(drag.at + dt, Math.max(baseAt, 0)), drag.at, drag.duration);
      DialStore.updateValues(props.timelineId, {
        [props.delayMode ? `${props.clip.key}.delay` : `${props.clip.key}.at`]: props.delayMode ? Math.max(0, next.at - baseAt) : next.at,
        [`${props.clip.key}.duration`]: next.duration,
      });
    }
  };

  const finish = (event?: PointerEvent & { currentTarget: HTMLDivElement }) => {
    const previous = drag;
    drag = null;
    setDragging(false);
    if (previous && !previous.moved && event) {
      const anchor = previous.clickEl ?? event.currentTarget;
      props.onClick(props.clip, anchor.getBoundingClientRect(), previous.clickEl?.dataset.step);
    }
  };

  const handleKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    handleTimelineClipKey(
      event,
      props.timelineId,
      {
        key: props.clip.key,
        label: props.clip.label,
        at: props.at,
        duration: props.duration,
        timelineDuration: props.timelineDuration,
        baseAt: props.baseAt,
        delayMode: props.delayMode,
        fixedDuration: props.fixedDuration || props.composite,
        steps: props.steps,
      },
      (element, stepKey) => props.onClick(props.clip, element.getBoundingClientRect(), stepKey)
    );
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
      <For each={ghostCycles()}>{(cycle) => (
        <div
          class="dialkit-timeline-clip-ghost"
          data-steps={isSteps() || undefined}
          aria-hidden="true"
          style={{
            left: `${(cycle.start - props.viewStart) * props.pxPerSecond + 1}px`,
            width: `${Math.max(1, cycle.duration * props.pxPerSecond - 2)}px`,
            background: props.clip.color,
          }}
        >
          <For each={props.steps}>{(step) => <span class="dialkit-timeline-clip-ghost-segment" style={{ width: `${step.duration * props.pxPerSecond}px` }} />}</For>
        </div>
      )}</For>
      <div
        class="dialkit-timeline-clip"
        data-clip={props.clip.key}
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
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={() => finish()}
        onLostPointerCapture={() => finish()}
        onKeyDown={handleKeyDown}
        role={isSteps() ? undefined : 'button'}
        tabIndex={isSteps() ? undefined : 0}
        aria-label={isSteps() ? undefined : clipAccessibleName(props.clip.label, props.at, props.duration)}
        aria-expanded={props.composite ? props.expanded : undefined}
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
            <For each={props.steps}>{(step) => {
              const segmentWidth = () => step.duration * props.pxPerSecond;
              return (
                <div
                  class="dialkit-timeline-clip-segment"
                  data-step={step.key ?? undefined}
                  data-selected={props.selectedStepKey === step.key || undefined}
                  role="button"
                  tabIndex={0}
                  aria-label={clipAccessibleName(`${props.clip.label} · ${formatStepLabel(step.key ?? '')}`, props.at + step.offset, step.duration)}
                  style={{ width: `${segmentWidth()}px` }}
                >
                  <Show when={segmentWidth() > 52}><span class="dialkit-timeline-clip-duration">{formatSeconds(step.duration)}</span></Show>
                </div>
              );
            }}</For>
            <For each={props.steps}>{(step, index) => (
              <Show when={!step.isPhysics}>
                <div
                  class="dialkit-timeline-clip-handle"
                  data-boundary={index()}
                  style={{ left: `${boundaries()[index()] * props.pxPerSecond - 4}px` }}
                />
              </Show>
            )}</For>
            <Show when={!props.steps?.[0]?.isPhysics}><div class="dialkit-timeline-clip-handle" data-edge="start" /></Show>
          </Show>
        </Show>
      </div>
      <Show when={looping()}><span class="dialkit-timeline-loop-infinity" aria-hidden="true" title="Repeats indefinitely">∞</span></Show>
    </>
  );
}
