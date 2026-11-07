import { DialStore, formatLabel, type ControlMeta } from '../store/DialStore';
import { TimelineStore, type TimelineMeta, type TimelineClipMeta } from '../store/TimelineStore';
import { TimelineUiStore } from '../store/TimelineUiStore';
import { computeClipStaticFromValues, formatRulerSeconds, formatSeconds, formatStepLabel, normalizeTimelineValuesForCopy, TIMELINE_MIN_CLIP_DURATION, timelinePopoverDisplayValues, type TimelineClipLoop, type TimelineStepStatic } from '../timeline-core';
import { clamp } from '../transition-math';
import { findControl } from '../shortcut-utils';
import { clipAnchorRect, isFloatingControlTarget, returnFocusToClip, type AnchorRect } from '../dropdown-position';
import { buildCopyInstruction, copyText } from '../copy-instruction';
import { startPointerGesture, type StopGesture } from '../pointer-gesture';
import { clampDockHeight, isTimeInView, pressClipFromKey, resizeDockFromKey, seekFromKey, startClipDrag, startScrubGesture } from '../timeline/adapter';
import { ICON_CHEVRON, ICON_PLAY, ICON_PAUSE, ICON_REPLAY, ICON_CLIPBOARD_PLAIN, ICON_CHECK } from '../icons';
import { mountControlRenderer } from './ControlRenderer';
import { mountPresetManager } from './menus';
import { element, icon, button } from './dom';
import type { DialTheme } from './DialRoot';
const DRAG_THRESHOLD_PX = 3;
const MAJOR_TICK_TARGET_PX = 140;
const MILLISECOND_STEP = 0.001;
const MIN_TIMELINE_MAX_ZOOM = 8;
const POPOVER_WIDTH = 280;
const ZOOM_DRAG_DISTANCE = 180;
export interface DialTimelineOptions {
  target?: HTMLElement;
  theme?: DialTheme;
  defaultVisible?: boolean;
  visible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  defaultOpen?: boolean;
  productionEnabled?: boolean;
}
export type DialTimelineProps = DialTimelineOptions;
export interface DialTimelineHandle {
  element: HTMLElement;
  setVisible(visible: boolean): void;
  update(next: Pick<DialTimelineOptions, 'theme' | 'visible' | 'onVisibilityChange'>): void;
  destroy(): void;
}
/** Mount the timeline dock independently of the parameter panel. */
export function createDialTimelineRoot(initial: DialTimelineOptions = {}): DialTimelineHandle {
  let options = initial;
  let destroyed = false;
  const root = element('div', 'dialkit-root dialkit-timeline');
  root.dataset.theme = options.theme ?? 'system';
  // Off means off: no subscriptions, no controller, nothing mounted.
  if (options.productionEnabled === false)
    return { element: root, setVisible() {}, update() {}, destroy() { root.remove(); } };
  const resize = element('div', 'dialkit-timeline-resize-handle');
  resize.setAttribute('role', 'separator');
  resize.setAttribute('aria-label', 'Resize timeline height');
  resize.setAttribute('aria-orientation', 'horizontal');
  resize.tabIndex = 0;
  const dock = element('div', 'dialkit-timeline-dock');
  root.append(resize, dock);
  let height = 400;
  const size = () => {
    dock.style.maxHeight = `min(${height}px, calc(100vh - 24px))`;
  };
  size();
  let stopResize: StopGesture | null = null;
  resize.addEventListener('pointerdown', event => {
    if (stopResize)
      return;
    event.preventDefault();
    event.stopPropagation();
    const pointerY = event.clientY;
    const startHeight = dock.getBoundingClientRect().height;
    stopResize = startPointerGesture(event, resize, {
      move(next) {
        height = clampDockHeight(startHeight + pointerY - next.clientY);
        size();
      },
      end() {
        stopResize = null;
      },
    });
  });
  resize.addEventListener('keydown', event => {
    resizeDockFromKey(dock, event, next => {
      height = next;
      size();
    });
  });
  const sections = new Map<string, ReturnType<typeof mountSection>>();
  const visibilityId = Symbol('vanilla-timeline');
  const controller = () => ({ visible: options.visible, defaultVisible: options.defaultVisible ?? true, onVisibilityChange: options.onVisibilityChange });
  function render() {
    const timelines = TimelineStore.getTimelines();
    root.hidden = !timelines.length || !TimelineUiStore.getVisible();
    for (const [id, section] of sections)
      if (!timelines.some(t => t.id === id)) {
        section.destroy();
        sections.delete(id);
      }
    for (const meta of timelines) {
      let section = sections.get(meta.id);
      if (!section) {
        section = mountSection(dock, meta, options);
        sections.set(meta.id, section);
      }
      else
        section.update(meta, options.theme ?? 'system');
      if (root.hidden)
        section.closeEditor();
    }
  }
  const stopController = TimelineUiStore.registerController(visibilityId, controller());
  const stopGlobal = TimelineStore.subscribeGlobal(render);
  const stopVisible = TimelineUiStore.subscribe(render);
  (options.target ?? document.body).append(root);
  render();
  return {
    element: root,
    setVisible(visible: boolean) {
      if (!destroyed)
        TimelineUiStore.requestVisible(visible);
    },
    update(next) {
      if (destroyed)
        return;
      options = { ...options, ...next };
      root.dataset.theme = options.theme ?? 'system';
      TimelineUiStore.updateController(visibilityId, controller());
      render();
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      stopResize?.(false);
      stopGlobal();
      stopVisible();
      stopController();
      sections.forEach(s => s.destroy());
      sections.clear();
      root.remove();
    },
  };
}
export const DialTimeline = createDialTimelineRoot;
type BarProps = {
  clip: TimelineClipMeta;
  at: number;
  duration: number;
  loop: TimelineClipLoop;
  steps?: TimelineStepStatic[];
  fixedDuration: boolean;
  composite: boolean;
  baseAt: number;
  delayMode: boolean;
};
type RowSpec = {
  key: string;
  label: string;
  className: string;
  grouped: boolean;
  disclosure?: { open: boolean; label: string; toggle: () => void };
  bar?: BarProps;
};
type PopoverView = {
  clip: TimelineClipMeta;
  stepKey?: string;
  update(): void;
  follow(): void;
  destroy(): void;
};
function setFlag(node: HTMLElement, name: string, on: boolean) {
  if (on)
    node.dataset[name] = '';
  else
    delete node.dataset[name];
}
function clampViewStart(start: number, duration: number, visibleDuration: number) {
  return clamp(start, 0, Math.max(0, duration - visibleDuration));
}
// A clip-level popover hides its step folders and track folders, which have their own.
function popoverExclusions(clip: TimelineClipMeta) {
  return new Set([...(clip.stepKeys ?? []), ...(clip.tracks?.map(track => track.prop) ?? [])]);
}
function controlAt(panelId: string, path: string): ControlMeta | null {
  const panel = DialStore.getPanel(panelId);
  return panel ? findControl(panel.controls, path) : null;
}
// The bars own clip and segment timing, so those controls stay out of the popover.
function clipControls(panelId: string, path: string, exclude?: Set<string>): ControlMeta[] {
  return controlAt(panelId, path)?.children?.filter(control => {
    const childKey = control.path.slice(path.length + 1);
    return childKey !== 'at' && childKey !== 'duration' && !exclude?.has(childKey);
  }) ?? [];
}
function mountSection(host: HTMLElement, initial: TimelineMeta, options: DialTimelineOptions) {
  let meta = initial;
  let theme = options.theme ?? 'system';
  let open = options.defaultOpen ?? true;
  let zoom = 1, viewStart = 0, laneWidth = 0;
  const groups = new Set<string>(), tracks = new Set<string>();
  const section = element('div', 'dialkit-timeline-section');
  const header = element('div', 'dialkit-timeline-header');
  const identity = element('div', 'dialkit-timeline-identity');
  const title = element('span', 'dialkit-timeline-title');
  identity.append(title);
  const overview = element('div', 'dialkit-timeline-overview');
  const viewport = element('div', 'dialkit-timeline-overview-viewport');
  const progress = element('div', 'dialkit-timeline-overview-progress');
  const marker = element('div', 'dialkit-timeline-overview-playhead');
  overview.append(viewport, progress, marker);
  const actions = element('div', 'dialkit-timeline-actions');
  header.append(identity, overview, actions);
  const play = button('Play timeline', ICON_PLAY, () => {
    if (TimelineStore.getTransport(meta.id).playing)
      TimelineStore.pause(meta.id);
    else
      TimelineStore.play(meta.id);
  });
  const replay = button('Replay timeline', ICON_REPLAY, () => {
    viewStart = 0;
    render();
    TimelineStore.replay(meta.id);
  });
  actions.append(play, replay);
  const presetProps = () => ({ panelId: meta.id, presets: DialStore.getPresets(meta.id), activePresetId: DialStore.getActivePresetId(meta.id) });
  const presets = mountPresetManager(actions, presetProps());
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const copy = button('Copy parameters', [ICON_CLIPBOARD_PLAIN.board, ICON_CLIPBOARD_PLAIN.body], async () => {
    if (!(await copyText(buildCopyInstruction('createDialTimeline', meta.name, normalizeTimelineValuesForCopy(DialStore.getValues(meta.id), meta.clips)))) || destroyed)
      return;
    copy.replaceChildren(icon(ICON_CHECK));
    copy.setAttribute('aria-label', 'Copied parameters');
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copy.replaceChildren(icon([ICON_CLIPBOARD_PLAIN.board, ICON_CLIPBOARD_PLAIN.body]));
      copy.setAttribute('aria-label', 'Copy parameters');
    }, 1500);
  });
  copy.classList.add('dialkit-toolbar-primary');
  actions.append(copy);
  const collapse = element('button', 'dialkit-timeline-chevron');
  collapse.append(icon(ICON_CHEVRON));
  collapse.addEventListener('click', () => {
    open = !open;
    render();
  });
  actions.append(collapse);
  const body = element('div', 'dialkit-timeline-body');
  const grid = element('div', 'dialkit-timeline-grid');
  const rulerRow = element('div', 'dialkit-timeline-row dialkit-timeline-ruler-row');
  const ruler = element('div', 'dialkit-timeline-ruler');
  ruler.title = 'Drag to seek · Option-drag to zoom · Shift-drag to reset zoom';
  rulerRow.append(element('div', 'dialkit-timeline-label'), ruler);
  grid.append(rulerRow);
  const playhead = element('div', 'dialkit-timeline-playhead-control');
  playhead.setAttribute('role', 'slider');
  playhead.tabIndex = 0;
  playhead.setAttribute('aria-label', 'Timeline current time');
  const stem = element('div', 'dialkit-timeline-playhead-stem');
  const anchor = element('div', 'dialkit-timeline-playhead-anchor');
  const flag = element('div', 'dialkit-timeline-playhead-flag');
  anchor.append(flag);
  playhead.append(stem, anchor);
  grid.append(playhead);
  const scrollRow = element('div', 'dialkit-timeline-scroll-row');
  const scroll = element('div', 'dialkit-timeline-horizontal-scroll');
  scroll.setAttribute('aria-label', 'Timeline horizontal scroll');
  const spacer = element('div');
  scroll.append(spacer);
  scrollRow.append(element('div', 'dialkit-timeline-label'), scroll);
  body.append(grid, scrollRow);
  section.append(header, body);
  host.append(section);
  const rows = new Map<string, ReturnType<typeof mountRow>>();
  let popover: PopoverView | null = null;
  let popoverView = '';
  const visibleDuration = () => meta.duration / zoom;
  const pxPerSecond = () => {
    const visible = visibleDuration();
    return visible > 0 && laneWidth > 0 ? laneWidth / visible : 0;
  };
  const maxZoom = () => Math.max(MIN_TIMELINE_MAX_ZOOM, laneWidth > 0 && meta.duration > 0
    ? (MAJOR_TICK_TARGET_PX * meta.duration) / (MILLISECOND_STEP * 10 * laneWidth)
    : MIN_TIMELINE_MAX_ZOOM);
  const centerViewAt = (time: number) => {
    viewStart = clampViewStart(time - visibleDuration() / 2, meta.duration, visibleDuration());
  };
  const resetView = () => {
    zoom = 1;
    viewStart = 0;
    render();
  };
  function scrubber() {
    let stop: StopGesture | null = null;
    return {
      start(event: PointerEvent, handle: Element | null, seek: (clientX: number) => void) {
        if (stop)
          return false;
        stop = startScrubGesture(meta.id, event, handle, seek, () => {
          stop = null;
        });
        return stop !== null;
      },
      stop() {
        stop?.(false);
      },
    };
  }
  const playheadScrub = scrubber(), overviewScrub = scrubber(), rulerScrub = scrubber(), trackScrub = scrubber();
  let stopZoom: StopGesture | null = null;
  function transport() {
    const state = TimelineStore.getTransport(meta.id);
    play.setAttribute('aria-label', state.playing ? 'Pause timeline' : 'Play timeline');
    play.title = state.playing ? 'Pause timeline' : 'Play timeline';
    if (play.dataset.playing !== String(state.playing)) {
      play.dataset.playing = String(state.playing);
      play.replaceChildren(icon(state.playing ? ICON_PAUSE : ICON_PLAY));
    }
    const percent = meta.duration > 0 ? state.time / meta.duration * 100 : 0;
    progress.style.width = marker.style.left = `${percent}%`;
    viewport.style.left = `${meta.duration > 0 ? viewStart / meta.duration * 100 : 0}%`;
    viewport.style.width = `${100 / zoom}%`;
    if (zoom > 1)
      viewport.dataset.zoomed = '';
    else
      delete viewport.dataset.zoomed;
    const x = clamp((state.time - viewStart) * pxPerSecond(), 0, laneWidth);
    const flagOffset = clamp(x, 25, Math.max(25, laneWidth - 25)) - x;
    playhead.style.display = !isTimeInView(state.time, viewStart, viewStart + visibleDuration(), pxPerSecond()) || pxPerSecond() <= 0 ? 'none' : '';
    playhead.style.left = `calc(var(--dial-timeline-label-w) + ${x}px)`;
    playhead.style.setProperty('--dial-timeline-playhead-flag-offset', `${flagOffset}px`);
    playhead.dataset.edge = flagOffset > 0.5 ? 'start' : flagOffset < -0.5 ? 'end' : 'center';
    flag.textContent = state.time.toFixed(2);
    playhead.setAttribute('aria-valuemin', '0');
    playhead.setAttribute('aria-valuemax', String(meta.duration));
    playhead.setAttribute('aria-valuenow', String(state.time));
  }
  playhead.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
    const rect = ruler.getBoundingClientRect();
    const shouldReset = event.shiftKey;
    const start = shouldReset ? 0 : viewStart;
    const end = shouldReset ? meta.duration : viewStart + visibleDuration();
    // No capture: the flag leaves the layout whenever the playhead is out of view.
    const started = playheadScrub.start(event, null, clientX => {
      if (rect.width > 0)
        TimelineStore.seek(meta.id, clamp(start + (clientX - rect.left) / rect.width * (end - start), start, end));
    });
    if (started && shouldReset)
      resetView();
  });
  overview.addEventListener('pointerdown', event => {
    event.preventDefault();
    const rect = overview.getBoundingClientRect();
    const duration = meta.duration;
    overviewScrub.start(event, overview, clientX => {
      if (rect.width <= 0 || duration <= 0)
        return;
      const time = clamp((clientX - rect.left) / rect.width * duration, 0, duration);
      TimelineStore.seek(meta.id, time);
      if (zoom > 1 && meta.duration > 0) {
        centerViewAt(time);
        render();
      }
    });
  });
  ruler.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
    const rect = ruler.getBoundingClientRect();
    if (rect.width <= 0)
      return;
    if (!event.altKey) {
      const shouldReset = event.shiftKey;
      const start = shouldReset ? 0 : viewStart;
      const span = shouldReset ? meta.duration : visibleDuration();
      const started = rulerScrub.start(event, ruler, clientX => {
        TimelineStore.seek(meta.id, clamp(start + (clientX - rect.left) / rect.width * span, start, start + span));
      });
      if (started && shouldReset)
        resetView();
      return;
    }
    if (stopZoom)
      return;
    const pointerX = event.clientX;
    const startZoom = zoom, startView = viewStart, duration = meta.duration, limit = maxZoom();
    const ratio = clamp((pointerX - rect.left) / rect.width, 0, 1);
    const anchorTime = viewStart + ratio * visibleDuration();
    let moved = false;
    stopZoom = startPointerGesture(event, ruler, {
      move(next) {
        if (duration <= 0)
          return;
        const dx = next.clientX - pointerX;
        if (!moved && Math.abs(dx) <= DRAG_THRESHOLD_PX)
          return;
        moved = true;
        zoom = clamp(startZoom * Math.exp(dx / ZOOM_DRAG_DISTANCE), 1, limit);
        viewStart = clampViewStart(anchorTime - ratio * (duration / zoom), duration, duration / zoom);
        render();
      },
      end(cancelled) {
        stopZoom = null;
        if (cancelled && moved) {
          zoom = startZoom;
          viewStart = startView;
          render();
        }
      },
    });
  });
  playhead.addEventListener('keydown', event => {
    const before = viewStart;
    seekFromKey(meta.id, event, { start: viewStart, end: viewStart + visibleDuration(), pxPerSecond: pxPerSecond(), reveal: centerViewAt });
    if (viewStart !== before)
      render();
  });
  body.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement;
    if (target.closest('.dialkit-timeline-label, .dialkit-timeline-scroll-row, button'))
      return;
    if (!event.shiftKey && target.closest('.dialkit-timeline-clip'))
      return;
    event.preventDefault();
    const rect = ruler.getBoundingClientRect();
    const shouldReset = event.shiftKey;
    const start = shouldReset ? 0 : viewStart;
    const span = shouldReset ? meta.duration : visibleDuration();
    const started = trackScrub.start(event, body, clientX => {
      if (rect.width > 0)
        TimelineStore.seek(meta.id, clamp(start + (clientX - rect.left) / rect.width * span, start, start + span));
    });
    if (!started)
      return;
    if (shouldReset)
      resetView();
    closeEditor();
  });
  scroll.addEventListener('scroll', () => {
    const px = pxPerSecond();
    if (px <= 0)
      return;
    const next = clampViewStart(scroll.scrollLeft / px, meta.duration, visibleDuration());
    if (Math.abs(next - viewStart) < 0.001)
      return;
    viewStart = next;
    render();
  });
  body.addEventListener('wheel', event => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (zoom > 1 && delta) {
      event.preventDefault();
      scroll.scrollLeft += delta;
    }
  }, { passive: false });
  function toggleTracks(clipKey: string) {
    if (!tracks.delete(clipKey))
      tracks.add(clipKey);
    render();
  }
  function toggleGroup(group: string) {
    if (!groups.delete(group))
      groups.add(group);
    render();
  }
  function rowSpecs(): RowSpec[] {
    if (!open)
      return [];
    const specs: RowSpec[] = [];
    const values = DialStore.getValues(meta.id);
    let lastGroup: string | undefined;
    for (const clip of meta.clips) {
      if (clip.group && clip.group !== lastGroup) {
        const group = clip.group;
        const isOpen = !groups.has(group);
        specs.push({ key: `group:${group}`, label: formatLabel(group), className: 'dialkit-timeline-group-row', grouped: false, disclosure: { open: isOpen, label: isOpen ? 'Collapse layer' : 'Expand layer', toggle: () => toggleGroup(group) } });
      }
      lastGroup = clip.group;
      if (clip.group && groups.has(clip.group))
        continue;
      const stat = computeClipStaticFromValues(values, clip, meta.duration);
      const composite = !!clip.tracks?.length;
      const tracksOpen = composite && tracks.has(clip.key);
      specs.push({
        key: clip.key,
        label: clip.label,
        className: '',
        grouped: !!clip.group,
        disclosure: composite ? { open: tracksOpen, label: tracksOpen ? 'Collapse properties' : 'Expand properties', toggle: () => toggleTracks(clip.key) } : undefined,
        bar: { clip, at: stat.at, duration: stat.duration, loop: stat.loop, steps: clip.stepKeys?.length ? stat.tracks[0]?.steps : undefined, fixedDuration: composite || stat.isPhysics, composite, baseAt: 0, delayMode: false },
      });
      if (!tracksOpen)
        continue;
      for (const trackRef of clip.tracks!) {
        const track = stat.tracks.find(t => t.prop === trackRef.prop);
        if (!track)
          continue;
        const key = `${clip.key}.${trackRef.prop}`;
        const trackMeta = { ...clip, key, label: `${clip.label} · ${formatLabel(trackRef.prop)}`, tracks: undefined, stepKeys: trackRef.stepKeys };
        specs.push({
          key,
          label: formatLabel(trackRef.prop),
          className: 'dialkit-timeline-track-row',
          grouped: !!clip.group,
          bar: { clip: trackMeta, at: stat.at + track.delay, duration: track.duration, loop: stat.loop, steps: trackRef.stepKeys?.length ? track.steps : undefined, fixedDuration: !trackRef.stepKeys?.length && track.steps[0]?.isPhysics === true, composite: false, baseAt: stat.at, delayMode: true },
        });
      }
    }
    return specs;
  }
  // Rows and bars are keyed and patched in place: a bar holds pointer capture
  // during a drag, and the drag edits the values that drive this render.
  function renderRows() {
    const specs = rowSpecs();
    const wanted = new Set(specs.map(spec => spec.key));
    for (const [key, row] of rows)
      if (!wanted.has(key)) {
        row.destroy();
        rows.delete(key);
      }
    let cursor: Element = rulerRow;
    for (const spec of specs) {
      let row = rows.get(spec.key);
      if (!row) {
        row = mountRow();
        rows.set(spec.key, row);
      }
      row.update(spec);
      if (cursor.nextElementSibling !== row.root)
        grid.insertBefore(row.root, cursor.nextElementSibling);
      cursor = row.root;
    }
  }
  function render() {
    if (destroyed)
      return;
    title.textContent = meta.name;
    body.style.display = open ? '' : 'none';
    overview.style.display = open ? 'none' : '';
    if (open)
      header.dataset.open = '';
    else
      delete header.dataset.open;
    collapse.dataset.open = String(open);
    collapse.setAttribute('aria-expanded', String(open));
    collapse.title = open ? 'Collapse timeline' : 'Expand timeline';
    collapse.setAttribute('aria-label', collapse.title);
    if (open)
      laneWidth = ruler.getBoundingClientRect().width;
    zoom = clamp(zoom, 1, maxZoom());
    viewStart = clampViewStart(viewStart, meta.duration, visibleDuration());
    const px = pxPerSecond();
    ruler.replaceChildren();
    const tickSteps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    let major = tickSteps.find(t => t >= MAJOR_TICK_TARGET_PX / (px || 1)) ?? 600;
    if (zoom < 1.5 && meta.duration >= 1)
      major = Math.max(1, major);
    for (let i = Math.ceil(viewStart / (major / 10)); i <= Math.floor((viewStart + visibleDuration()) / (major / 10)); i++) {
      const tick = element('div', `dialkit-timeline-tick${i % 10 === 0 ? '' : i % 5 === 0 ? ' dialkit-timeline-tick-medium' : ' dialkit-timeline-tick-fine'}`);
      tick.style.left = `${(i * major / 10 - viewStart) * px}px`;
      if (i % 10 === 0)
        tick.append(element('span', 'dialkit-timeline-tick-label', formatRulerSeconds(Number((i * major / 10).toFixed(4)), major)));
      ruler.append(tick);
    }
    renderRows();
    scrollRow.style.display = zoom > 1 ? '' : 'none';
    spacer.style.width = `${laneWidth * zoom}px`;
    if (open && zoom > 1 && Math.abs(scroll.scrollLeft - viewStart * px) > 0.5)
      scroll.scrollLeft = viewStart * px;
    transport();
    presets.update(presetProps());
    syncPopover(px);
  }
  // Closes once its bar is gone. Follows the bar on zoom and pan, but not on an
  // edit made inside it: a resizing bar must not move the slider under the pointer.
  function syncPopover(px: number) {
    if (!popover)
      return;
    if (!clipAnchorRect(section, popover.clip.key, popover.stepKey)) {
      closeEditor();
      return;
    }
    popover.update();
    const view = `${px}:${viewStart}`;
    if (view !== popoverView) {
      popoverView = view;
      popover.follow();
    }
  }
  function mountRow() {
    const root = element('div', 'dialkit-timeline-row');
    const caption = element('div', 'dialkit-timeline-label');
    const text = document.createTextNode('');
    const lane = element('div', 'dialkit-timeline-lane');
    caption.append(text);
    root.append(caption, lane);
    let toggle: HTMLButtonElement | undefined;
    let onToggle = () => {};
    let bar: ReturnType<typeof mountBar> | undefined;
    return {
      root,
      update(spec: RowSpec) {
        root.className = `dialkit-timeline-row ${spec.className}`;
        setFlag(root, 'grouped', spec.grouped);
        text.data = spec.label;
        if (spec.disclosure) {
          if (!toggle) {
            toggle = element('button', 'dialkit-timeline-group-toggle');
            toggle.append(icon(ICON_CHEVRON));
            toggle.addEventListener('click', () => onToggle());
            caption.prepend(toggle);
          }
          onToggle = spec.disclosure.toggle;
          toggle.title = spec.disclosure.label;
          toggle.setAttribute('aria-label', spec.disclosure.label);
          toggle.setAttribute('aria-expanded', String(spec.disclosure.open));
          toggle.dataset.open = String(spec.disclosure.open);
        }
        else {
          toggle?.remove();
          toggle = undefined;
        }
        if (spec.bar) {
          bar ??= mountBar(lane);
          bar.update(spec.bar);
        }
        else {
          bar?.destroy();
          bar = undefined;
        }
      },
      markSelected() {
        bar?.markSelected();
      },
      destroy() {
        bar?.destroy();
        root.remove();
      },
    };
  }
  function mountBar(lane: HTMLElement) {
    const node = element('div', 'dialkit-timeline-clip');
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    lane.append(node);
    const infinity = element('span', 'dialkit-timeline-loop-infinity', '∞');
    let props: BarProps;
    let stop: StopGesture | null = null;
    let gone = false;
    let shape = '';
    let ghosts: HTMLElement[] = [];
    let segments: { node: HTMLElement; label: HTMLElement }[] = [];
    let boundaries: (HTMLElement | undefined)[] = [];
    let durationLabel: HTMLElement | undefined;
    const edge = (side: string) => {
      const handle = element('div', 'dialkit-timeline-clip-handle');
      handle.dataset.edge = side;
      node.append(handle);
    };
    // Children only rebuild when the bar's shape changes, so a press keeps its target.
    function buildShape({ steps, composite, resizable }: { steps?: TimelineStepStatic[]; composite: boolean; resizable: boolean }) {
      const next = JSON.stringify([composite, resizable, steps?.map(step => [step.key, step.isPhysics])]);
      if (next === shape)
        return;
      shape = next;
      node.replaceChildren();
      segments = [];
      boundaries = [];
      durationLabel = undefined;
      if (steps?.length && !composite) {
        segments = steps.map(step => {
          const segment = element('div', 'dialkit-timeline-clip-segment');
          if (step.key !== null)
            segment.dataset.step = step.key;
          const label = element('span', 'dialkit-timeline-clip-duration');
          segment.append(label);
          node.append(segment);
          return { node: segment, label };
        });
        boundaries = steps.map((step, index) => {
          if (step.isPhysics)
            return undefined;
          const handle = element('div', 'dialkit-timeline-clip-handle');
          handle.dataset.boundary = String(index);
          node.append(handle);
          return handle;
        });
        if (!steps[0].isPhysics)
          edge('start');
      }
      else {
        if (resizable)
          edge('start');
        durationLabel = element('span', 'dialkit-timeline-clip-duration');
        node.append(durationLabel);
        if (resizable)
          edge('end');
      }
    }
    function renderGhosts(looping: boolean, at: number, duration: number, steps: TimelineStepStatic[] | undefined, color: string, px: number) {
      let used = 0;
      if (looping)
        for (let index = Math.max(1, Math.floor((viewStart - at) / duration)), count = 0; at + duration * index < meta.duration && count < 256; index++, count++) {
          let ghost = ghosts[used];
          if (!ghost) {
            ghost = element('div', 'dialkit-timeline-clip-ghost');
            ghost.setAttribute('aria-hidden', 'true');
            lane.insertBefore(ghost, node);
            ghosts.push(ghost);
          }
          Object.assign(ghost.style, { left: `${(at + duration * index - viewStart) * px + 1}px`, width: `${Math.max(1, Math.min(duration, meta.duration - at - duration * index) * px - 2)}px`, background: color });
          setFlag(ghost, 'steps', !!steps?.length);
          while (ghost.children.length > (steps?.length ?? 0))
            ghost.lastElementChild!.remove();
          steps?.forEach((step, stepIndex) => {
            const segment = (ghost.children[stepIndex] ?? ghost.appendChild(element('span', 'dialkit-timeline-clip-ghost-segment'))) as HTMLElement;
            segment.style.width = `${step.duration * px}px`;
          });
          used++;
        }
      ghosts.splice(used).forEach(ghost => ghost.remove());
    }
    node.addEventListener('keydown', event => pressClipFromKey(event, () => handleBarClick(props.clip, node.getBoundingClientRect())));
    node.addEventListener('pointerdown', event => {
      if (event.shiftKey)
        return;
      event.stopPropagation();
      if (stop)
        return;
      stop = startClipDrag(event, node, {
        timelineId: meta.id,
        clipKey: props.clip.key,
        at: props.at,
        duration: props.duration,
        steps: props.steps,
        fixedDuration: props.fixedDuration,
        baseAt: props.baseAt,
        delayMode: props.delayMode,
        getScale: () => ({ pxPerSecond: pxPerSecond(), timelineDuration: meta.duration }),
        onDragStart() {
          setFlag(node, 'dragging', true);
          closeEditor();
        },
        onClick(stepKey, anchorEl) {
          if (!gone)
            handleBarClick(props.clip, anchorEl.getBoundingClientRect(), stepKey);
        },
        onEnd() {
          stop = null;
          setFlag(node, 'dragging', false);
        },
      });
    });
    const markSelected = () => {
      const selected = popover?.clip.key === props.clip.key;
      setFlag(node, 'selected', selected);
      segments.forEach((segment, index) => setFlag(segment.node, 'selected', selected && popover?.stepKey === props.steps?.[index]?.key));
    };
    return {
      markSelected,
      update(next: BarProps) {
        props = next;
        const { clip, at, duration, steps, fixedDuration, composite, delayMode } = next;
        const px = pxPerSecond();
        const width = Math.max(duration * px, 14);
        const resizable = duration > 0 && !fixedDuration && !composite;
        const looping = next.loop === 'repeat' && duration > 0;
        const durationText = `${fixedDuration && !composite ? '~' : ''}${formatSeconds(duration)}`;
        renderGhosts(looping, at, duration, steps, clip.color, px);
        buildShape({ steps, composite, resizable });
        node.dataset.clipKey = clip.key;
        node.setAttribute('aria-label', `Edit ${clip.label}`);
        node.title = composite
          ? `${clip.label} — composite of its property tracks${looping ? ' · repeats through timeline' : ''} · click to expand`
          : `${clip.label} — ${formatSeconds(at)} for ${durationText}${fixedDuration ? ' (duration set by spring physics)' : ''}${looping ? ' · repeats through timeline' : ''}${delayMode ? ' · drag to phase-shift' : ''}`;
        Object.assign(node.style, { left: `${(at - viewStart) * px}px`, width: `${width}px`, background: composite ? `${clip.color}80` : clip.color });
        setFlag(node, 'steps', !!steps?.length);
        setFlag(node, 'composite', composite);
        let offset = 0;
        segments.forEach((segment, index) => {
          const step = steps![index];
          const segmentWidth = step.duration * px;
          segment.node.style.width = `${segmentWidth}px`;
          segment.label.textContent = formatSeconds(step.duration);
          segment.label.style.display = segmentWidth > 52 ? '' : 'none';
          offset += step.duration;
          const boundary = boundaries[index];
          if (boundary)
            boundary.style.left = `${offset * px - 4}px`;
        });
        if (durationLabel) {
          durationLabel.textContent = durationText;
          durationLabel.style.display = width > 56 ? '' : 'none';
        }
        if (!looping)
          infinity.remove();
        else if (!infinity.isConnected)
          lane.append(infinity);
        markSelected();
      },
      destroy() {
        gone = true;
        stop?.(false);
        ghosts.forEach(ghost => ghost.remove());
        infinity.remove();
        node.remove();
      },
    };
  }
  // A props clip's bar is a composite: clicking it expands its tracks.
  function handleBarClick(clip: TimelineClipMeta, rect: AnchorRect, stepKey?: string) {
    if (!stepKey && clip.tracks?.length) {
      toggleTracks(clip.key);
      return;
    }
    const path = stepKey ? `${clip.key}.${stepKey}` : clip.key;
    if (!clipControls(meta.id, path, stepKey ? undefined : popoverExclusions(clip)).length)
      return;
    const same = popover?.clip.key === clip.key && popover.stepKey === stepKey;
    closeEditor();
    if (same)
      return;
    popover = mountPopover(clip, stepKey, rect);
    popoverView = `${pxPerSecond()}:${viewStart}`;
    rows.forEach(row => row.markSelected());
  }
  // Escape and the close button hand focus back to the bar. Other closes leave it where the press put it.
  function dismissEditor() {
    if (popover)
      returnFocusToClip(section, popover.clip.key);
    closeEditor();
  }
  function closeEditor() {
    if (!popover)
      return;
    popover.destroy();
    popover = null;
    rows.forEach(row => row.markSelected());
  }
  function mountPopover(clip: TimelineClipMeta, stepKey: string | undefined, rect: AnchorRect): PopoverView {
    const path = stepKey ? `${clip.key}.${stepKey}` : clip.key;
    const heading = stepKey ? `${clip.label} · ${formatStepLabel(stepKey)}` : clip.label;
    const root = element('div', 'dialkit-root');
    root.dataset.theme = theme;
    const popup = element('div', 'dialkit-timeline-popover');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', `Edit ${heading}`);
    const header = element('div', 'dialkit-timeline-popover-header');
    header.append(element('span', 'dialkit-timeline-popover-title', heading));
    const close = element('button', 'dialkit-timeline-popover-close');
    close.title = 'Close editor';
    close.setAttribute('aria-label', close.title);
    close.append(icon('M6 6l12 12M18 6 6 18'));
    close.addEventListener('click', dismissEditor);
    header.append(close);
    const content = element('div', 'dialkit-timeline-popover-body');
    popup.append(header, content);
    root.append(popup);
    document.body.append(root);
    // Read from the store every time: the clip's controls can change while this is open.
    const controls = () => {
      if (!stepKey)
        return clipControls(meta.id, path, popoverExclusions(clip));
      const list = clipControls(meta.id, path);
      const from = stepKey === clip.stepKeys?.[0] ? controlAt(meta.id, `${clip.key}.from`) : null;
      if (!from)
        return list;
      const toIndex = list.findIndex(control => control.path === `${path}.to`);
      return toIndex >= 0 ? [...list.slice(0, toIndex), from, ...list.slice(toIndex)] : [...list, from];
    };
    const rendererProps = () => {
      const values = DialStore.getValues(meta.id);
      const durationMeta = controlAt(meta.id, `${path}.duration`);
      const duration = durationMeta ? values[durationMeta.path] : undefined;
      return {
        panelId: meta.id,
        controls: controls(),
        values: timelinePopoverDisplayValues(values, clip.key, clip.stepKeys, stepKey),
        transitionDuration: durationMeta?.type === 'slider' && typeof duration === 'number'
          ? { value: duration, onChange: (next: number) => DialStore.updateValue(meta.id, durationMeta.path, next), min: Math.max(TIMELINE_MIN_CLIP_DURATION, durationMeta.min ?? 0), max: durationMeta.max, step: durationMeta.step }
          : undefined,
      };
    };
    const renderer = mountControlRenderer(content, rendererProps());
    let anchorRect = rect;
    let naturalHeight = 0;
    const place = () => {
      const visual = window.visualViewport;
      const viewWidth = visual?.width ?? window.innerWidth;
      const viewHeight = visual?.height ?? window.innerHeight;
      const offsetLeft = visual?.offsetLeft ?? 0;
      const offsetTop = visual?.offsetTop ?? 0;
      const width = Math.min(POPOVER_WIDTH, Math.max(220, viewWidth - 24));
      const left = clamp(anchorRect.left + anchorRect.width / 2 - width / 2, offsetLeft + 12, Math.max(offsetLeft + 12, offsetLeft + viewWidth - width - 12));
      const spaceAbove = Math.max(0, anchorRect.top - offsetTop - 22);
      const spaceBelow = Math.max(0, offsetTop + viewHeight - anchorRect.bottom - 22);
      const above = naturalHeight === 0
        ? spaceAbove >= spaceBelow
        : naturalHeight <= spaceAbove || (naturalHeight > spaceBelow && spaceAbove >= spaceBelow);
      const available = above ? spaceAbove : spaceBelow;
      const height = Math.min(naturalHeight || available, available);
      const top = clamp(above ? anchorRect.top - 10 - height : anchorRect.bottom + 10, offsetTop + 12, Math.max(offsetTop + 12, offsetTop + viewHeight - height - 12));
      Object.assign(popup.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${available}px`, visibility: naturalHeight > 0 ? 'visible' : 'hidden' });
      popup.dataset.placement = above ? 'above' : 'below';
    };
    const measure = () => {
      naturalHeight = popup.scrollHeight + 2;
      place();
    };
    const follow = () => {
      const next = clipAnchorRect(section, clip.key, stepKey);
      if (next) {
        anchorRect = next;
        place();
      }
    };
    place();
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (popup.contains(target) || isFloatingControlTarget(target) || target.closest?.('.dialkit-timeline-clip, .dialkit-timeline-label'))
        return;
      closeEditor();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented)
        dismissEditor();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    close.focus({ preventScroll: true });
    return {
      clip,
      stepKey,
      follow,
      update() {
        root.dataset.theme = theme;
        const next = rendererProps();
        popup.style.display = next.controls.length ? '' : 'none';
        renderer.update(next);
      },
      destroy() {
        observer.disconnect();
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', key);
        window.removeEventListener('scroll', follow, true);
        window.removeEventListener('resize', follow);
        window.visualViewport?.removeEventListener('resize', place);
        window.visualViewport?.removeEventListener('scroll', place);
        renderer.destroy();
        root.remove();
      },
    };
  }
  const stopValues = DialStore.subscribe(meta.id, render);
  const stopTransport = TimelineStore.subscribe(meta.id, transport);
  const observer = new ResizeObserver(render);
  observer.observe(ruler);
  render();
  return {
    update(next: TimelineMeta, nextTheme: DialTheme) {
      meta = next;
      theme = nextTheme;
      render();
    },
    closeEditor,
    destroy() {
      destroyed = true;
      stopValues();
      stopTransport();
      observer.disconnect();
      clearTimeout(copyTimer);
      playheadScrub.stop();
      overviewScrub.stop();
      rulerScrub.stop();
      trackScrub.stop();
      stopZoom?.(false);
      closeEditor();
      rows.forEach(row => row.destroy());
      rows.clear();
      presets.destroy();
      section.remove();
    },
  };
}
