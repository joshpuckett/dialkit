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
  formatRulerSeconds,
  formatSeconds,
  formatStepLabel,
  computeClipStaticFromValues,
  normalizeTimelineValuesForCopy,
  TIMELINE_MIN_CLIP_DURATION,
  timelinePopoverDisplayValues,
} from '../../timeline-core';
import type { TimelineClipLoop, TimelineStepStatic } from '../../timeline-core';
import { clamp } from '../../transition-math';
import { buildCopyInstruction, copyText } from '../../copy-instruction';
import { clipAnchorRect, isFloatingControlTarget, returnFocusToClip, type AnchorRect } from '../../dropdown-position';
import { startPointerGesture, type StopGesture } from '../../pointer-gesture';
import { clampDockHeight, isTimeInView, pressClipFromKey, resizeDockFromKey, seekFromKey, startClipDrag, startScrubGesture } from '../../timeline/adapter';
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

function useScrubGesture(id: string) {
  const stopRef = useRef<StopGesture | null>(null);
  useEffect(() => () => stopRef.current?.(false), []);
  return useCallback((e: React.PointerEvent, handle: Element | null, seek: (clientX: number) => void) => {
    if (stopRef.current) return false;
    stopRef.current = startScrubGesture(id, e.nativeEvent, handle, seek, () => { stopRef.current = null; });
    return stopRef.current !== null;
  }, [id]);
}

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
  const stopResizeRef = useRef<StopGesture | null>(null);

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

  useEffect(() => () => stopResizeRef.current?.(false), []);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const dock = dockRef.current;
    if (!dock || stopResizeRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const pointerY = e.clientY;
    const startHeight = dock.getBoundingClientRect().height;
    stopResizeRef.current = startPointerGesture(e.nativeEvent, e.currentTarget, {
      move(next) {
        setDockMaxHeight(clampDockHeight(startHeight + pointerY - next.clientY));
      },
      end() { stopResizeRef.current = null; },
    });
  }, []);

  const timelines = useSyncExternalStore(subscribeGlobalTimelines, getTimelines, getTimelines);
  const dockVisible = useSyncExternalStore(
    subscribeTimelineVisibility,
    getTimelineVisibility,
    getTimelineVisibility
  );

  if (!mounted || typeof window === 'undefined' || timelines.length === 0) {
    return null;
  }

  return createPortal(
    <div className="dialkit-root dialkit-timeline" data-theme={theme} hidden={!dockVisible}>
      <div
        className="dialkit-timeline-resize-handle"
        onPointerDown={handleResizePointerDown}
        onKeyDown={(e) => resizeDockFromKey(dockRef.current, e, setDockMaxHeight)}
        tabIndex={0}
        role="separator"
        aria-label="Resize timeline height"
        aria-orientation="horizontal"
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
  onNavigate,
}: {
  id: string;
  duration: number;
  pxPerSecond: number;
  viewStart: number;
  viewEnd: number;
  laneWidth: number;
  rulerRef: React.RefObject<HTMLDivElement>;
  onResetView: () => void;
  onNavigate: (time: number) => void;
}) {
  const subscribe = useTransportSubscribe(id);
  const getTime = useCallback(() => TimelineStore.getTransport(id).time, [id]);
  const time = useSyncExternalStore(subscribe, getTime, getTime);
  const startScrub = useScrubGesture(id);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    const resetView = e.shiftKey;
    const start = resetView ? 0 : viewStart;
    const end = resetView ? duration : viewEnd;
    // No capture: this flag unmounts whenever the playhead leaves the visible range.
    const started = startScrub(e, null, (clientX) => {
      if (rect.width <= 0) return;
      TimelineStore.seek(id, clamp(start + ((clientX - rect.left) / rect.width) * (end - start), start, end));
    });
    if (started && resetView) onResetView();
  }, [duration, id, onResetView, rulerRef, startScrub, viewEnd, viewStart]);

  if (!isTimeInView(time, viewStart, viewEnd, pxPerSecond) || laneWidth <= 0) return null;

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
      onKeyDown={(e) => seekFromKey(id, e, { start: viewStart, end: viewEnd, pxPerSecond, reveal: onNavigate })}
      tabIndex={0}
      role="slider"
      aria-label="Timeline current time"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
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
  const startScrub = useScrubGesture(id);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    startScrub(e, e.currentTarget, (clientX) => {
      if (rect.width <= 0 || duration <= 0) return;
      const nextTime = clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
      TimelineStore.seek(id, nextTime);
      onNavigate(nextTime);
    });
  }, [duration, id, onNavigate, startScrub]);

  const viewportLeft = duration > 0 ? (viewStart / duration) * 100 : 0;
  const viewportWidth = duration > 0 ? ((viewEnd - viewStart) / duration) * 100 : 100;
  const playheadLeft = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div
      className="dialkit-timeline-overview"
      onPointerDown={handlePointerDown}
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
  anchor: AnchorRect;
};

function clampViewStart(start: number, duration: number, visibleDuration: number): number {
  return clamp(start, 0, Math.max(0, duration - visibleDuration));
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

  const syncedScrollLeftRef = useRef(0);

  useLayoutEffect(() => {
    const scroller = horizontalScrollRef.current;
    if (!scroller || pxPerSecond <= 0) return;
    const nextScrollLeft = safeViewStart * pxPerSecond;
    if (Math.abs(scroller.scrollLeft - nextScrollLeft) > 0.5) {
      scroller.scrollLeft = nextScrollLeft;
    }
    syncedScrollLeftRef.current = scroller.scrollLeft;
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
    const { scrollLeft } = e.currentTarget;
    // Scroll events fire a frame after the sync above. A pointer move can have
    // queued a newer view by then, and replaying the old position would undo it.
    if (Math.abs(scrollLeft - syncedScrollLeftRef.current) <= 0.5) return;
    syncedScrollLeftRef.current = scrollLeft;
    setViewStart(clampViewStart(
      scrollLeft / pxPerSecond,
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
  const startRulerScrub = useScrubGesture(meta.id);
  const startTrackScrub = useScrubGesture(meta.id);
  const stopZoomRef = useRef<StopGesture | null>(null);
  useEffect(() => () => stopZoomRef.current?.(false), []);

  const handleRulerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const contentWidth = rect.width;
    if (contentWidth <= 0) return;

    if (!e.altKey) {
      const shouldReset = e.shiftKey;
      const start = shouldReset ? 0 : safeViewStart;
      const span = shouldReset ? meta.duration : visibleDuration;
      const started = startRulerScrub(e, e.currentTarget, (clientX) => {
        TimelineStore.seek(meta.id, clamp(start + ((clientX - rect.left) / contentWidth) * span, start, start + span));
      });
      if (started && shouldReset) resetView();
      return;
    }

    if (stopZoomRef.current) return;
    const pointerX = e.clientX;
    const startZoom = zoom;
    const startView = safeViewStart;
    const anchorRatio = clamp((pointerX - rect.left) / contentWidth, 0, 1);
    const anchorTime = safeViewStart + anchorRatio * visibleDuration;
    let moved = false;
    stopZoomRef.current = startPointerGesture(e.nativeEvent, e.currentTarget, {
      move(next) {
        if (meta.duration <= 0) return;
        const dx = next.clientX - pointerX;
        if (!moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        moved = true;
        const nextZoom = clamp(startZoom * Math.exp(dx / ZOOM_DRAG_DISTANCE), 1, maxZoom);
        const nextVisibleDuration = meta.duration / nextZoom;
        setZoom(nextZoom);
        setViewStart(clampViewStart(anchorTime - anchorRatio * nextVisibleDuration, meta.duration, nextVisibleDuration));
      },
      end(cancelled) {
        stopZoomRef.current = null;
        if (cancelled && moved) {
          setZoom(startZoom);
          setViewStart(startView);
        }
      },
    });
  }, [maxZoom, meta.duration, meta.id, resetView, safeViewStart, startRulerScrub, visibleDuration, zoom]);

  const handleTrackPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.dialkit-timeline-label, .dialkit-timeline-scroll-row, button')) return;
    if (!e.shiftKey && target.closest('.dialkit-timeline-clip')) return;
    const rect = laneAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    const shouldReset = e.shiftKey;
    const start = shouldReset ? 0 : safeViewStart;
    const span = shouldReset ? meta.duration : visibleDuration;
    const started = startTrackScrub(e, e.currentTarget, (clientX) => {
      if (rect.width <= 0) return;
      TimelineStore.seek(meta.id, clamp(start + ((clientX - rect.left) / rect.width) * span, start, start + span));
    });
    if (!started) return;
    if (shouldReset) resetView();
    setPopover(null);
  }, [meta.duration, meta.id, resetView, safeViewStart, startTrackScrub, visibleDuration]);

  const copyTimeout = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimeout.current), []);

  const handleCopy = useCallback(async () => {
    const normalized = normalizeTimelineValuesForCopy(DialStore.getValues(meta.id), meta.clips);
    if (!(await copyText(buildCopyInstruction('useDialTimeline', meta.name, normalized)))) return;
    setCopied(true);
    clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(false), 1500);
  }, [meta.clips, meta.id, meta.name]);

  // The popover closes when its bar is gone: a removed clip, a collapsed row.
  const sectionRef = useRef<HTMLDivElement>(null);
  const popoverClipKey = popover?.clip.key;
  const popoverStepKey = popover?.stepKey;
  useLayoutEffect(() => {
    if (popoverClipKey && !clipAnchorRect(sectionRef.current, popoverClipKey, popoverStepKey)) setPopover(null);
  }, [collapsedGroups, expandedTracks, meta.clips, open, popoverClipKey, popoverStepKey, values]);

  // It follows the bar through zoom, panning, and page scroll. Edits made inside
  // the popover are left out: a bar resizing must not move the slider under the pointer.
  useLayoutEffect(() => {
    if (!popoverClipKey) return;
    const follow = () => {
      const anchor = clipAnchorRect(sectionRef.current, popoverClipKey, popoverStepKey);
      if (anchor) setPopover((current) => current && { ...current, anchor });
    };
    follow();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [popoverClipKey, popoverStepKey, pxPerSecond, safeViewStart]);

  const closePopover = useCallback(() => setPopover(null), []);

  // Escape and the close button hand focus back to the bar. Other closes leave it where the press put it.
  const dismissPopover = useCallback(() => {
    if (popoverClipKey) returnFocusToClip(sectionRef.current, popoverClipKey);
    setPopover(null);
  }, [popoverClipKey]);

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
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
    <div ref={sectionRef} className="dialkit-timeline-section">
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
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
        >
          <div className="dialkit-timeline-grid">
            <div className="dialkit-timeline-row dialkit-timeline-ruler-row">
              <div className="dialkit-timeline-label" />
              <div
                ref={laneAreaRef}
                className="dialkit-timeline-ruler"
                onPointerDown={handleRulerPointerDown}
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
                onNavigate={centerViewAt}
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
          onDismiss={dismissPopover}
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
  onDismiss,
}: {
  panelId: string;
  popover: PopoverState;
  values: Record<string, DialValue>;
  theme: DialTheme;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
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
      if (isFloatingControlTarget(target)) return;
      // Let clip clicks handle their own toggle/switch
      if (target.closest?.('.dialkit-timeline-clip')) return;
      if (target.closest?.('.dialkit-timeline-label')) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onDismiss]);

  // Focus moves in once it has a height: until then it's hidden, and can't take focus.
  const measured = naturalHeight > 0;
  useEffect(() => {
    if (measured) closeRef.current?.focus({ preventScroll: true });
  }, [measured, popover.clip.key, popover.stepKey]);

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
          <button ref={closeRef} className="dialkit-timeline-popover-close" onClick={onDismiss} title="Close editor" aria-label="Close editor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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

function TimelineClip({
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
  const stopRef = useRef<StopGesture | null>(null);
  const [dragging, setDragging] = useState(false);
  const isSteps = Boolean(steps?.length);
  // A drag's handlers outlive the render that started them.
  const latest = useRef({ clip, onClick, onDrag, pxPerSecond, timelineDuration });
  latest.current = { clip, onClick, onDrag, pxPerSecond, timelineDuration };

  useEffect(() => () => stopRef.current?.(false), []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.shiftKey) return;
    e.stopPropagation();
    if (stopRef.current) return;
    stopRef.current = startClipDrag(e.nativeEvent, e.currentTarget, {
      timelineId,
      clipKey: clip.key,
      at,
      duration,
      steps,
      fixedDuration,
      baseAt,
      delayMode,
      getScale: () => latest.current,
      onDragStart: () => {
        setDragging(true);
        latest.current.onDrag();
      },
      onClick: (stepKey, anchor) => latest.current.onClick(latest.current.clip, anchor.getBoundingClientRect(), stepKey),
      onEnd: () => {
        stopRef.current = null;
        setDragging(false);
      },
    });
  };

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
        data-clip-key={clip.key}
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
        onKeyDown={(e) => pressClipFromKey(e, () => onClick(clip, e.currentTarget.getBoundingClientRect()))}
        tabIndex={0}
        role="button"
        aria-label={`Edit ${clip.label}`}
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
