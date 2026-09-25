import { DialStore, formatLabel } from '../store/DialStore';
import { TimelineStore, type TimelineMeta, type TimelineClipMeta } from '../store/TimelineStore';
import { TimelineUiStore } from '../store/TimelineUiStore';
import { clampClipMove, clampClipResizeEnd, clampClipResizeStart, clampStepResize, clampTrackDelay, computeClipStaticFromValues, formatSeconds, formatStepLabel, normalizeTimelineValuesForCopy, TIMELINE_MIN_CLIP_DURATION, timelinePopoverDisplayValues, type TimelineStepStatic } from '../timeline-core';
import { clamp } from '../transition-math';
import { eventWithin, findControl } from '../shortcut-utils';
import { getDropdownPosition, showInTopLayer } from '../dropdown-position';
import { buildCopyInstruction } from '../copy-instruction';
import { ICON_CHEVRON, ICON_PLAY, ICON_PAUSE, ICON_REPLAY, ICON_CLIPBOARD_PLAIN, ICON_CHECK } from '../icons';
import { mountControlRenderer } from './ControlRenderer';
import { mountPresetManager } from './menus';
import { element, icon, button } from './dom';
import type { DialTheme } from './DialRoot';
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
/** Mount the timeline dock independently of the parameter panel. */
export function createDialTimelineRoot(initial: DialTimelineOptions = {}) {
  let options = initial;
  let destroyed = false;
  const root = element('div', 'dialkit-root dialkit-timeline');
  root.dataset.theme = options.theme ?? 'system';
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
  const drag = pointerGesture();
  resize.addEventListener('pointerdown', event => {
    const start = dock.getBoundingClientRect().height;
    drag.start(event, next => {
      height = clamp(start + event.clientY - next.clientY, 120, Math.max(120, window.innerHeight - 24));
      size();
    });
  });
  resize.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      height = clamp(height + (event.key === 'ArrowUp' ? 20 : -20), 120, Math.max(120, window.innerHeight - 24));
      size();
    }
  });
  const sections = new Map<string, ReturnType<typeof mountSection>>();
  const visibilityId = Symbol('vanilla-timeline');
  const controller = () => ({ visible: options.visible, defaultVisible: options.defaultVisible ?? true, onVisibilityChange: options.onVisibilityChange });
  function render() {
    const timelines = TimelineStore.getTimelines();
    root.hidden = options.productionEnabled === false || !timelines.length || !TimelineUiStore.getVisible();
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
  const enabled = options.productionEnabled !== false;
  const stopController = enabled ? TimelineUiStore.registerController(visibilityId, controller()) : () => {
  };
  const stopGlobal = enabled ? TimelineStore.subscribeGlobal(render) : () => {
  };
  const stopVisible = enabled ? TimelineUiStore.subscribe(render) : () => {
  };
  if (enabled) {
    (options.target ?? document.body).append(root);
    render();
  }
  return {
    element: root,
    setVisible(visible: boolean) {
      if (!destroyed)
        TimelineUiStore.requestVisible(visible);
    },
    update(next: Pick<DialTimelineOptions, 'theme' | 'visible' | 'onVisibilityChange'>) {
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
      drag.destroy();
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
/** Window listeners keep a gesture alive while a store edit redraws its bar. */
function pointerGesture() {
  let finish: ((cancelled?: boolean) => void) | undefined;
  return {
    start(event: PointerEvent, move: (event: PointerEvent) => void, end?: (cancelled: boolean) => void) {
      if (event.button !== 0)
        return;
      finish?.(true);
      event.preventDefault();
      event.stopPropagation();
      const onMove = (next: PointerEvent) => {
        if (next.pointerId === event.pointerId) {
          next.preventDefault();
          move(next);
        }
      };
      const onEnd = (next: PointerEvent) => {
        if (next.pointerId === event.pointerId)
          finish?.(next.type === 'pointercancel');
      };
      finish = (cancelled = false) => {
        finish = undefined;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        end?.(cancelled);
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    destroy() {
      finish?.(true);
    },
  };
}
function mountSection(host: HTMLElement, initial: TimelineMeta, options: DialTimelineOptions) {
  let meta = initial;
  let theme = options.theme ?? 'system';
  let open = options.defaultOpen ?? true;
  let zoom = 1, viewStart = 0;
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
    zoom = 1;
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
    try {
      await navigator.clipboard.writeText(buildCopyInstruction('createDialTimeline', meta.name, normalizeTimelineValuesForCopy(DialStore.getValues(meta.id), meta.clips)));
    }
    catch {
      return;
    }
    if (destroyed)
      return;
    copy.replaceChildren(icon(ICON_CHECK));
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => copy.replaceChildren(icon([ICON_CLIPBOARD_PLAIN.board, ICON_CLIPBOARD_PLAIN.body])), 1500);
  });
  copy.classList.add('dialkit-toolbar-primary');
  actions.append(copy);
  const collapse = element('button', 'dialkit-timeline-chevron');
  collapse.append(icon(ICON_CHEVRON));
  collapse.addEventListener('click', () => {
    open = !open;
    closeEditor();
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
  const gesture = pointerGesture();
  let rowElements: HTMLElement[] = [];
  let editor: {
    destroy(): void;
    update(): void;
  } | undefined;
  let selected = '';
  function closeEditor() {
    editor?.destroy();
    editor = undefined;
    selected = '';
    section.querySelectorAll<HTMLElement>('.dialkit-timeline-clip[data-selected]').forEach(node => delete node.dataset.selected);
  }
  const width = () => ruler.clientWidth;
  const visibleDuration = () => meta.duration / zoom;
  const scale = () => meta.duration > 0 ? width() / visibleDuration() : 0;
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
    const x = clamp((state.time - viewStart) * scale(), 0, width());
    const flagOffset = clamp(x, 25, Math.max(25, width() - 25)) - x;
    playhead.style.display = state.time < viewStart || state.time > viewStart + visibleDuration() || !width() ? 'none' : '';
    playhead.style.left = `calc(var(--dial-timeline-label-w) + ${x}px)`;
    playhead.style.setProperty('--dial-timeline-playhead-flag-offset', `${flagOffset}px`);
    playhead.dataset.edge = flagOffset > 0.5 ? 'start' : flagOffset < -0.5 ? 'end' : 'center';
    flag.textContent = state.time.toFixed(2);
    playhead.setAttribute('aria-valuemin', '0');
    playhead.setAttribute('aria-valuemax', String(meta.duration));
    playhead.setAttribute('aria-valuenow', String(state.time));
  }
  function scrub(event: PointerEvent, full = false) {
    const rect = (full ? overview : ruler).getBoundingClientRect();
    if (!rect.width)
      return;
    closeEditor();
    if (event.shiftKey) {
      zoom = 1;
      viewStart = 0;
      render();
    }
    if (event.altKey && !full) {
      const startZoom = zoom, ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1), time = viewStart + ratio * visibleDuration();
      gesture.start(event, next => {
        zoom = clamp(startZoom * Math.exp((next.clientX - event.clientX) / 180), 1, Math.max(8, meta.duration * rect.width / 140));
        viewStart = time - ratio * visibleDuration();
        render();
      });
      return;
    }
    const wasPlaying = TimelineStore.getTransport(meta.id).playing;
    const start = full ? 0 : viewStart, duration = full ? meta.duration : visibleDuration();
    TimelineStore.pause(meta.id);
    const seek = (next: PointerEvent) => {
      const time = clamp(start + (next.clientX - rect.left) / rect.width * duration, start, start + duration);
      TimelineStore.seek(meta.id, time);
      if (full) {
        viewStart = time - visibleDuration() / 2;
        render();
      }
    };
    gesture.start(event, seek, () => {
      if (wasPlaying && !destroyed)
        TimelineStore.play(meta.id);
    });
    seek(event);
  }
  ruler.addEventListener('pointerdown', event => scrub(event));
  playhead.addEventListener('pointerdown', event => scrub(event));
  overview.addEventListener('pointerdown', event => scrub(event, true));
  playhead.addEventListener('keydown', event => {
    const current = TimelineStore.getTransport(meta.id).time;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? meta.duration : event.key === 'ArrowLeft' ? current - (event.shiftKey ? 0.1 : 0.001) : event.key === 'ArrowRight' ? current + (event.shiftKey ? 0.1 : 0.001) : undefined;
    if (next !== undefined) {
      event.preventDefault();
      TimelineStore.seek(meta.id, next);
    }
  });
  body.addEventListener('pointerdown', event => {
    if ((event.target as Element).closest('.dialkit-timeline-lane') && (!(event.target as Element).closest('.dialkit-timeline-clip') || event.shiftKey))
      scrub(event);
  });
  scroll.addEventListener('scroll', () => {
    if (!scale())
      return;
    const next = scroll.scrollLeft / scale();
    if (Math.abs(next - viewStart) < 0.001)
      return;
    viewStart = next;
    closeEditor();
    render();
  });
  body.addEventListener('wheel', event => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (zoom > 1 && delta) {
      event.preventDefault();
      scroll.scrollLeft += delta;
    }
  }, { passive: false });
  function row(label: string, className = '', grouped = false) {
    const root = element('div', `dialkit-timeline-row ${className}`);
    if (grouped)
      root.dataset.grouped = '';
    const caption = element('div', 'dialkit-timeline-label', label), lane = element('div', 'dialkit-timeline-lane');
    root.append(caption, lane);
    grid.insertBefore(root, playhead);
    rowElements.push(root);
    return { root, caption, lane };
  }
  function disclosure(host: HTMLElement, isOpen: boolean, label: string, change: () => void) {
    const b = element('button', 'dialkit-timeline-group-toggle');
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-expanded', String(isOpen));
    b.dataset.open = String(isOpen);
    b.append(icon(ICON_CHEVRON));
    b.addEventListener('click', change);
    host.prepend(b);
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
    viewStart = clamp(viewStart, 0, Math.max(0, meta.duration - visibleDuration()));
    const px = scale();
    ruler.replaceChildren();
    const tickSteps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    let major = tickSteps.find(t => t >= 140 / (px || 1)) ?? 600;
    if (zoom < 1.5 && meta.duration >= 1)
      major = Math.max(1, major);
    for (let i = Math.ceil(viewStart / (major / 10)); i <= Math.floor((viewStart + visibleDuration()) / (major / 10)); i++) {
      const tick = element('div', `dialkit-timeline-tick${i % 10 === 0 ? '' : i % 5 === 0 ? ' dialkit-timeline-tick-medium' : ' dialkit-timeline-tick-fine'}`);
      tick.style.left = `${(i * major / 10 - viewStart) * px}px`;
      if (i % 10 === 0)
        tick.append(element('span', 'dialkit-timeline-tick-label', `${Number((i * major / 10).toFixed(3))}s`));
      ruler.append(tick);
    }
    rowElements.forEach(r => r.remove());
    rowElements = [];
    const values = DialStore.getValues(meta.id);
    let lastGroup: string | undefined;
    for (const clip of meta.clips) {
      if (clip.group && clip.group !== lastGroup) {
        const group = clip.group;
        const r = row(formatLabel(group), 'dialkit-timeline-group-row');
        disclosure(r.caption, !groups.has(group), groups.has(group) ? 'Expand layer' : 'Collapse layer', () => {
          if (!groups.delete(group))
            groups.add(group);
          closeEditor();
          render();
        });
      }
      lastGroup = clip.group;
      if (clip.group && groups.has(clip.group))
        continue;
      const stat = computeClipStaticFromValues(values, clip, meta.duration);
      const r = row(clip.label, '', !!clip.group);
      const composite = !!clip.tracks?.length;
      if (composite)
        disclosure(r.caption, tracks.has(clip.key), tracks.has(clip.key) ? 'Collapse properties' : 'Expand properties', () => {
          if (!tracks.delete(clip.key))
            tracks.add(clip.key);
          closeEditor();
          render();
        });
      bar(r.lane, clip, stat.at, stat.duration, clip.stepKeys?.length ? stat.tracks[0]?.steps : undefined, stat.isPhysics, composite);
      if (composite && tracks.has(clip.key))
        for (const trackRef of clip.tracks!) {
          const track = stat.tracks.find(t => t.prop === trackRef.prop);
          if (!track)
            continue;
          const r = row(formatLabel(trackRef.prop), 'dialkit-timeline-track-row', !!clip.group);
          const trackMeta = { ...clip, key: `${clip.key}.${trackRef.prop}`, label: `${clip.label} · ${formatLabel(trackRef.prop)}`, tracks: undefined, stepKeys: trackRef.stepKeys };
          bar(r.lane, trackMeta, stat.at + track.delay, track.duration, trackRef.stepKeys?.length ? track.steps : undefined, !trackRef.stepKeys?.length && track.steps[0]?.isPhysics === true, false, stat.at, true);
        }
    }
    scrollRow.style.display = zoom > 1 ? '' : 'none';
    spacer.style.width = `${width() * zoom}px`;
    scroll.scrollLeft = viewStart * px;
    transport();
    presets.update(presetProps());
    editor?.update();
  }
  function bar(lane: HTMLElement, clip: TimelineClipMeta, at: number, duration: number, steps: TimelineStepStatic[] | undefined, physics: boolean, composite = false, baseAt = 0, delayMode = false) {
    const px = scale();
    if (clip.loop === 'repeat' && duration > 0)
      for (let index = Math.max(1, Math.floor((viewStart - at) / duration)), count = 0; at + duration * index < meta.duration && count < 256; index++, count++) {
        const ghost = element('div', 'dialkit-timeline-clip-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, { left: `${(at + duration * index - viewStart) * px + 1}px`, width: `${Math.max(1, Math.min(duration, meta.duration - at - duration * index) * px - 2)}px`, background: clip.color });
        lane.append(ghost);
      }
    const node = element('div', 'dialkit-timeline-clip');
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Edit ${clip.label}`);
    Object.assign(node.style, { left: `${(at - viewStart) * px}px`, width: `${Math.max(duration * px, 14)}px`, background: composite ? `${clip.color}80` : clip.color });
    if (steps?.length)
      node.dataset.steps = '';
    if (composite)
      node.dataset.composite = '';
    if (selected === clip.key)
      node.dataset.selected = '';
    node.title = `${clip.label} — ${formatSeconds(at)} for ${physics ? '~' : ''}${formatSeconds(duration)}${physics ? ' (duration set by spring physics)' : ''}${delayMode ? ' · drag to phase-shift' : ''}`;
    const edge = (side: string) => {
      const handle = element('div', 'dialkit-timeline-clip-handle');
      handle.dataset.edge = side;
      node.append(handle);
    };
    if (steps?.length && !composite) {
      let offset = 0;
      for (const [index, step] of steps.entries()) {
        const segment = element('div', 'dialkit-timeline-clip-segment');
        segment.dataset.step = step.key ?? '';
        segment.style.width = `${step.duration * px}px`;
        if (step.duration * px > 52)
          segment.append(element('span', 'dialkit-timeline-clip-duration', formatSeconds(step.duration)));
        node.append(segment);
        offset += step.duration;
        if (!step.isPhysics) {
          const handle = element('div', 'dialkit-timeline-clip-handle');
          handle.dataset.boundary = String(index);
          handle.style.left = `${offset * px - 4}px`;
          node.append(handle);
        }
      }
      if (!steps[0].isPhysics)
        edge('start');
    }
    else {
      if (!physics && !composite && duration > 0)
        edge('start');
      if (duration * px > 56)
        node.append(element('span', 'dialkit-timeline-clip-duration', `${physics && !composite ? '~' : ''}${formatSeconds(duration)}`));
      if (!physics && !composite && duration > 0)
        edge('end');
    }
    lane.append(node);
    if (clip.loop === 'repeat' && duration > 0)
      lane.append(element('span', 'dialkit-timeline-loop-infinity', '∞'));
    const edit = (target: HTMLElement) => {
      if (composite) {
        if (!tracks.delete(clip.key))
          tracks.add(clip.key);
        render();
      }
      else
        openEditor(clip, target.closest<HTMLElement>('[data-step]') ?? node);
    };
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        edit(node);
      }
    });
    node.addEventListener('pointerdown', event => {
      if (event.shiftKey || event.button !== 0 || px <= 0)
        return;
      const target = event.target as HTMLElement;
      const boundary = target.dataset.boundary;
      const mode = boundary !== undefined ? 'boundary' : target.dataset.edge ?? 'move';
      const durations = steps?.map(s => s.duration);
      let moved = false;
      gesture.start(event, next => {
        const dx = next.clientX - event.clientX;
        if (!moved && Math.abs(dx) <= 3)
          return;
        moved = true;
        closeEditor();
        const dt = dx / px;
        if (mode === 'boundary' && steps && durations) {
          const index = Number(boundary);
          DialStore.updateValue(meta.id, `${clip.key}.${steps[index].key}.duration`, clampStepResize(durations[index] + dt, at, durations.reduce((sum, d, i) => sum + (i === index ? 0 : d), 0), meta.duration));
        }
        else if (mode === 'move') {
          DialStore.updateValue(meta.id, `${clip.key}.${delayMode ? 'delay' : 'at'}`, delayMode ? clampTrackDelay(at + dt - baseAt, baseAt, duration, meta.duration) : clampClipMove(at + dt, duration, meta.duration));
        }
        else if (mode === 'end')
          DialStore.updateValue(meta.id, `${clip.key}.duration`, clampClipResizeEnd(duration + dt, at, meta.duration));
        else {
          const result = clampClipResizeStart(Math.max(at + dt, baseAt, 0), at, durations?.[0] ?? duration);
          DialStore.updateValues(meta.id, { [`${clip.key}.${delayMode ? 'delay' : 'at'}`]: delayMode ? Math.max(0, result.at - baseAt) : result.at, [`${clip.key}.${steps?.length ? `${steps[0].key}.` : ''}duration`]: result.duration });
        }
      }, cancelled => {
        if (!destroyed && !moved && !cancelled)
          edit(target);
      });
    });
  }
  function openEditor(clip: TimelineClipMeta, target: HTMLElement) {
    closeEditor();
    selected = clip.key;
    target.closest<HTMLElement>('.dialkit-timeline-clip')?.setAttribute('data-selected', '');
    const stepKey = target.dataset.step || undefined;
    const path = stepKey ? `${clip.key}.${stepKey}` : clip.key;
    const getControl = (path: string) => findControl(DialStore.getPanel(meta.id)?.controls ?? [], path);
    const excluded = new Set([...(clip.stepKeys ?? []), ...(clip.tracks?.map(t => t.prop) ?? [])]);
    let controls = getControl(path)?.children?.filter(c => !['at', 'duration'].includes(c.path.slice(path.length + 1)) && (stepKey || !excluded.has(c.path.slice(path.length + 1)))) ?? [];
    if (stepKey === clip.stepKeys?.[0]) {
      const from = getControl(`${clip.key}.from`);
      if (from) {
        const index = controls.findIndex(c => c.path === `${path}.to`);
        controls = [...controls];
        controls.splice(index < 0 ? controls.length : index, 0, from);
      }
    }
    if (!controls.length)
      return;
    const root = element('div', 'dialkit-root');
    root.dataset.theme = theme;
    const popup = element('div', 'dialkit-timeline-popover');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', `Edit ${clip.label}${stepKey ? ` · ${formatStepLabel(stepKey)}` : ''}`);
    const heading = element('div', 'dialkit-timeline-popover-header');
    heading.append(element('span', 'dialkit-timeline-popover-title', `${clip.label}${stepKey ? ` · ${formatStepLabel(stepKey)}` : ''}`));
    const close = element('button', 'dialkit-timeline-popover-close');
    close.title = 'Close editor';
    close.setAttribute('aria-label', close.title);
    close.append(icon('M6 6l12 12M18 6 6 18'));
    close.addEventListener('click', closeEditor);
    heading.append(close);
    const content = element('div', 'dialkit-timeline-popover-body');
    popup.append(heading, content);
    root.append(popup);
    // Keep the owning tree's styles without inheriting the dock's lower stacking context.
    const tree = target.getRootNode();
    const container = tree instanceof ShadowRoot ? tree : target.ownerDocument.body;
    container.append(root);
    // A transformed host is the containing block for fixed descendants, so render in the top layer.
    showInTopLayer(popup);
    const rendererProps = () => {
      const values = DialStore.getValues(meta.id);
      const durationMeta = getControl(`${path}.duration`);
      const duration = values[`${path}.duration`];
      return { panelId: meta.id, controls, values: timelinePopoverDisplayValues(values, clip.key, clip.stepKeys, stepKey), transitionDuration: durationMeta?.type === 'slider' && typeof duration === 'number' ? { value: duration, onChange: (v: number) => DialStore.updateValue(meta.id, `${path}.duration`, v), min: Math.max(TIMELINE_MIN_CLIP_DURATION, durationMeta.min ?? 0), max: durationMeta.max, step: durationMeta.step } : undefined };
    };
    const renderer = mountControlRenderer(content, rendererProps());
    const rect = target.getBoundingClientRect();
    const position = () => {
      const p = getDropdownPosition({ getBoundingClientRect: () => rect } as HTMLElement, document.body, { fixed: true, width: 280, maxHeight: window.innerHeight - 24, dropdownHeight: popup.scrollHeight + 2 });
      Object.assign(popup.style, { left: `${clamp(rect.left + rect.width / 2 - p.width / 2, 12, Math.max(12, window.innerWidth - p.width - 12))}px`, top: `${p.top}px`, width: `${p.width}px`, maxHeight: `${p.maxHeight}px` });
      popup.dataset.placement = p.above ? 'above' : 'below';
    };
    const observer = new ResizeObserver(position);
    observer.observe(popup);
    window.addEventListener('resize', position);
    position();
    const outside = (event: PointerEvent) => {
      const origin = event.composedPath()[0];
      if (!eventWithin(event, root) && !(origin instanceof Element && origin.closest('.dialkit-timeline-clip')))
        closeEditor();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        closeEditor();
      }
    };
    document.addEventListener('pointerdown', outside);
    root.addEventListener('keydown', key);
    close.focus({ preventScroll: true });
    editor = {
      update() {
        root.dataset.theme = theme;
        renderer.update(rendererProps());
      }, destroy() {
        observer.disconnect();
        window.removeEventListener('resize', position);
        document.removeEventListener('pointerdown', outside);
        renderer.destroy();
        root.remove();
      }
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
    }, closeEditor, destroy() {
      destroyed = true;
      gesture.destroy();
      clearTimeout(copyTimer);
      stopValues();
      stopTransport();
      observer.disconnect();
      closeEditor();
      presets.destroy();
      section.remove();
    }
  };
}
