import {
  Teleport,
  computed,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type PropType,
  type VNodeChild,
} from 'vue';
import { DialStore, formatLabel } from '../../../store/DialStore';
import type { ControlMeta, DialValue } from '../../../store/DialStore';
import { TimelineStore } from '../../../store/TimelineStore';
import type { TimelineClipMeta, TimelineMeta } from '../../../store/TimelineStore';
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
import { clampDockHeight, isTimeInView, pressClipFromKey, resizeDockFromKey, seekFromKey, startClipDrag, startScrubGesture, wheelTimeline } from '../../../timeline/adapter';
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

function useScrubGesture(id: () => string) {
  let stop: StopGesture | null = null;
  onUnmounted(() => stop?.(false));
  return (event: PointerEvent, handle: Element | null, seek: (clientX: number) => void) => {
    if (stop) return false;
    stop = startScrubGesture(id(), event, handle, seek, () => { stop = null; });
    return stop !== null;
  };
}

const DialTimelineDock = defineComponent({
  name: 'DialKitTimelineDock',
  props: {
    theme: { type: String as PropType<DialTheme>, required: true },
    defaultVisible: { type: Boolean, required: true },
    visible: {
      type: Boolean as PropType<boolean | undefined>,
      default: undefined,
    },
    onVisibilityChange: Function as PropType<(visible: boolean) => void>,
    defaultOpen: { type: Boolean, required: true },
  },
  setup(props) {
    const timelines = shallowRef<TimelineMeta[]>(TimelineStore.getTimelines());
    const dockVisible = ref(TimelineUiStore.getVisible());
    const mounted = ref(false);
    const dockMaxHeight = ref(DEFAULT_DOCK_MAX_HEIGHT);
    const dockRef = ref<HTMLDivElement | null>(null);
    const controllerId = Symbol('dialkit-timeline-visibility');
    let unsubscribeTimelines: (() => void) | undefined;
    let unsubscribeVisibility: (() => void) | undefined;
    let unregisterController: (() => void) | undefined;
    let stopResize: StopGesture | null = null;

    const handleResizePointerDown = (event: PointerEvent) => {
      const dock = dockRef.value;
      if (!dock || stopResize) return;
      event.preventDefault();
      event.stopPropagation();

      const pointerY = event.clientY;
      const startHeight = dock.getBoundingClientRect().height;
      stopResize = startPointerGesture(event, event.currentTarget as Element, {
        move(next) {
          dockMaxHeight.value = clampDockHeight(startHeight + pointerY - next.clientY);
        },
        end() { stopResize = null; },
      });
    };

    onMounted(() => {
      mounted.value = true;
      unsubscribeVisibility = TimelineUiStore.subscribe(() => {
        dockVisible.value = TimelineUiStore.getVisible();
      });
      unregisterController = TimelineUiStore.registerController(controllerId, {
        visible: props.visible,
        defaultVisible: props.defaultVisible,
        onVisibilityChange: props.onVisibilityChange,
      });
      dockVisible.value = TimelineUiStore.getVisible();
      timelines.value = TimelineStore.getTimelines();
      unsubscribeTimelines = TimelineStore.subscribeGlobal(() => {
        timelines.value = TimelineStore.getTimelines();
      });
    });
    watch(() => [props.visible, props.defaultVisible, props.onVisibilityChange] as const, () => {
      TimelineUiStore.updateController(controllerId, {
        visible: props.visible,
        defaultVisible: props.defaultVisible,
        onVisibilityChange: props.onVisibilityChange,
      });
    });
    onUnmounted(() => {
      unregisterController?.();
      unsubscribeTimelines?.();
      unsubscribeVisibility?.();
      stopResize?.(false);
    });

    return () => {
      if (!mounted.value || timelines.value.length === 0) return null;
      return h(Teleport, { to: 'body' }, [
        h('div', {
          class: 'dialkit-root dialkit-timeline',
          'data-theme': props.theme,
          hidden: !dockVisible.value,
        }, [
          h('div', {
            class: 'dialkit-timeline-resize-handle',
            role: 'separator',
            'aria-label': 'Resize timeline height',
            'aria-orientation': 'horizontal',
            title: 'Drag to resize timeline',
            tabindex: 0,
            onPointerdown: handleResizePointerDown,
            onKeydown: (event: KeyboardEvent) => resizeDockFromKey(dockRef.value, event, (height) => { dockMaxHeight.value = height; }),
          }),
          h('div', {
            ref: dockRef,
            class: 'dialkit-timeline-dock',
            style: { maxHeight: `min(${dockMaxHeight.value}px, calc(100vh - 24px))` },
          }, timelines.value.map((meta) => h(TimelineSection, {
            key: meta.id,
            meta,
            defaultOpen: props.defaultOpen,
            theme: props.theme,
            dockVisible: dockVisible.value,
          }))),
        ]),
      ]);
    };
  },
});

// The production gate is a wrapper, so when it is off nothing registers or
// subscribes: a disabled dock must not count as a mounted one.
export const DialTimeline = defineComponent({
  name: 'DialKitTimeline',
  props: {
    theme: { type: String as PropType<DialTheme>, default: 'system' },
    defaultVisible: { type: Boolean, default: true },
    visible: {
      type: Boolean as PropType<boolean | undefined>,
      default: undefined,
    },
    onVisibilityChange: Function as PropType<(visible: boolean) => void>,
    defaultOpen: { type: Boolean, default: true },
    productionEnabled: { type: Boolean, default: isDevDefault },
  },
  setup(props) {
    return () => props.productionEnabled
      ? h(DialTimelineDock, {
        theme: props.theme,
        defaultVisible: props.defaultVisible,
        visible: props.visible,
        onVisibilityChange: props.onVisibilityChange,
        defaultOpen: props.defaultOpen,
      })
      : null;
  },
});

const PlayPauseButton = defineComponent({
  props: { id: { type: String, required: true } },
  setup(props) {
    const playing = ref(TimelineStore.getTransport(props.id).playing);
    let unsubscribe: (() => void) | undefined;
    onMounted(() => {
      unsubscribe = TimelineStore.subscribe(props.id, () => {
        playing.value = TimelineStore.getTransport(props.id).playing;
      });
    });
    onUnmounted(() => unsubscribe?.());
    return () => {
      const label = playing.value ? 'Pause' : 'Play';
      const icon = playing.value
        ? h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', style: iconStyle },
          ICON_PAUSE.map((path) => h('path', { d: path, fill: 'currentColor' })))
        : h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', style: iconStyle }, [
          h('path', { d: ICON_PLAY, fill: 'currentColor' }),
        ]);
      return h('button', {
        class: 'dialkit-toolbar-add',
        title: label,
        'aria-label': label,
        onClick: () => playing.value ? TimelineStore.pause(props.id) : TimelineStore.play(props.id),
      }, [h('span', { style: { position: 'relative', width: '16px', height: '16px' } }, [icon])]);
    };
  },
});

const ReplayButton = defineComponent({
  props: { onReplay: { type: Function as PropType<() => void>, required: true } },
  setup(props) {
    return () => h('button', {
      class: 'dialkit-toolbar-add',
      title: 'Replay',
      'aria-label': 'Replay',
      onClick: props.onReplay,
    }, [
      h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        ICON_REPLAY.map((path) => h('path', { d: path, fill: 'currentColor' }))),
    ]);
  },
});

const iconStyle = {
  position: 'absolute', inset: 0, width: '16px', height: '16px', color: 'var(--dial-text-label)',
};

const TimelineOverview = defineComponent({
  props: {
    id: { type: String, required: true },
    duration: { type: Number, required: true },
    viewStart: { type: Number, required: true },
    viewEnd: { type: Number, required: true },
    onNavigate: { type: Function as PropType<(time: number) => void>, required: true },
  },
  setup(props) {
    const time = ref(TimelineStore.getTransport(props.id).time);
    const startScrub = useScrubGesture(() => props.id);
    let unsubscribe: (() => void) | undefined;
    onMounted(() => {
      unsubscribe = TimelineStore.subscribe(props.id, () => {
        time.value = TimelineStore.getTransport(props.id).time;
      });
    });
    onUnmounted(() => unsubscribe?.());
    return () => {
      const viewportWidth = props.duration > 0 ? ((props.viewEnd - props.viewStart) / props.duration) * 100 : 100;
      const playhead = props.duration > 0 ? (time.value / props.duration) * 100 : 0;
      return h('div', {
        class: 'dialkit-timeline-overview',
        title: 'Drag to scrub the full timeline',
        onPointerdown: (event: PointerEvent) => {
          event.preventDefault();
          const overview = event.currentTarget as HTMLElement;
          const rect = overview.getBoundingClientRect();
          startScrub(event, overview, (clientX) => {
            if (rect.width <= 0 || props.duration <= 0) return;
            const next = clamp(((clientX - rect.left) / rect.width) * props.duration, 0, props.duration);
            TimelineStore.seek(props.id, next);
            props.onNavigate(next);
          });
        },
      }, [
        h('div', {
          class: 'dialkit-timeline-overview-viewport',
          'data-zoomed': viewportWidth < 99.999 || undefined,
          style: { left: `${props.duration > 0 ? (props.viewStart / props.duration) * 100 : 0}%`, width: `${viewportWidth}%` },
        }),
        h('div', { class: 'dialkit-timeline-overview-progress', style: { width: `${playhead}%` } }),
        h('div', { class: 'dialkit-timeline-overview-playhead', style: { left: `${playhead}%` } }),
      ]);
    };
  },
});

const TimelinePlayheadFlag = defineComponent({
  props: {
    id: { type: String, required: true },
    duration: { type: Number, required: true },
    pxPerSecond: { type: Number, required: true },
    viewStart: { type: Number, required: true },
    viewEnd: { type: Number, required: true },
    laneWidth: { type: Number, required: true },
    ruler: Object as PropType<HTMLDivElement>,
    onResetView: { type: Function as PropType<() => void>, required: true },
    onNavigate: { type: Function as PropType<(time: number) => void>, required: true },
  },
  setup(props) {
    const time = ref(TimelineStore.getTransport(props.id).time);
    const startScrub = useScrubGesture(() => props.id);
    let unsubscribe: (() => void) | undefined;
    onMounted(() => {
      unsubscribe = TimelineStore.subscribe(props.id, () => {
        time.value = TimelineStore.getTransport(props.id).time;
      });
    });
    onUnmounted(() => unsubscribe?.());
    return () => {
      if (!isTimeInView(time.value, props.viewStart, props.viewEnd, props.pxPerSecond) || props.laneWidth <= 0) return null;
      const x = clamp((time.value - props.viewStart) * props.pxPerSecond, 0, props.laneWidth);
      const flagCenter = clamp(
        x,
        PLAYHEAD_FLAG_WIDTH / 2 - PLAYHEAD_FLAG_EDGE_OVERHANG,
        props.laneWidth - PLAYHEAD_FLAG_WIDTH / 2 + PLAYHEAD_FLAG_EDGE_OVERHANG
      );
      const flagOffset = flagCenter - x;
      const edge = flagOffset > 0.5 ? 'start' : flagOffset < -0.5 ? 'end' : 'center';
      return h('div', {
        class: 'dialkit-timeline-playhead-control',
        'data-edge': edge,
        style: {
          left: `calc(var(--dial-timeline-label-w) + ${x}px)`,
          '--dial-timeline-playhead-flag-offset': `${flagOffset}px`,
        },
        tabindex: 0,
        onKeydown: (event: KeyboardEvent) => seekFromKey(props.id, event, {
          start: props.viewStart,
          end: props.viewEnd,
          pxPerSecond: props.pxPerSecond,
          reveal: props.onNavigate,
        }),
        role: 'slider',
        'aria-label': 'Timeline current time',
        'aria-valuemin': 0,
        'aria-valuemax': props.duration,
        'aria-valuenow': time.value,
        title: 'Drag to scrub the timeline',
        onPointerdown: (event: PointerEvent) => {
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
        },
      }, [
        h('div', { class: 'dialkit-timeline-playhead-stem' }),
        h('div', { class: 'dialkit-timeline-playhead-anchor' }, [
          h('div', { class: 'dialkit-timeline-playhead-flag' }, time.value.toFixed(2)),
        ]),
      ]);
    };
  },
});

type PopoverState = {
  clip: TimelineClipMeta;
  stepKey?: string;
  anchor: AnchorRect;
};

function clampViewStart(start: number, duration: number, visibleDuration: number): number {
  return clamp(start, 0, Math.max(0, duration - visibleDuration));
}

const TimelineSection = defineComponent({
  props: {
    meta: { type: Object as PropType<TimelineMeta>, required: true },
    defaultOpen: { type: Boolean, required: true },
    theme: { type: String as PropType<DialTheme>, required: true },
    dockVisible: { type: Boolean, required: true },
  },
  setup(props) {
    const open = ref(props.defaultOpen);
    const copied = ref(false);
    const popover = shallowRef<PopoverState | null>(null);
    const collapsedGroups = ref(new Set<string>());
    const expandedTracks = ref(new Set<string>());
    const zoom = ref(1);
    const viewStart = ref(0);
    const values = shallowRef<Record<string, DialValue>>(DialStore.getValues(props.meta.id));
    const presets = ref(DialStore.getPresets(props.meta.id));
    const activePresetId = ref(DialStore.getActivePresetId(props.meta.id));
    const laneAreaRef = ref<HTMLDivElement | null>(null);
    const horizontalScrollRef = ref<HTMLDivElement | null>(null);
    const laneWidth = ref(0);
    let unsubscribeValues: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const measure = () => {
      if (laneAreaRef.value) laneWidth.value = laneAreaRef.value.getBoundingClientRect().width;
    };
    const connectMeasure = async () => {
      resizeObserver?.disconnect();
      if (!open.value) return;
      await nextTick();
      if (!laneAreaRef.value) return;
      measure();
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(laneAreaRef.value);
    };

    onMounted(() => {
      unsubscribeValues = DialStore.subscribe(props.meta.id, () => {
        values.value = DialStore.getValues(props.meta.id);
        presets.value = DialStore.getPresets(props.meta.id);
        activePresetId.value = DialStore.getActivePresetId(props.meta.id);
      });
      void connectMeasure();
    });
    onUnmounted(() => {
      unsubscribeValues?.();
      resizeObserver?.disconnect();
    });
    watch(open, connectMeasure);
    watch(() => props.dockVisible, (visible) => {
      if (!visible) popover.value = null;
    });

    const visibleDuration = computed(() => props.meta.duration > 0 ? props.meta.duration / zoom.value : props.meta.duration);
    const safeViewStart = computed(() => clampViewStart(viewStart.value, props.meta.duration, visibleDuration.value));
    const viewEnd = computed(() => safeViewStart.value + visibleDuration.value);
    const pxPerSecond = computed(() => visibleDuration.value > 0 && laneWidth.value > 0 ? laneWidth.value / visibleDuration.value : 0);
    const maxZoom = computed(() => Math.max(
      MIN_TIMELINE_MAX_ZOOM,
      laneWidth.value > 0 && props.meta.duration > 0
        ? (MAJOR_TICK_TARGET_PX * props.meta.duration) / (MILLISECOND_STEP * 10 * laneWidth.value)
        : MIN_TIMELINE_MAX_ZOOM
    ));
    watch(maxZoom, (next) => { zoom.value = clamp(zoom.value, 1, next); }, { immediate: true });
    watch([() => props.meta.duration, zoom], () => {
      viewStart.value = clampViewStart(viewStart.value, props.meta.duration, props.meta.duration / zoom.value);
    });
    watch([open, pxPerSecond, safeViewStart], async () => {
      await nextTick();
      const scroller = horizontalScrollRef.value;
      if (!scroller || pxPerSecond.value <= 0) return;
      const next = safeViewStart.value * pxPerSecond.value;
      if (Math.abs(scroller.scrollLeft - next) > 0.5) scroller.scrollLeft = next;
    });

    const centerViewAt = (time: number) => {
      if (zoom.value <= 1 || props.meta.duration <= 0) return;
      const duration = props.meta.duration / zoom.value;
      viewStart.value = clampViewStart(time - duration / 2, props.meta.duration, duration);
    };
    const resetView = () => {
      zoom.value = 1;
      viewStart.value = 0;
    };
    const handleReplay = () => {
      viewStart.value = 0;
      TimelineStore.replay(props.meta.id);
    };
    const handleHorizontalScroll = (event: Event) => {
      if (pxPerSecond.value <= 0) return;
      viewStart.value = clampViewStart(
        (event.currentTarget as HTMLDivElement).scrollLeft / pxPerSecond.value,
        props.meta.duration,
        visibleDuration.value
      );
    };
    const handleTimelineWheel = (event: WheelEvent) => {
      wheelTimeline(event, {
        duration: props.meta.duration,
        maxZoom: maxZoom.value,
        zoom: zoom.value,
        viewStart: safeViewStart.value,
        lane: laneAreaRef.value,
        scroller: horizontalScrollRef.value,
        setView(view) {
          zoom.value = view.zoom;
          viewStart.value = view.viewStart;
        },
      });
    };

    // Dragging scrubs. Option/Alt-drag preserves detailed zooming, while
    // Shift-drag first restores the full 1x range.
    const startRulerScrub = useScrubGesture(() => props.meta.id);
    const startTrackScrub = useScrubGesture(() => props.meta.id);
    let stopZoom: StopGesture | null = null;
    onUnmounted(() => stopZoom?.(false));

    const handleRulerPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const ruler = event.currentTarget as HTMLElement;
      const rect = ruler.getBoundingClientRect();
      if (rect.width <= 0) return;

      if (!event.altKey) {
        const reset = event.shiftKey;
        const start = reset ? 0 : safeViewStart.value;
        const span = reset ? props.meta.duration : visibleDuration.value;
        const started = startRulerScrub(event, ruler, (clientX) => {
          TimelineStore.seek(props.meta.id, clamp(start + ((clientX - rect.left) / rect.width) * span, start, start + span));
        });
        if (started && reset) resetView();
        return;
      }

      if (stopZoom) return;
      const pointerX = event.clientX;
      const startZoom = zoom.value;
      const startView = safeViewStart.value;
      const anchorRatio = clamp((pointerX - rect.left) / rect.width, 0, 1);
      const anchorTime = startView + anchorRatio * visibleDuration.value;
      let moved = false;
      stopZoom = startPointerGesture(event, ruler, {
        move(next) {
          if (props.meta.duration <= 0) return;
          const dx = next.clientX - pointerX;
          if (!moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
          moved = true;
          const nextZoom = clamp(startZoom * Math.exp(dx / ZOOM_DRAG_DISTANCE), 1, maxZoom.value);
          const duration = props.meta.duration / nextZoom;
          zoom.value = nextZoom;
          viewStart.value = clampViewStart(anchorTime - anchorRatio * duration, props.meta.duration, duration);
        },
        end(cancelled) {
          stopZoom = null;
          if (cancelled && moved) {
            zoom.value = startZoom;
            viewStart.value = startView;
          }
        },
      });
    };

    const handleTrackPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.dialkit-timeline-label, .dialkit-timeline-scroll-row, button')) return;
      if (!event.shiftKey && target.closest('.dialkit-timeline-clip')) return;
      const rect = laneAreaRef.value?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      const reset = event.shiftKey;
      const start = reset ? 0 : safeViewStart.value;
      const span = reset ? props.meta.duration : visibleDuration.value;
      const started = startTrackScrub(event, event.currentTarget as Element, (clientX) => {
        if (rect.width <= 0) return;
        TimelineStore.seek(props.meta.id, clamp(start + ((clientX - rect.left) / rect.width) * span, start, start + span));
      });
      if (!started) return;
      if (reset) resetView();
      popover.value = null;
    };

    let copyTimeout: ReturnType<typeof setTimeout> | undefined;
    onUnmounted(() => clearTimeout(copyTimeout));

    const handleCopy = async () => {
      const normalized = normalizeTimelineValuesForCopy(DialStore.getValues(props.meta.id), props.meta.clips);
      if (!(await copyText(buildCopyInstruction('useDialTimeline', props.meta.name, normalized)))) return;
      copied.value = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copied.value = false; }, 1500);
    };

    // The popover closes when its bar is gone: a removed clip, a collapsed row.
    const sectionRef = ref<HTMLDivElement | null>(null);
    const popoverClipKey = computed(() => popover.value?.clip.key);
    const popoverStepKey = computed(() => popover.value?.stepKey);
    watch([collapsedGroups, expandedTracks, () => props.meta.clips, open, popoverClipKey, popoverStepKey, values], () => {
      if (popoverClipKey.value && !clipAnchorRect(sectionRef.value, popoverClipKey.value, popoverStepKey.value)) {
        popover.value = null;
      }
    }, { flush: 'post' });

    // It follows the bar through zoom, panning, and page scroll. Edits made inside
    // the popover are left out: a bar resizing must not move the slider under the pointer.
    const followAnchor = () => {
      if (!popover.value) return;
      const anchor = clipAnchorRect(sectionRef.value, popover.value.clip.key, popover.value.stepKey);
      if (anchor) popover.value = { ...popover.value, anchor };
    };
    watch([popoverClipKey, popoverStepKey, pxPerSecond, safeViewStart], (_, __, onCleanup) => {
      if (!popoverClipKey.value) return;
      followAnchor();
      window.addEventListener('scroll', followAnchor, true);
      window.addEventListener('resize', followAnchor);
      onCleanup(() => {
        window.removeEventListener('scroll', followAnchor, true);
        window.removeEventListener('resize', followAnchor);
      });
    }, { flush: 'post' });

    const closePopover = () => { popover.value = null; };

    // Escape and the close button hand focus back to the bar. Other closes leave it where the press put it.
    const dismissPopover = () => {
      if (popover.value) returnFocusToClip(sectionRef.value, popover.value.clip.key);
      popover.value = null;
    };
    const openClipPopover = (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => {
      const target = stepKey ? `${clip.key}.${stepKey}` : clip.key;
      if (getClipControls(props.meta.id, target, stepKey ? undefined : clipPopoverExclusions(clip)).length === 0) return;
      popover.value = popover.value?.clip.key === clip.key && popover.value.stepKey === stepKey
        ? null
        : {
            clip,
            stepKey,
            anchor: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
          };
    };
    const toggleSet = (state: typeof expandedTracks, key: string) => {
      const next = new Set(state.value);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      state.value = next;
    };
    const toggleTracks = (key: string) => toggleSet(expandedTracks, key);
    const toggleGroup = (key: string) => toggleSet(collapsedGroups, key);
    const handleBarClick = (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => {
      if (!stepKey && clip.tracks?.length) toggleTracks(clip.key);
      else openClipPopover(clip, rect, stepKey);
    };

    const ticks = computed(() => {
      const raw = pxPerSecond.value > 0 ? MAJOR_TICK_TARGET_PX / pxPerSecond.value : 1;
      const adaptive = SECOND_TICK_STEPS.find((step) => step >= raw) ?? SECOND_TICK_STEPS[SECOND_TICK_STEPS.length - 1];
      const majorStep = zoom.value < 1.5 && props.meta.duration >= 1 ? Math.max(1, adaptive) : adaptive;
      const fineStep = majorStep / 10;
      const major: number[] = [];
      const medium: number[] = [];
      const fine: number[] = [];
      for (let time = Math.ceil((safeViewStart.value - 1e-6) / majorStep) * majorStep; time <= viewEnd.value + 1e-6; time += majorStep) {
        major.push(Number(time.toFixed(4)));
      }
      const first = Math.ceil((safeViewStart.value - 1e-6) / fineStep);
      const last = Math.floor((viewEnd.value + 1e-6) / fineStep);
      for (let index = first; index <= last; index++) {
        if (index % 10 === 0) continue;
        const tick = Number((index * fineStep).toFixed(6));
        if (index % 5 === 0) medium.push(tick);
        else fine.push(tick);
      }
      return { major, medium, fine, majorStep };
    });

    const renderRows = (): VNodeChild[] => {
      const rows: VNodeChild[] = [];
      let lastGroup: string | undefined;
      for (const clip of props.meta.clips) {
        if (clip.group !== lastGroup) {
          lastGroup = clip.group;
          if (clip.group) {
            const group = clip.group;
            const collapsed = collapsedGroups.value.has(group);
            rows.push(h('div', { key: `group:${group}`, class: 'dialkit-timeline-row dialkit-timeline-group-row' }, [
              h('div', { class: 'dialkit-timeline-label' }, [
                h('button', {
                  class: 'dialkit-timeline-group-toggle',
                  'data-open': !collapsed,
                  title: collapsed ? 'Expand layer' : 'Collapse layer',
                  onClick: () => toggleGroup(group),
                }, [chevronIcon()]),
                h('span', formatLabel(group)),
              ]),
              h('div', { class: 'dialkit-timeline-lane' }),
            ]));
          }
        }
        if (clip.group && collapsedGroups.value.has(clip.group)) continue;
        const isProps = Boolean(clip.tracks?.length);
        const tracksOpen = isProps && expandedTracks.value.has(clip.key);
        const stat = computeClipStaticFromValues(values.value, clip, props.meta.duration);
        const selected = popover.value?.clip.key === clip.key;
        rows.push(h('div', { key: clip.key, class: 'dialkit-timeline-row', 'data-grouped': clip.group ? '' : undefined }, [
          h('div', { class: 'dialkit-timeline-label' }, [
            isProps ? h('button', {
              class: 'dialkit-timeline-group-toggle',
              'data-open': tracksOpen,
              title: tracksOpen ? 'Collapse properties' : 'Expand properties',
              onClick: (event: Event) => {
                event.stopPropagation();
                toggleTracks(clip.key);
              },
            }, [chevronIcon()]) : null,
            clip.label,
          ]),
          h('div', { class: 'dialkit-timeline-lane' }, [h(TimelineClip, {
            timelineId: props.meta.id,
            clip,
            at: stat.at,
            duration: stat.duration,
            loop: stat.loop,
            steps: clip.stepKeys?.length ? stat.tracks[0]?.steps : undefined,
            fixedDuration: isProps ? true : stat.isPhysics,
            composite: isProps,
            pxPerSecond: pxPerSecond.value,
            viewStart: safeViewStart.value,
            timelineDuration: props.meta.duration,
            selected,
            selectedStepKey: selected ? popover.value?.stepKey : undefined,
            onClick: handleBarClick,
            onDrag: closePopover,
          })]),
        ]));
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
          const trackSelected = popover.value?.clip.key === trackKey;
          rows.push(h('div', { key: trackKey, class: 'dialkit-timeline-row dialkit-timeline-track-row', 'data-grouped': clip.group ? '' : undefined }, [
            h('div', { class: 'dialkit-timeline-label' }, formatLabel(trackRef.prop)),
            h('div', { class: 'dialkit-timeline-lane' }, [h(TimelineClip, {
              timelineId: props.meta.id,
              clip: trackMeta,
              at: stat.at + track.delay,
              duration: track.duration,
              loop: stat.loop,
              steps: trackRef.stepKeys?.length ? track.steps : undefined,
              fixedDuration: !trackRef.stepKeys?.length && track.steps[0]?.isPhysics === true,
              baseAt: stat.at,
              delayMode: true,
              pxPerSecond: pxPerSecond.value,
              viewStart: safeViewStart.value,
              timelineDuration: props.meta.duration,
              selected: trackSelected,
              selectedStepKey: trackSelected ? popover.value?.stepKey : undefined,
              onClick: openClipPopover,
              onDrag: closePopover,
            })]),
          ]));
        }
      }
      return rows;
    };

    return () => h('div', { ref: sectionRef, class: 'dialkit-timeline-section' }, [
      h('div', { class: 'dialkit-timeline-header', 'data-open': open.value || undefined }, [
        h('div', { class: 'dialkit-timeline-identity' }, [
          h('span', { class: 'dialkit-timeline-title' }, props.meta.name),
        ]),
        !open.value ? h(TimelineOverview, {
          id: props.meta.id,
          duration: props.meta.duration,
          viewStart: safeViewStart.value,
          viewEnd: viewEnd.value,
          onNavigate: centerViewAt,
        }) : null,
        h('div', { class: 'dialkit-timeline-actions' }, [
          h(PlayPauseButton, { id: props.meta.id }),
          h(ReplayButton, { onReplay: handleReplay }),
          h(PresetManager, { panelId: props.meta.id, presets: presets.value, activePresetId: activePresetId.value }),
          h('button', {
            class: 'dialkit-toolbar-add dialkit-toolbar-primary',
            title: 'Copy parameters',
            'aria-label': copied.value ? 'Copied parameters' : 'Copy parameters',
            onClick: handleCopy,
          }, [h('span', { style: { position: 'relative', width: '16px', height: '16px' } }, [
            copied.value
              ? h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { ...iconStyle, color: 'inherit' } }, [h('path', { d: ICON_CHECK })])
              : h('svg', { viewBox: '0 0 24 24', fill: 'none', style: { ...iconStyle, color: 'inherit' } }, [
                h('path', { d: ICON_CLIPBOARD_PLAIN.board, stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round' }),
                h('path', { d: ICON_CLIPBOARD_PLAIN.body, stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
              ]),
          ])]),
          h('button', {
            class: 'dialkit-timeline-chevron',
            'data-open': open.value,
            'aria-expanded': open.value,
            title: open.value ? 'Collapse timeline' : 'Expand timeline',
            onClick: () => { open.value = !open.value; },
          }, [chevronIcon()]),
        ]),
      ]),
      open.value ? h('div', {
        class: 'dialkit-timeline-body',
        onWheel: handleTimelineWheel,
        onPointerdown: handleTrackPointerDown,
      }, [h('div', { class: 'dialkit-timeline-grid' }, [
        h('div', { class: 'dialkit-timeline-row dialkit-timeline-ruler-row' }, [
          h('div', { class: 'dialkit-timeline-label' }),
          h('div', {
            ref: laneAreaRef,
            class: 'dialkit-timeline-ruler',
            title: 'Drag to seek · Option-drag or Cmd-scroll to zoom · Shift-drag to reset zoom',
            onPointerdown: handleRulerPointerDown,
          }, [
            ...ticks.value.fine.map((time) => h('div', { key: `fine:${time}`, class: 'dialkit-timeline-tick dialkit-timeline-tick-fine', style: { left: `${(time - safeViewStart.value) * pxPerSecond.value}px` } })),
            ...ticks.value.medium.map((time) => h('div', { key: `medium:${time}`, class: 'dialkit-timeline-tick dialkit-timeline-tick-medium', style: { left: `${(time - safeViewStart.value) * pxPerSecond.value}px` } })),
            ...ticks.value.major.map((time) => h('div', { key: time, class: 'dialkit-timeline-tick', style: { left: `${(time - safeViewStart.value) * pxPerSecond.value}px` } }, [
              h('span', { class: 'dialkit-timeline-tick-label' }, formatRulerSeconds(time, ticks.value.majorStep)),
            ])),
          ]),
        ]),
        ...renderRows(),
        pxPerSecond.value > 0 ? h(TimelinePlayheadFlag, {
          id: props.meta.id,
          duration: props.meta.duration,
          pxPerSecond: pxPerSecond.value,
          viewStart: safeViewStart.value,
          viewEnd: viewEnd.value,
          laneWidth: laneWidth.value,
          ruler: laneAreaRef.value ?? undefined,
          onResetView: resetView,
          onNavigate: centerViewAt,
        }) : null,
      ]), zoom.value > 1 ? h('div', { class: 'dialkit-timeline-scroll-row' }, [
        h('div', { class: 'dialkit-timeline-label' }),
        h('div', {
          ref: horizontalScrollRef,
          class: 'dialkit-timeline-horizontal-scroll',
          'aria-label': 'Timeline horizontal scroll',
          onScroll: handleHorizontalScroll,
        }, [h('div', { style: { width: `${laneWidth.value * zoom.value}px` } })]),
      ]) : null]) : null,
      popover.value ? h(ClipPopover, {
        panelId: props.meta.id,
        popover: popover.value,
        values: values.value,
        theme: props.theme,
        onClose: closePopover,
        onDismiss: dismissPopover,
      }) : null,
    ]);
  },
});

function chevronIcon() {
  return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: ICON_CHEVRON }),
  ]);
}

const ClipPopover = defineComponent({
  props: {
    panelId: { type: String, required: true },
    popover: { type: Object as PropType<PopoverState>, required: true },
    values: { type: Object as PropType<Record<string, DialValue>>, required: true },
    theme: { type: String as PropType<DialTheme>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
    onDismiss: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const element = ref<HTMLDivElement | null>(null);
    const closeButton = ref<HTMLButtonElement | null>(null);
    const naturalHeight = ref(0);
    const viewport = ref(readViewport());
    let observer: ResizeObserver | undefined;
    const measure = () => {
      if (element.value) naturalHeight.value = element.value.scrollHeight + 2;
    };
    const updateViewport = () => { viewport.value = readViewport(); };
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (element.value?.contains(target) || isFloatingControlTarget(target)) return;
      // Let clip clicks handle their own toggle/switch
      if (target.closest?.('.dialkit-timeline-clip') || target.closest?.('.dialkit-timeline-label')) return;
      props.onClose();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onDismiss();
    };
    const observe = () => {
      observer?.disconnect();
      if (!element.value) return;
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(element.value.querySelector('.dialkit-timeline-popover-body') ?? element.value);
    };
    watch([() => props.popover.clip.key, () => props.popover.stepKey], observe, { flush: 'post' });
    // Focus moves in once it has a height: until then it's hidden, and can't take focus.
    watch([() => props.popover.clip.key, () => props.popover.stepKey, () => naturalHeight.value > 0], () => {
      if (naturalHeight.value > 0) closeButton.value?.focus({ preventScroll: true });
    }, { flush: 'post' });
    onMounted(() => {
      observe();
      window.addEventListener('resize', updateViewport);
      window.visualViewport?.addEventListener('resize', updateViewport);
      window.visualViewport?.addEventListener('scroll', updateViewport);
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', keydown);
    });
    onUnmounted(() => {
      observer?.disconnect();
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keydown);
    });

    return () => {
      const { clip, stepKey } = props.popover;
      let controls: ControlMeta[];
      let title: string;
      if (stepKey) {
        controls = getClipControls(props.panelId, `${clip.key}.${stepKey}`);
        if (stepKey === clip.stepKeys?.[0]) {
          const from = getControlAt(props.panelId, `${clip.key}.from`);
          if (from) {
            const index = controls.findIndex((control) => control.path === `${clip.key}.${stepKey}.to`);
            controls = index >= 0 ? [...controls.slice(0, index), from, ...controls.slice(index)] : [...controls, from];
          }
        }
        title = `${clip.label} · ${formatStepLabel(stepKey)}`;
      } else {
        controls = getClipControls(props.panelId, clip.key, clipPopoverExclusions(clip));
        title = clip.label;
      }
      if (controls.length === 0) return null;
      const target = stepKey ? `${clip.key}.${stepKey}` : clip.key;
      const durationMeta = getControlAt(props.panelId, `${target}.duration`);
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
      const current = viewport.value;
      const right = current.offsetLeft + current.width;
      const bottom = current.offsetTop + current.height;
      const width = Math.min(POPOVER_WIDTH, Math.max(220, current.width - 24));
      const left = clamp(props.popover.anchor.left + props.popover.anchor.width / 2 - width / 2, current.offsetLeft + 12, Math.max(current.offsetLeft + 12, right - width - 12));
      const above = Math.max(0, props.popover.anchor.top - current.offsetTop - 22);
      const below = Math.max(0, bottom - props.popover.anchor.bottom - 22);
      const placeAbove = naturalHeight.value === 0 ? above >= below : naturalHeight.value <= above || (naturalHeight.value > below && above >= below);
      const availableHeight = placeAbove ? above : below;
      const renderedHeight = Math.min(naturalHeight.value || availableHeight, availableHeight);
      const rawTop = placeAbove ? props.popover.anchor.top - 10 - renderedHeight : props.popover.anchor.bottom + 10;
      const top = clamp(rawTop, current.offsetTop + 12, Math.max(current.offsetTop + 12, bottom - renderedHeight - 12));

      return h(Teleport, { to: 'body' }, [h('div', { class: 'dialkit-root', 'data-theme': props.theme }, [
        h('div', {
          ref: element,
          class: 'dialkit-timeline-popover',
          'data-placement': placeAbove ? 'above' : 'below',
          style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${availableHeight}px`, visibility: naturalHeight.value > 0 ? 'visible' : 'hidden' },
          role: 'dialog',
          'aria-label': `Edit ${title}`,
        }, [
          h('div', { class: 'dialkit-timeline-popover-header' }, [
            h('span', { class: 'dialkit-timeline-popover-title' }, title),
            h('button', { ref: closeButton, class: 'dialkit-timeline-popover-close', title: 'Close editor', 'aria-label': 'Close editor', onClick: props.onDismiss }, [
              h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' }, [h('path', { d: 'M6 6L18 18M18 6L6 18' })]),
            ]),
          ]),
          h('div', { class: 'dialkit-timeline-popover-body' }, [h(ControlRenderer, {
            panelId: props.panelId,
            controls,
            values: timelinePopoverDisplayValues(props.values, clip.key, clip.stepKeys, stepKey),
            transitionDuration,
          })]),
        ]),
      ])]);
    };
  },
});

function readViewport() {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetLeft: window.visualViewport?.offsetLeft ?? 0,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  };
}

function clipPopoverExclusions(clip: TimelineClipMeta) {
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

const TimelineClip = defineComponent({
  props: {
    timelineId: { type: String, required: true },
    clip: { type: Object as PropType<TimelineClipMeta>, required: true },
    at: { type: Number, required: true },
    duration: { type: Number, required: true },
    loop: { type: String as PropType<TimelineClipLoop>, required: true },
    steps: Array as PropType<TimelineStepStatic[]>,
    fixedDuration: { type: Boolean, required: true },
    composite: Boolean,
    baseAt: { type: Number, default: 0 },
    delayMode: Boolean,
    pxPerSecond: { type: Number, required: true },
    viewStart: { type: Number, required: true },
    timelineDuration: { type: Number, required: true },
    selected: { type: Boolean, required: true },
    selectedStepKey: String,
    onClick: { type: Function as PropType<(clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => void>, required: true },
    onDrag: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const dragging = ref(false);
    let stop: StopGesture | null = null;
    onUnmounted(() => stop?.(false));

    const handlePointerDown = (event: PointerEvent) => {
      if (event.shiftKey) return;
      event.stopPropagation();
      if (stop) return;
      stop = startClipDrag(event, event.currentTarget as HTMLElement, {
        timelineId: props.timelineId,
        clipKey: props.clip.key,
        at: props.at,
        duration: props.duration,
        steps: props.steps,
        fixedDuration: props.fixedDuration,
        baseAt: props.baseAt,
        delayMode: props.delayMode,
        getScale: () => ({ pxPerSecond: props.pxPerSecond, timelineDuration: props.timelineDuration }),
        onDragStart: () => {
          dragging.value = true;
          props.onDrag();
        },
        onClick: (stepKey, anchor) => props.onClick(props.clip, anchor.getBoundingClientRect(), stepKey),
        onEnd: () => {
          stop = null;
          dragging.value = false;
        },
      });
    };

    return () => {
      const width = Math.max(props.duration * props.pxPerSecond, 14);
      const isSteps = Boolean(props.steps?.length);
      const looping = props.loop === 'repeat' && props.duration > 0;
      const resizable = props.duration > 0 && !props.fixedDuration && !props.composite;
      const durationText = `${props.fixedDuration && !props.composite ? '~' : ''}${formatSeconds(props.duration)}`;
      const ghosts: VNodeChild[] = [];
      if (looping) {
        const first = Math.max(1, Math.floor((props.viewStart - props.at) / props.duration));
        for (let offset = 0; offset < 256; offset++) {
          const index = first + offset;
          const start = props.at + props.duration * index;
          if (start >= props.timelineDuration - 1e-6) break;
          const duration = Math.min(props.duration, props.timelineDuration - start);
          ghosts.push(h('div', {
            key: `ghost:${index}`,
            class: 'dialkit-timeline-clip-ghost',
            'data-steps': isSteps || undefined,
            'aria-hidden': 'true',
            style: { left: `${(start - props.viewStart) * props.pxPerSecond + 1}px`, width: `${Math.max(1, duration * props.pxPerSecond - 2)}px`, background: props.clip.color },
          }, props.steps?.map((step) => h('span', { class: 'dialkit-timeline-clip-ghost-segment', style: { width: `${step.duration * props.pxPerSecond}px` } }))));
        }
      }
      let cumulative = 0;
      const boundaries = props.steps?.map((step) => (cumulative += step.duration)) ?? [];
      const children: VNodeChild[] = [];
      if (props.composite) {
        if (width > 56) children.push(h('span', { class: 'dialkit-timeline-clip-duration' }, durationText));
      } else if (isSteps) {
        for (const step of props.steps ?? []) {
          const segmentWidth = step.duration * props.pxPerSecond;
          children.push(h('div', {
            key: step.key ?? 'step',
            class: 'dialkit-timeline-clip-segment',
            'data-step': step.key,
            'data-selected': props.selectedStepKey === step.key || undefined,
            style: { width: `${segmentWidth}px` },
          }, segmentWidth > 52 ? [h('span', { class: 'dialkit-timeline-clip-duration' }, formatSeconds(step.duration))] : []));
        }
        (props.steps ?? []).forEach((step, index) => {
          if (!step.isPhysics) children.push(h('div', { key: `boundary:${step.key}`, class: 'dialkit-timeline-clip-handle', 'data-boundary': index, style: { left: `${boundaries[index] * props.pxPerSecond - 4}px` } }));
        });
        if (!props.steps?.[0]?.isPhysics) children.push(h('div', { class: 'dialkit-timeline-clip-handle', 'data-edge': 'start' }));
      } else {
        if (resizable) children.push(h('div', { class: 'dialkit-timeline-clip-handle', 'data-edge': 'start' }));
        if (width > 56) children.push(h('span', { class: 'dialkit-timeline-clip-duration' }, durationText));
        if (resizable) children.push(h('div', { class: 'dialkit-timeline-clip-handle', 'data-edge': 'end' }));
      }
      const title = props.composite
        ? `${props.clip.label} — composite of its property tracks${looping ? ' · repeats through timeline' : ''} · click to expand`
        : `${props.clip.label} — ${formatSeconds(props.at)} for ${durationText}${props.fixedDuration ? ' (duration set by spring physics)' : ''}${looping ? ' · repeats through timeline' : ''}${props.delayMode ? ' · drag to phase-shift' : ''}`;
      return [...ghosts, h('div', {
        key: 'bar',
        class: 'dialkit-timeline-clip',
        'data-clip-key': props.clip.key,
        'data-steps': isSteps || undefined,
        'data-composite': props.composite || undefined,
        'data-selected': props.selected || undefined,
        'data-dragging': dragging.value || undefined,
        style: { left: `${(props.at - props.viewStart) * props.pxPerSecond}px`, width: `${width}px`, background: props.composite ? `${props.clip.color}80` : props.clip.color },
        title,
        tabindex: 0,
        role: 'button',
        'aria-label': `Edit ${props.clip.label}`,
        onPointerdown: handlePointerDown,
        onKeydown: (event: KeyboardEvent) => pressClipFromKey(event, () => props.onClick(props.clip, (event.currentTarget as HTMLElement).getBoundingClientRect())),
      }, children), looping ? h('span', { class: 'dialkit-timeline-loop-infinity', 'aria-hidden': 'true', title: 'Repeats indefinitely' }, '∞') : null];
    };
  },
});
