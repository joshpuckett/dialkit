import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DialStore, formatLabel } from '../../store/DialStore';
import type { ControlMeta, DialValue } from '../../store/DialStore';
import { TimelineStore } from '../../store/TimelineStore';
import type { TimelineClipMeta, TimelineMeta } from '../../store/TimelineStore';
import { TimelineUiStore } from '../../store/TimelineUiStore';
import {
  clampClipMove,
  clampClipResizeEnd,
  clampClipResizeStart,
  clampStepResize,
  clampTrackDelay,
  clipAccessibleName,
  dockResizeKeyHeight,
  formatClock,
  formatSeconds,
  formatStepLabel,
  computeClipStaticFromValues,
  handlePlayheadKey,
  handleTimelineClipKey,
  handleTimelineSpaceKey,
  normalizeTimelineValuesForCopy,
  observeClipPopover,
  playheadValueText,
  TIMELINE_MIN_CLIP_DURATION,
  timelinePopoverDisplayValues,
} from '../../timeline-core';
import type { TimelineClipLoop, TimelineStepStatic } from '../../timeline-core';
import { clamp } from '../../transition-math';
import { buildCopyInstruction } from '../../copy-instruction';
import { isDevDefault } from '../../env';
import { ICON_CHEVRON, ICON_CHECK, ICON_CLIPBOARD_PLAIN, ICON_PAUSE, ICON_PLAY, ICON_REPLAY } from '../../icons';
import { findControl } from '../../shortcut-utils';
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

const subscribeGlobalTimelines = (callback: () => void) => TimelineStore.subscribeGlobal(callback);
const getTimelines = () => TimelineStore.getTimelines();
const subscribeTimelineVisibility = (callback: () => void) => TimelineUiStore.subscribe(callback);
const getTimelineVisibility = () => TimelineUiStore.getVisible();

export interface DialTimelineProps {
  theme?: DialTheme;
  /** Initial dock visibility. Expansion is controlled separately by defaultOpen. */
  defaultVisible?: boolean;
  /** Controlled dock visibility. */
  visible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  defaultOpen?: boolean;
  productionEnabled?: boolean;
}

// Memoized: hosts that bind `current` re-render every frame, and the dock
// must not reconcile with them — only its transport leaves tick.
// The production gate is a hook-free wrapper so its conditional return can
// never change hook order in the component that actually uses hooks.
export const DialTimeline = memo(function DialTimeline({
  theme = 'system',
  defaultVisible = true,
  visible,
  onVisibilityChange,
  defaultOpen = true,
  productionEnabled = isDevDefault,
}: DialTimelineProps) {
  if (!productionEnabled) return null;
  return (
    <DialTimelineDock
      theme={theme}
      defaultVisible={defaultVisible}
      visible={visible}
      onVisibilityChange={onVisibilityChange}
      defaultOpen={defaultOpen}
    />
  );
});

function DialTimelineDock({
  theme,
  defaultVisible,
  visible,
  onVisibilityChange,
  defaultOpen,
}: {
  theme: DialTheme;
  defaultVisible: boolean;
  visible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  defaultOpen: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [dockMaxHeight, setDockMaxHeight] = useState(DEFAULT_DOCK_MAX_HEIGHT);
  const visibilityControllerId = useRef(Symbol('dialkit-timeline-visibility'));
  const dockRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => TimelineUiStore.registerController(visibilityControllerId.current, {
    visible,
    defaultVisible,
    onVisibilityChange,
  }), []);

  useEffect(() => {
    TimelineUiStore.updateController(visibilityControllerId.current, {
      visible,
      defaultVisible,
      onVisibilityChange,
    });
  }, [defaultVisible, onVisibilityChange, visible]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const dock = dockRef.current;
    if (!dock) return;
    e.preventDefault();
    e.stopPropagation();
    resizeCleanupRef.current?.();

    const pointerY = e.clientY;
    const startHeight = dock.getBoundingClientRect().height;
    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const viewportMax = Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24);
      setDockMaxHeight(clamp(startHeight + pointerY - event.clientY, MIN_DOCK_MAX_HEIGHT, viewportMax));
    };
    const finishResize = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      resizeCleanupRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
    resizeCleanupRef.current = finishResize;
  }, []);

  const handleResizeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const viewportMax = Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24);
    const next = dockResizeKeyHeight(e.key, dockMaxHeight, MIN_DOCK_MAX_HEIGHT, viewportMax, e.shiftKey);
    if (next === undefined) return;
    e.preventDefault();
    setDockMaxHeight(next);
  }, [dockMaxHeight]);

  const timelines = useSyncExternalStore(subscribeGlobalTimelines, getTimelines, getTimelines);
  const dockVisible = useSyncExternalStore(
    subscribeTimelineVisibility,
    getTimelineVisibility,
    getTimelineVisibility
  );

  if (!mounted || typeof window === 'undefined' || timelines.length === 0) {
    return null;
  }

  const resizeMax = Math.max(MIN_DOCK_MAX_HEIGHT, window.innerHeight - 24);

  return createPortal(
    <div className="dialkit-root dialkit-timeline" data-theme={theme} hidden={!dockVisible}>
      <div
        className="dialkit-timeline-resize-handle"
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        role="separator"
        tabIndex={0}
        aria-label="Resize timeline height"
        aria-orientation="horizontal"
        aria-valuemin={MIN_DOCK_MAX_HEIGHT}
        aria-valuemax={resizeMax}
        aria-valuenow={Math.round(Math.min(dockMaxHeight, resizeMax))}
        title="Drag to resize timeline"
      />
      <div
        ref={dockRef}
        className="dialkit-timeline-dock"
        style={{ maxHeight: `min(${dockMaxHeight}px, calc(100vh - 24px))` }}
      >
        {timelines.map((timeline) => (
          <TimelineSection
            key={timeline.id}
            meta={timeline}
            defaultOpen={defaultOpen}
            theme={theme}
            dockVisible={dockVisible}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}

// ── Transport leaves ──
// The 60Hz clock is consumed only by these leaf components (and the per-clip
// active flag), each with a snapshot that changes identity exactly as often
// as its output — the section itself stays static during playback.

function useTransportSubscribe(id: string) {
  return useCallback((callback: () => void) => TimelineStore.subscribe(id, callback), [id]);
}

function PlayPauseButton({ id }: { id: string }) {
  const subscribe = useTransportSubscribe(id);
  // Boolean snapshot: re-renders only when play state flips
  const getPlaying = useCallback(() => TimelineStore.getTransport(id).playing, [id]);
  const playing = useSyncExternalStore(subscribe, getPlaying, getPlaying);

  return (
    <motion.button
      className="dialkit-toolbar-add"
      onClick={() => (playing ? TimelineStore.pause(id) : TimelineStore.play(id))}
      title={playing ? 'Pause' : 'Play'}
      aria-label={playing ? 'Pause' : 'Play'}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
    >
      <span style={{ position: 'relative', width: 16, height: 16 }}>
        <AnimatePresence initial={false} mode="wait">
          {playing ? (
            <motion.svg
              key="pause"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: 16, height: 16, color: 'var(--dial-text-label)' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.08 }}
            >
              {ICON_PAUSE.map((d, i) => <path key={i} d={d} fill="currentColor" />)}
            </motion.svg>
          ) : (
            <motion.svg
              key="play"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: 16, height: 16, color: 'var(--dial-text-label)' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.08 }}
            >
              <path d={ICON_PLAY} fill="currentColor" />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  );
}

function ReplayButton({ onReplay }: { onReplay: () => void }) {
  return (
    <motion.button
      className="dialkit-toolbar-add"
      onClick={onReplay}
      title="Replay"
      aria-label="Replay"
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {ICON_REPLAY.map((d, i) => <path key={i} d={d} fill="currentColor" />)}
      </svg>
    </motion.button>
  );
}

function TimelinePlayheadFlag({
  id,
  duration,
  pxPerSecond,
  viewStart,
  viewEnd,
  laneWidth,
  rulerRef,
  onResetView,
  onReveal,
}: {
  id: string;
  duration: number;
  pxPerSecond: number;
  viewStart: number;
  viewEnd: number;
  laneWidth: number;
  rulerRef: React.RefObject<HTMLDivElement>;
  onResetView: () => void;
  onReveal: (time: number) => void;
}) {
  const subscribe = useTransportSubscribe(id);
  const getTime = useCallback(() => TimelineStore.getTransport(id).time, [id]);
  const time = useSyncExternalStore(subscribe, getTime, getTime);
  const scrubRef = useRef<{
    wasPlaying: boolean;
    rect: DOMRect;
    viewStart: number;
    viewEnd: number;
  } | null>(null);
  const cleanupScrubRef = useRef<(() => void) | null>(null);

  const seekFromClientX = useCallback((clientX: number) => {
    const rect = scrubRef.current?.rect;
    const scrub = scrubRef.current;
    const contentWidth = rect?.width ?? 0;
    if (!rect || !scrub || contentWidth <= 0) return;
    const nextTime = clamp(
      scrub.viewStart + ((clientX - rect.left) / contentWidth) * (scrub.viewEnd - scrub.viewStart),
      scrub.viewStart,
      scrub.viewEnd
    );
    TimelineStore.seek(id, nextTime);
  }, [id]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    cleanupScrubRef.current?.();
    const resetView = e.shiftKey;
    scrubRef.current = {
      wasPlaying: TimelineStore.getTransport(id).playing,
      rect,
      viewStart: resetView ? 0 : viewStart,
      viewEnd: resetView ? duration : viewEnd,
    };
    if (resetView) onResetView();
    TimelineStore.pause(id);
    seekFromClientX(e.clientX);

    const handleWindowPointerMove = (event: PointerEvent) => {
      event.preventDefault();
      seekFromClientX(event.clientX);
    };
    const finishWindowScrub = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', finishWindowScrub);
      window.removeEventListener('pointercancel', finishWindowScrub);
      if (scrubRef.current?.wasPlaying) TimelineStore.play(id);
      scrubRef.current = null;
      cleanupScrubRef.current = null;
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', finishWindowScrub);
    window.addEventListener('pointercancel', finishWindowScrub);
    cleanupScrubRef.current = finishWindowScrub;
  }, [duration, id, onResetView, rulerRef, seekFromClientX, viewEnd, viewStart]);

  useEffect(() => () => cleanupScrubRef.current?.(), []);

  // Keep a keyboard-scrubbed playhead in view so it keeps focus when zoomed.
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    handlePlayheadKey(e, id, (next) => {
      if (next < viewStart || next > viewEnd) onReveal(next);
    });
  }, [id, onReveal, viewEnd, viewStart]);

  if (time < viewStart || time > viewEnd || laneWidth <= 0) return null;

  const x = clamp(
    (time - viewStart) * pxPerSecond,
    0,
    laneWidth
  );
  const flagCenter = clamp(
    x,
    PLAYHEAD_FLAG_WIDTH / 2 - PLAYHEAD_FLAG_EDGE_OVERHANG,
    laneWidth - PLAYHEAD_FLAG_WIDTH / 2 + PLAYHEAD_FLAG_EDGE_OVERHANG
  );
  const flagOffset = flagCenter - x;
  const edge = flagOffset > 0.5 ? 'start' : flagOffset < -0.5 ? 'end' : 'center';

  return (
    <div
      className="dialkit-timeline-playhead-control"
      data-edge={edge}
      style={{
        left: `calc(var(--dial-timeline-label-w) + ${x}px)`,
        '--dial-timeline-playhead-flag-offset': `${flagOffset}px`,
      } as CSSProperties}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      role="slider"
      tabIndex={0}
      aria-label="Timeline current time"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
      aria-valuetext={playheadValueText(time, duration)}
      title="Drag to scrub the timeline"
    >
      <div className="dialkit-timeline-playhead-stem" />
      <div className="dialkit-timeline-playhead-anchor">
        <div className="dialkit-timeline-playhead-flag">{time.toFixed(2)}</div>
      </div>
    </div>
  );
}

function TimelineOverview({
  id,
  duration,
  viewStart,
  viewEnd,
  onNavigate,
}: {
  id: string;
  duration: number;
  viewStart: number;
  viewEnd: number;
  onNavigate: (time: number) => void;
}) {
  const subscribe = useTransportSubscribe(id);
  const getTime = useCallback(() => TimelineStore.getTransport(id).time, [id]);
  const time = useSyncExternalStore(subscribe, getTime, getTime);
  const scrubRef = useRef<{ wasPlaying: boolean; rect: DOMRect } | null>(null);

  const seekFromClientX = useCallback((clientX: number) => {
    const rect = scrubRef.current?.rect;
    if (!rect || rect.width <= 0 || duration <= 0) return;
    const nextTime = clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
    TimelineStore.seek(id, nextTime);
    onNavigate(nextTime);
  }, [duration, id, onNavigate]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubRef.current = {
      wasPlaying: TimelineStore.getTransport(id).playing,
      rect: e.currentTarget.getBoundingClientRect(),
    };
    TimelineStore.pause(id);
    seekFromClientX(e.clientX);
  }, [id, seekFromClientX]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubRef.current) seekFromClientX(e.clientX);
  }, [seekFromClientX]);

  const finishScrub = useCallback(() => {
    if (scrubRef.current?.wasPlaying) TimelineStore.play(id);
    scrubRef.current = null;
  }, [id]);

  const viewportLeft = duration > 0 ? (viewStart / duration) * 100 : 0;
  const viewportWidth = duration > 0 ? ((viewEnd - viewStart) / duration) * 100 : 100;
  const playheadLeft = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div
      className="dialkit-timeline-overview"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishScrub}
      onPointerCancel={finishScrub}
      onLostPointerCapture={finishScrub}
      title="Drag to scrub the full timeline"
    >
      <div
        className="dialkit-timeline-overview-viewport"
        data-zoomed={viewportWidth < 99.999 || undefined}
        style={{ left: `${viewportLeft}%`, width: `${viewportWidth}%` }}
      />
      <div className="dialkit-timeline-overview-progress" style={{ width: `${playheadLeft}%` }} />
      <div className="dialkit-timeline-overview-playhead" style={{ left: `${playheadLeft}%` }} />
    </div>
  );
}

// ── Section ──

type PopoverState = {
  clip: TimelineClipMeta;
  /** Set when the popover edits one leg of a sequence. */
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

const TimelineSection = memo(function TimelineSection({
  meta,
  defaultOpen,
  theme,
  dockVisible,
}: {
  meta: TimelineMeta;
  defaultOpen: boolean;
  theme: DialTheme;
  dockVisible: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);

  const subscribeValues = useCallback(
    (callback: () => void) => DialStore.subscribe(meta.id, callback),
    [meta.id]
  );
  const getValues = useCallback(() => DialStore.getValues(meta.id), [meta.id]);
  const values = useSyncExternalStore(subscribeValues, getValues, getValues);
  const presets = DialStore.getPresets(meta.id);
  const activePresetId = DialStore.getActivePresetId(meta.id);

  // Measure the shared ruler/track span so seconds map to pixels.
  const laneAreaRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(0);

  useLayoutEffect(() => {
    if (!open) return;
    const ruler = laneAreaRef.current;
    if (!ruler) return;
    const measure = () => {
      setLaneWidth(ruler.getBoundingClientRect().width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ruler);
    return () => observer.disconnect();
  }, [open]);

  const visibleDuration = meta.duration > 0 ? meta.duration / zoom : meta.duration;
  const safeViewStart = clampViewStart(viewStart, meta.duration, visibleDuration);
  const viewEnd = safeViewStart + visibleDuration;
  const pxPerSecond = visibleDuration > 0 && laneWidth > 0 ? laneWidth / visibleDuration : 0;
  const millisecondReadableZoom = laneWidth > 0 && meta.duration > 0
    ? (MAJOR_TICK_TARGET_PX * meta.duration) / (MILLISECOND_STEP * 10 * laneWidth)
    : MIN_TIMELINE_MAX_ZOOM;
  const maxZoom = Math.max(MIN_TIMELINE_MAX_ZOOM, millisecondReadableZoom);

  useEffect(() => {
    setZoom((current) => clamp(current, 1, maxZoom));
  }, [maxZoom]);

  useEffect(() => {
    setViewStart((current) => clampViewStart(current, meta.duration, meta.duration / zoom));
  }, [meta.duration, zoom]);

  useLayoutEffect(() => {
    const scroller = horizontalScrollRef.current;
    if (!scroller || pxPerSecond <= 0) return;
    const nextScrollLeft = safeViewStart * pxPerSecond;
    if (Math.abs(scroller.scrollLeft - nextScrollLeft) > 0.5) {
      scroller.scrollLeft = nextScrollLeft;
    }
  }, [open, pxPerSecond, safeViewStart]);

  useEffect(() => {
    if (!dockVisible) setPopover(null);
  }, [dockVisible]);

  const centerViewAt = useCallback((time: number) => {
    if (zoom <= 1 || meta.duration <= 0) return;
    const windowDuration = meta.duration / zoom;
    setViewStart(clampViewStart(time - windowDuration / 2, meta.duration, windowDuration));
  }, [meta.duration, zoom]);

  const resetView = useCallback(() => {
    setZoom(1);
    setViewStart(0);
  }, []);

  const handleReplay = useCallback(() => {
    setViewStart(0);
    TimelineStore.replay(meta.id);
  }, [meta.id]);

  const handleHorizontalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (pxPerSecond <= 0) return;
    setViewStart(clampViewStart(
      e.currentTarget.scrollLeft / pxPerSecond,
      meta.duration,
      visibleDuration
    ));
  }, [meta.duration, pxPerSecond, visibleDuration]);

  const handleTimelineWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const scroller = horizontalScrollRef.current;
    if (!scroller || zoom <= 1) return;
    const horizontalDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      ? e.deltaX
      : e.shiftKey
        ? e.deltaY
        : 0;
    if (horizontalDelta === 0) return;
    e.preventDefault();
    scroller.scrollLeft += horizontalDelta;
  }, [zoom]);

  // Dragging scrubs. Option/Alt-drag preserves detailed zooming, while
  // Shift-drag first restores the full 1x range.
  const zoomDragRef = useRef<ZoomDragState | null>(null);
  const rulerScrubRef = useRef<{
    wasPlaying: boolean;
    rect: DOMRect;
    viewStart: number;
    visibleDuration: number;
  } | null>(null);

  const seekRulerFromClientX = useCallback((clientX: number) => {
    const scrub = rulerScrubRef.current;
    const contentWidth = scrub?.rect.width ?? 0;
    if (!scrub || contentWidth <= 0) return;
    TimelineStore.seek(
      meta.id,
      clamp(
        scrub.viewStart + ((clientX - scrub.rect.left) / contentWidth) * scrub.visibleDuration,
        scrub.viewStart,
        scrub.viewStart + scrub.visibleDuration
      )
    );
  }, [meta.id]);

  const handleRulerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const contentWidth = rect.width;
    if (contentWidth <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (!e.altKey) {
      const resetView = e.shiftKey;
      rulerScrubRef.current = {
        wasPlaying: TimelineStore.getTransport(meta.id).playing,
        rect,
        viewStart: resetView ? 0 : safeViewStart,
        visibleDuration: resetView ? meta.duration : visibleDuration,
      };
      if (resetView) {
        setZoom(1);
        setViewStart(0);
      }
      TimelineStore.pause(meta.id);
      seekRulerFromClientX(e.clientX);
      return;
    }

    const anchorRatio = clamp((e.clientX - rect.left) / contentWidth, 0, 1);
    zoomDragRef.current = {
      pointerX: e.clientX,
      rect,
      zoom,
      viewStart: safeViewStart,
      anchorRatio,
      anchorTime: safeViewStart + anchorRatio * visibleDuration,
      moved: false,
    };
  }, [meta.duration, meta.id, safeViewStart, seekRulerFromClientX, visibleDuration, zoom]);

  const handleRulerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (rulerScrubRef.current) {
      seekRulerFromClientX(e.clientX);
      return;
    }
    const drag = zoomDragRef.current;
    if (!drag || meta.duration <= 0) return;
    const dx = e.clientX - drag.pointerX;
    if (!drag.moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
    drag.moved = true;

    const nextZoom = clamp(drag.zoom * Math.exp(dx / ZOOM_DRAG_DISTANCE), 1, maxZoom);
    const nextVisibleDuration = meta.duration / nextZoom;
    const nextStart = clampViewStart(
      drag.anchorTime - drag.anchorRatio * nextVisibleDuration,
      meta.duration,
      nextVisibleDuration
    );
    setZoom(nextZoom);
    setViewStart(nextStart);
  }, [maxZoom, meta.duration, seekRulerFromClientX]);

  const handleRulerPointerUp = useCallback(() => {
    if (rulerScrubRef.current?.wasPlaying) TimelineStore.play(meta.id);
    rulerScrubRef.current = null;
    zoomDragRef.current = null;
  }, [meta.id]);

  const handleRulerPointerCancel = useCallback(() => {
    if (rulerScrubRef.current?.wasPlaying) TimelineStore.play(meta.id);
    rulerScrubRef.current = null;
    zoomDragRef.current = null;
  }, [meta.id]);

  const trackScrubRef = useRef<{
    wasPlaying: boolean;
    rect: DOMRect;
    viewStart: number;
    visibleDuration: number;
  } | null>(null);

  const seekTrackFromClientX = useCallback((clientX: number) => {
    const scrub = trackScrubRef.current;
    const contentWidth = scrub?.rect.width ?? 0;
    if (!scrub || contentWidth <= 0) return;
    const nextTime = clamp(
      scrub.viewStart + ((clientX - scrub.rect.left) / contentWidth) * scrub.visibleDuration,
      scrub.viewStart,
      scrub.viewStart + scrub.visibleDuration
    );
    TimelineStore.seek(meta.id, nextTime);
  }, [meta.id]);

  const handleTrackPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.dialkit-timeline-label, button')) return;
    if (!e.shiftKey && target.closest('.dialkit-timeline-clip')) return;
    const rect = laneAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const resetView = e.shiftKey;
    trackScrubRef.current = {
      wasPlaying: TimelineStore.getTransport(meta.id).playing,
      rect,
      viewStart: resetView ? 0 : safeViewStart,
      visibleDuration: resetView ? meta.duration : visibleDuration,
    };
    if (resetView) {
      setZoom(1);
      setViewStart(0);
    }
    setPopover(null);
    TimelineStore.pause(meta.id);
    seekTrackFromClientX(e.clientX);
  }, [meta.duration, meta.id, safeViewStart, seekTrackFromClientX, visibleDuration]);

  const handleTrackPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (trackScrubRef.current) seekTrackFromClientX(e.clientX);
  }, [seekTrackFromClientX]);

  const finishTrackScrub = useCallback(() => {
    if (trackScrubRef.current?.wasPlaying) TimelineStore.play(meta.id);
    trackScrubRef.current = null;
  }, [meta.id]);

  const handleCopy = useCallback(() => {
    const normalized = normalizeTimelineValuesForCopy(DialStore.getValues(meta.id), meta.clips);
    navigator.clipboard.writeText(buildCopyInstruction('useDialTimeline', meta.name, normalized));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [meta.clips, meta.id, meta.name]);

  const closePopover = useCallback(() => setPopover(null), []);

  const openClipPopover = useCallback(
    (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => {
      const targetPath = stepKey ? `${clip.key}.${stepKey}` : clip.key;
      const exclude = stepKey ? undefined : clipPopoverExclusions(clip);
      // Guard clips whose folder has not registered yet.
      if (getClipControls(meta.id, targetPath, exclude).length === 0) return;
      setPopover((prev) =>
        prev?.clip.key === clip.key && prev?.stepKey === stepKey
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
            }
      );
    },
    [meta.id]
  );

  const toggleTracks = useCallback((clipKey: string) => {
    setExpandedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(clipKey)) next.delete(clipKey);
      else next.add(clipKey);
      return next;
    });
  }, []);

  // A props clip's bar is a read-only composite — clicking it expands the
  // tracks instead of opening an editor.
  const handleBarClick = useCallback(
    (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => {
      if (!stepKey && clip.tracks?.length) {
        toggleTracks(clip.key);
        return;
      }
      openClipPopover(clip, rect, stepKey);
    },
    [openClipPopover, toggleTracks]
  );

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Ruler ticks
  const rawStep = pxPerSecond > 0 ? MAJOR_TICK_TARGET_PX / pxPerSecond : 1;
  const adaptiveMajorStep = SECOND_TICK_STEPS.find((step) => step >= rawStep) ?? SECOND_TICK_STEPS[SECOND_TICK_STEPS.length - 1];
  const majorStep = zoom < 1.5 && meta.duration >= 1 ? Math.max(1, adaptiveMajorStep) : adaptiveMajorStep;
  const fineTickStep = majorStep / 10;
  const majorTicks: number[] = [];
  const mediumTicks: number[] = [];
  const fineTicks: number[] = [];
  const firstMajorTick = Math.ceil((safeViewStart - 1e-6) / majorStep) * majorStep;
  for (let t = firstMajorTick; t <= viewEnd + 1e-6; t += majorStep) {
    majorTicks.push(Number(t.toFixed(4)));
  }
  const firstFineIndex = Math.ceil((safeViewStart - 1e-6) / fineTickStep);
  const lastFineIndex = Math.floor((viewEnd + 1e-6) / fineTickStep);
  for (let index = firstFineIndex; index <= lastFineIndex; index++) {
    if (index % 10 === 0) continue;
    const tick = Number((index * fineTickStep).toFixed(6));
    if (index % 5 === 0) mediumTicks.push(tick);
    else fineTicks.push(tick);
  }

  // Rows: clips in config order, grouped clips under a collapsible header,
  // props clips expandable into full per-property track rows.
  const rows: ReactNode[] = [];
  let lastGroup: string | undefined;
  for (const clip of meta.clips) {
    if (clip.group !== lastGroup) {
      lastGroup = clip.group;
      if (clip.group) {
        const group = clip.group;
        const isCollapsed = collapsedGroups.has(group);
        rows.push(
          <div key={`group:${group}`} className="dialkit-timeline-row dialkit-timeline-group-row">
            <div className="dialkit-timeline-label">
              <button
                className="dialkit-timeline-group-toggle"
                data-open={!isCollapsed}
                onClick={() => toggleGroup(group)}
                title={isCollapsed ? 'Expand layer' : 'Collapse layer'}
                aria-label={isCollapsed ? 'Expand layer' : 'Collapse layer'}
                aria-expanded={!isCollapsed}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={ICON_CHEVRON} />
                </svg>
              </button>
              <span>{formatLabel(group)}</span>
            </div>
            <div className="dialkit-timeline-lane" />
          </div>
        );
      }
    }
    if (clip.group && collapsedGroups.has(clip.group)) continue;

    const isProps = Boolean(clip.tracks?.length);
    const tracksOpen = isProps && expandedTracks.has(clip.key);
    const stat = computeClipStaticFromValues(values, clip, meta.duration);

    rows.push(
      <div key={clip.key} className="dialkit-timeline-row" data-grouped={clip.group ? '' : undefined}>
        <div className="dialkit-timeline-label">
          {isProps ? (
            <button
              className="dialkit-timeline-group-toggle"
              data-open={tracksOpen}
              onClick={(e) => {
                e.stopPropagation();
                toggleTracks(clip.key);
              }}
              title={tracksOpen ? 'Collapse properties' : 'Expand properties'}
              aria-label={tracksOpen ? 'Collapse properties' : 'Expand properties'}
              aria-expanded={tracksOpen}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICON_CHEVRON} />
              </svg>
            </button>
          ) : null}
          {clip.label}
        </div>
        <div className="dialkit-timeline-lane">
          <TimelineClip
            timelineId={meta.id}
            clip={clip}
            at={stat.at}
            duration={stat.duration}
            loop={stat.loop}
            steps={clip.stepKeys?.length ? stat.tracks[0]?.steps : undefined}
            fixedDuration={isProps ? true : stat.isPhysics}
            composite={isProps}
            expanded={tracksOpen}
            pxPerSecond={pxPerSecond}
            viewStart={safeViewStart}
            timelineDuration={meta.duration}
            selected={popover?.clip.key === clip.key}
            selectedStepKey={popover?.clip.key === clip.key ? popover.stepKey : undefined}
            onClick={handleBarClick}
            onDrag={closePopover}
          />
        </div>
      </div>
    );

    // Expanded tracks: each property is a full clip row of its own — its
    // values, curve, and duration are all editable; the bar position is the
    // track's delay (its phase offset from the clip's `at`).
    if (tracksOpen) {
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
        rows.push(
          <div
            key={trackKey}
            className="dialkit-timeline-row dialkit-timeline-track-row"
            data-grouped={clip.group ? '' : undefined}
          >
            <div className="dialkit-timeline-label">{formatLabel(trackRef.prop)}</div>
            <div className="dialkit-timeline-lane">
              <TimelineClip
                timelineId={meta.id}
                clip={trackMeta}
                at={stat.at + track.delay}
                duration={track.duration}
                loop={stat.loop}
                steps={trackRef.stepKeys?.length ? track.steps : undefined}
                fixedDuration={!trackRef.stepKeys?.length && track.steps[0]?.isPhysics === true}
                baseAt={stat.at}
                delayMode
                pxPerSecond={pxPerSecond}
                viewStart={safeViewStart}
                timelineDuration={meta.duration}
                selected={popover?.clip.key === trackKey}
                selectedStepKey={popover?.clip.key === trackKey ? popover.stepKey : undefined}
                onClick={openClipPopover}
                onDrag={closePopover}
              />
            </div>
          </div>
        );
      }
    }
  }

  return (
    <div className="dialkit-timeline-section" onKeyDown={(e) => handleTimelineSpaceKey(e, meta.id)}>
      <div className="dialkit-timeline-header" data-open={open || undefined}>
        <div className="dialkit-timeline-identity">
          <span className="dialkit-timeline-title">{meta.name}</span>
        </div>
        {!open && (
          <TimelineOverview
            id={meta.id}
            duration={meta.duration}
            viewStart={safeViewStart}
            viewEnd={viewEnd}
            onNavigate={centerViewAt}
          />
        )}
        <div className="dialkit-timeline-actions">
          <PlayPauseButton id={meta.id} />
          <ReplayButton onReplay={handleReplay} />

          <PresetManager
            panelId={meta.id}
            presets={presets}
            activePresetId={activePresetId}
          />
          <motion.button
            className="dialkit-toolbar-add dialkit-toolbar-primary"
            onClick={handleCopy}
            title="Copy parameters"
            aria-label={copied ? 'Copied parameters' : 'Copy parameters'}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
          >
            <span style={{ position: 'relative', width: 16, height: 16 }}>
              <AnimatePresence initial={false} mode="wait">
                {copied ? (
                  <motion.svg
                    key="check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ position: 'absolute', inset: 0, width: 16, height: 16, color: 'inherit' }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.08 }}
                  >
                    <path d={ICON_CHECK} />
                  </motion.svg>
                ) : (
                  <motion.svg
                    key="clipboard"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    style={{ position: 'absolute', inset: 0, width: 16, height: 16, color: 'inherit' }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.08 }}
                  >
                    <path d={ICON_CLIPBOARD_PLAIN.board} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d={ICON_CLIPBOARD_PLAIN.body} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </span>
          </motion.button>
          <button
            className="dialkit-timeline-chevron"
            data-open={open}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            title={open ? 'Collapse timeline' : 'Expand timeline'}
            aria-label={open ? 'Collapse timeline' : 'Expand timeline'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON_CHEVRON} />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div
          className="dialkit-timeline-body"
          onWheel={handleTimelineWheel}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={finishTrackScrub}
          onPointerCancel={finishTrackScrub}
          onLostPointerCapture={finishTrackScrub}
        >
          <div className="dialkit-timeline-grid">
            <div className="dialkit-timeline-row dialkit-timeline-ruler-row">
              <div className="dialkit-timeline-label" />
              <div
                ref={laneAreaRef}
                className="dialkit-timeline-ruler"
                onPointerDown={handleRulerPointerDown}
                onPointerMove={handleRulerPointerMove}
                onPointerUp={handleRulerPointerUp}
                onPointerCancel={handleRulerPointerCancel}
                onLostPointerCapture={handleRulerPointerCancel}
                title="Drag to seek · Option-drag to zoom · Shift-drag to reset zoom"
              >
                {fineTicks.map((t) => (
                  <div key={`fine:${t}`} className="dialkit-timeline-tick dialkit-timeline-tick-fine" style={{ left: (t - safeViewStart) * pxPerSecond }} />
                ))}
                {mediumTicks.map((t) => (
                  <div key={`medium:${t}`} className="dialkit-timeline-tick dialkit-timeline-tick-medium" style={{ left: (t - safeViewStart) * pxPerSecond }} />
                ))}
                {majorTicks.map((t) => (
                  <div key={t} className="dialkit-timeline-tick" style={{ left: (t - safeViewStart) * pxPerSecond }}>
                    <span className="dialkit-timeline-tick-label">{formatRulerSeconds(t, majorStep)}</span>
                  </div>
                ))}
              </div>
            </div>
            {rows}

            {pxPerSecond > 0 && (
              <TimelinePlayheadFlag
                id={meta.id}
                duration={meta.duration}
                pxPerSecond={pxPerSecond}
                viewStart={safeViewStart}
                viewEnd={viewEnd}
                laneWidth={laneWidth}
                rulerRef={laneAreaRef}
                onResetView={resetView}
                onReveal={centerViewAt}
              />
            )}
          </div>
          {zoom > 1 && (
            <div className="dialkit-timeline-scroll-row">
              <div className="dialkit-timeline-label" />
              <div
                ref={horizontalScrollRef}
                className="dialkit-timeline-horizontal-scroll"
                onScroll={handleHorizontalScroll}
                aria-label="Timeline horizontal scroll"
              >
                <div style={{ width: laneWidth * zoom }} />
              </div>
            </div>
          )}
        </div>
      )}

      {popover && (
        <ClipPopover
          panelId={meta.id}
          popover={popover}
          values={values}
          theme={theme}
          onClose={closePopover}
        />
      )}
    </div>
  );
});

// ── Clip popover ──

// Popover anchored above a clip (or one leg of a sequence), reusing the
// standard DialKit controls for the target's transition/from/to values.
// Portaled to <body> because the dock's backdrop-filter creates a containing
// block for fixed positioning.
function ClipPopover({
  panelId,
  popover,
  values,
  theme,
  onClose,
}: {
  panelId: string;
  popover: PopoverState;
  values: Record<string, DialValue>;
  theme: DialTheme;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetLeft: window.visualViewport?.offsetLeft ?? 0,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }));

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setNaturalHeight(element.scrollHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    const body = element.querySelector('.dialkit-timeline-popover-body');
    observer.observe(body ?? element);
    return () => observer.disconnect();
  }, [popover.clip.key, popover.stepKey]);

  useEffect(() => {
    const updateViewport = () => setViewport({
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
      offsetLeft: window.visualViewport?.offsetLeft ?? 0,
      offsetTop: window.visualViewport?.offsetTop ?? 0,
    });
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target)) return;
      // Let clip clicks handle their own toggle/switch
      if (target.closest?.('.dialkit-timeline-clip')) return;
      if (target.closest?.('.dialkit-timeline-label')) return;
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  useEffect(() => {
    const element = ref.current;
    return element ? observeClipPopover(element, onClose) : undefined;
  }, [onClose, popover.clip.key, popover.stepKey]);

  const { clip, stepKey } = popover;
  let controls: ControlMeta[];
  let title: string;
  if (stepKey) {
    controls = getClipControls(panelId, `${clip.key}.${stepKey}`);
    // The first leg starts from the clip's `from` — show it where you edit
    // the leg, just above its targets.
    if (stepKey === clip.stepKeys?.[0]) {
      const from = getControlAt(panelId, `${clip.key}.from`);
      if (from) {
        const toIndex = controls.findIndex((control) => control.path === `${clip.key}.${stepKey}.to`);
        controls = toIndex >= 0
          ? [...controls.slice(0, toIndex), from, ...controls.slice(toIndex)]
          : [...controls, from];
      }
    }
    title = `${clip.label} · ${formatStepLabel(stepKey)}`;
  } else {
    controls = getClipControls(panelId, clip.key, clipPopoverExclusions(clip));
    title = clip.label;
  }
  if (controls.length === 0) return null;

  const targetPath = stepKey ? `${clip.key}.${stepKey}` : clip.key;
  const durationMeta = getControlAt(panelId, `${targetPath}.duration`);
  const durationValue = durationMeta ? values[durationMeta.path] : undefined;
  const transitionDuration = durationMeta?.type === 'slider' && typeof durationValue === 'number'
    ? {
        value: durationValue,
        onChange: (next: number) => DialStore.updateValue(panelId, durationMeta.path, next),
        min: Math.max(TIMELINE_MIN_CLIP_DURATION, durationMeta.min ?? 0),
        max: durationMeta.max,
        step: durationMeta.step,
      }
    : undefined;

  // The bar owns the durations, so show transitions as they actually run:
  // swap in the effective configs (durations injected from the clip/segment
  // lengths) for the visualization while edits still write through.
  const displayValues = timelinePopoverDisplayValues(values, clip.key, clip.stepKeys, stepKey);

  const viewportRight = viewport.offsetLeft + viewport.width;
  const viewportBottom = viewport.offsetTop + viewport.height;
  const popoverWidth = Math.min(POPOVER_WIDTH, Math.max(220, viewport.width - 24));
  const left = clamp(
    popover.anchor.left + popover.anchor.width / 2 - popoverWidth / 2,
    viewport.offsetLeft + 12,
    Math.max(viewport.offsetLeft + 12, viewportRight - popoverWidth - 12)
  );
  const spaceAbove = Math.max(0, popover.anchor.top - viewport.offsetTop - 22);
  const spaceBelow = Math.max(0, viewportBottom - popover.anchor.bottom - 22);
  const placeAbove = naturalHeight === 0
    ? spaceAbove >= spaceBelow
    : naturalHeight <= spaceAbove || (naturalHeight > spaceBelow && spaceAbove >= spaceBelow);
  const availableHeight = placeAbove ? spaceAbove : spaceBelow;
  const renderedHeight = Math.min(naturalHeight || availableHeight, availableHeight);
  const unclampedTop = placeAbove
    ? popover.anchor.top - 10 - renderedHeight
    : popover.anchor.bottom + 10;
  const top = clamp(
    unclampedTop,
    viewport.offsetTop + 12,
    Math.max(viewport.offsetTop + 12, viewportBottom - renderedHeight - 12)
  );

  return createPortal(
    <div className="dialkit-root" data-theme={theme}>
      <div
        ref={ref}
        className="dialkit-timeline-popover"
        data-placement={placeAbove ? 'above' : 'below'}
        style={{
          left,
          top,
          width: popoverWidth,
          maxHeight: availableHeight,
          visibility: naturalHeight > 0 ? 'visible' : 'hidden',
        }}
        role="dialog"
        aria-label={`Edit ${title}`}
      >
        <div className="dialkit-timeline-popover-header">
          <span className="dialkit-timeline-popover-title">{title}</span>
          <button className="dialkit-timeline-popover-close" onClick={onClose} title="Close editor" aria-label="Close editor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="dialkit-timeline-popover-body">
          <ControlRenderer
            panelId={panelId}
            controls={controls}
            values={displayValues}
            transitionDuration={transitionDuration}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// A clip-level popover hides its step folders (each leg has its own popover)
// and its track folders (each track is its own row).
function clipPopoverExclusions(clip: TimelineClipMeta): Set<string> {
  return new Set([
    ...(clip.stepKeys ?? []),
    ...(clip.tracks?.map((track) => track.prop) ?? []),
  ]);
}

// A target's non-timing properties. The timeline bars own clip and segment
// timing, so their start and duration controls stay out of the popover.
function getClipControls(
  panelId: string,
  controlPath: string,
  excludeChildren?: Set<string>
): ControlMeta[] {
  const panel = DialStore.getPanel(panelId);
  const folder = panel ? findControl(panel.controls, controlPath) : null;
  if (!folder?.children) return [];
  return folder.children
    .filter((control) => {
      const childKey = control.path.slice(controlPath.length + 1);
      if (childKey === 'at' || childKey === 'duration') return false;
      return !excludeChildren?.has(childKey);
    });
}

function getControlAt(panelId: string, path: string): ControlMeta | null {
  const panel = DialStore.getPanel(panelId);
  return panel ? findControl(panel.controls, path) : null;
}

// ── Clip bar ──

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

function TimelineClip({
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
}: {
  timelineId: string;
  clip: TimelineClipMeta;
  at: number;
  duration: number;
  loop: TimelineClipLoop;
  steps?: TimelineStepStatic[];
  fixedDuration: boolean;
  /** Read-only composite bar of a props clip — no handles, no editor. */
  composite?: boolean;
  /** Whether a composite's property tracks are expanded. */
  expanded?: boolean;
  /** Track rows: position = baseAt + delay; dragging edits the delay. */
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
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const isSteps = Boolean(steps?.length);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.shiftKey) return;
      e.stopPropagation();
      const target = e.target as HTMLElement;
      let mode: DragState['mode'] = 'move';
      let boundaryIndex: number | undefined;
      const boundary = target.dataset?.boundary;
      if (boundary !== undefined) {
        mode = 'boundary';
        boundaryIndex = Number(boundary);
      } else if (!fixedDuration) {
        const edge = target.dataset?.edge as 'start' | 'end' | undefined;
        if (edge) mode = edge;
      }
      dragRef.current = {
        mode,
        boundaryIndex,
        pointerX: e.clientX,
        at,
        duration,
        stepDurations: steps?.map((step) => step.duration),
        clickEl: target.closest?.('[data-step]') ?? null,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [at, duration, fixedDuration, steps]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || pxPerSecond <= 0) return;

      const dx = e.clientX - drag.pointerX;
      if (!drag.moved) {
        if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        setDragging(true);
        onDrag();
      }

      const dt = dx / pxPerSecond;
      if (drag.mode === 'boundary' && steps && drag.stepDurations) {
        // Trimming a leg ripples the later legs — the bar grows or shrinks.
        const index = drag.boundaryIndex ?? 0;
        const others = drag.stepDurations.reduce((sum, d, j) => (j === index ? sum : sum + d), 0);
        DialStore.updateValue(
          timelineId,
          `${clip.key}.${steps[index].key ?? ''}.duration`,
          clampStepResize(drag.stepDurations[index] + dt, drag.at, others, timelineDuration)
        );
      } else if (drag.mode === 'move') {
        if (delayMode) {
          DialStore.updateValue(
            timelineId,
            `${clip.key}.delay`,
            clampTrackDelay(drag.at + dt - baseAt, baseAt, drag.duration, timelineDuration)
          );
        } else {
          DialStore.updateValue(timelineId, `${clip.key}.at`, clampClipMove(drag.at + dt, drag.duration, timelineDuration));
        }
      } else if (drag.mode === 'end') {
        DialStore.updateValue(
          timelineId,
          `${clip.key}.duration`,
          clampClipResizeEnd(drag.duration + dt, drag.at, timelineDuration)
        );
      } else if (steps && drag.stepDurations) {
        // Start edge of a sequence: trade time between position and the
        // first leg.
        const limit = Math.max(baseAt, 0);
        const next = clampClipResizeStart(Math.max(drag.at + dt, limit), drag.at, drag.stepDurations[0]);
        DialStore.updateValues(timelineId, {
          [delayMode ? `${clip.key}.delay` : `${clip.key}.at`]: delayMode ? Math.max(0, next.at - baseAt) : next.at,
          [`${clip.key}.${steps[0].key ?? ''}.duration`]: next.duration,
        });
      } else {
        const limit = Math.max(baseAt, 0);
        const next = clampClipResizeStart(Math.max(drag.at + dt, limit), drag.at, drag.duration);
        DialStore.updateValues(timelineId, {
          [delayMode ? `${clip.key}.delay` : `${clip.key}.at`]: delayMode ? Math.max(0, next.at - baseAt) : next.at,
          [`${clip.key}.duration`]: next.duration,
        });
      }
    },
    [baseAt, clip.key, delayMode, onDrag, pxPerSecond, steps, timelineId, timelineDuration]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      if (drag && !drag.moved) {
        const stepKey = drag.clickEl?.dataset?.step;
        const anchorEl = drag.clickEl ?? e.currentTarget;
        onClick(clip, anchorEl.getBoundingClientRect(), stepKey);
      }
    },
    [clip, onClick]
  );

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      handleTimelineClipKey(
        e,
        timelineId,
        { key: clip.key, label: clip.label, at, duration, timelineDuration, baseAt, delayMode, fixedDuration: fixedDuration || composite, steps },
        (element, stepKey) => onClick(clip, element.getBoundingClientRect(), stepKey)
      );
    },
    [at, baseAt, clip, composite, delayMode, duration, fixedDuration, onClick, steps, timelineDuration, timelineId]
  );

  const width = Math.max(duration * pxPerSecond, 14);
  const resizable = duration > 0 && !fixedDuration && !composite;
  const durationText = `${fixedDuration && !composite ? '~' : ''}${formatSeconds(duration)}`;
  const looping = loop === 'repeat' && duration > 0;
  const ghostCycles: Array<{ start: number; duration: number; index: number }> = [];
  if (looping) {
    const maxGhostCycles = 256;
    const firstGhostIndex = Math.max(1, Math.floor((viewStart - at) / duration));
    for (let offset = 0; offset < maxGhostCycles; offset++) {
      const index = firstGhostIndex + offset;
      const start = at + duration * index;
      if (start >= timelineDuration - 1e-6) break;
      ghostCycles.push({
        start,
        duration: Math.min(duration, timelineDuration - start),
        index,
      });
    }
  }
  // Boundary handles sit at each leg's right edge (the last one resizes the
  // final leg — the end of the bar).
  const boundaryOffsets: number[] = [];
  if (steps) {
    let cumulative = 0;
    for (const step of steps) {
      cumulative += step.duration;
      boundaryOffsets.push(cumulative);
    }
  }

  const barTitle = composite
    ? `${clip.label} — composite of its property tracks${looping ? ' · repeats through timeline' : ''} · click to expand`
    : `${clip.label} — ${formatSeconds(at)} for ${durationText}${fixedDuration ? ' (duration set by spring physics)' : ''}${looping ? ' · repeats through timeline' : ''}${delayMode ? ' · drag to phase-shift' : ''}`;

  return (
    <>
      {ghostCycles.map((cycle) => {
        const ghostWidth = Math.max(1, cycle.duration * pxPerSecond - 2);
        return (
          <div
            key={`ghost:${cycle.index}`}
            className="dialkit-timeline-clip-ghost"
            data-steps={isSteps || undefined}
            aria-hidden="true"
            style={{
              left: (cycle.start - viewStart) * pxPerSecond + 1,
              width: ghostWidth,
              background: clip.color,
            }}
          >
            {steps?.map((step, stepIndex) => (
              <span
                key={step.key ?? `step:${stepIndex}`}
                className="dialkit-timeline-clip-ghost-segment"
                style={{ width: step.duration * pxPerSecond }}
              />
            ))}
          </div>
        );
      })}
      <div
        className="dialkit-timeline-clip"
        data-clip={clip.key}
        data-steps={isSteps || undefined}
        data-composite={composite || undefined}
        data-selected={selected || undefined}
        data-dragging={dragging || undefined}
        style={{
          left: (at - viewStart) * pxPerSecond,
          width,
          background: composite ? `${clip.color}80` : clip.color,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        onKeyDown={handleKeyDown}
        role={isSteps ? undefined : 'button'}
        tabIndex={isSteps ? undefined : 0}
        aria-label={isSteps ? undefined : clipAccessibleName(clip.label, at, duration)}
        aria-expanded={composite ? expanded : undefined}
        title={barTitle}
      >
        {composite ? (
          <>{width > 56 && <span className="dialkit-timeline-clip-duration">{durationText}</span>}</>
        ) : isSteps ? (
          <>
            {steps!.map((step) => {
              const segmentWidth = step.duration * pxPerSecond;
              return (
                <div
                  key={step.key ?? 'step'}
                  className="dialkit-timeline-clip-segment"
                  data-step={step.key ?? undefined}
                  data-selected={selectedStepKey === step.key || undefined}
                  role="button"
                  tabIndex={0}
                  aria-label={clipAccessibleName(`${clip.label} · ${formatStepLabel(step.key ?? '')}`, at + step.offset, step.duration)}
                  style={{ width: segmentWidth }}
                >
                  {segmentWidth > 52 && (
                    <span className="dialkit-timeline-clip-duration">{formatSeconds(step.duration)}</span>
                  )}
                </div>
              );
            })}
            {steps!.map((step, index) =>
              step.isPhysics ? null : (
                <div
                  key={`boundary:${step.key}`}
                  className="dialkit-timeline-clip-handle"
                  data-boundary={index}
                  style={{ left: boundaryOffsets[index] * pxPerSecond - 4 }}
                />
              )
            )}
            {!steps![0].isPhysics && <div className="dialkit-timeline-clip-handle" data-edge="start" />}
          </>
        ) : (
          <>
            {resizable && <div className="dialkit-timeline-clip-handle" data-edge="start" />}
            {width > 56 && <span className="dialkit-timeline-clip-duration">{durationText}</span>}
            {resizable && <div className="dialkit-timeline-clip-handle" data-edge="end" />}
          </>
        )}
      </div>
      {looping && (
        <span className="dialkit-timeline-loop-infinity" aria-hidden="true" title="Repeats indefinitely">
          ∞
        </span>
      )}
    </>
  );
}
