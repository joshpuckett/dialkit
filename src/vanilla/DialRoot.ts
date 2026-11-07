import { DialStore, type PanelConfig } from '../store/DialStore';
import { TimelineStore } from '../store/TimelineStore';
import { TimelineUiStore } from '../store/TimelineUiStore';
import { blockPanelDragClick, clampPanelOffset, getPanelCorner, getPanelDragHandle, getPanelDragOffset, getPanelDragStart, getPanelOriginX, getPanelOriginY, hasPanelDragMoved, type PanelDragOffset } from '../panel-drag';
import { startPointerGesture, type StopGesture } from '../pointer-gesture';
import { buildCopyInstruction, copyText } from '../copy-instruction';
import { ICON_CLIPBOARD_PLAIN, ICON_CHECK, ICON_TIMELINE } from '../icons';
import { mountControlRenderer } from './ControlRenderer';
import { mountFolder } from './controls';
import { mountPresetManager } from './menus';
import { mountShortcutListener } from './shortcuts';
import { button, element, icon, svg } from './dom';
import { mountVersionGallery, type DialVersions } from '../versions/gallery';
export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';
export interface DialRootOptions {
  target?: HTMLElement;
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  theme?: DialTheme;
  /** Plain HTML has no build-mode detection; enabled by default. */
  productionEnabled?: boolean;
  /** How saved versions appear: captured thumbnails (default), or a menu. */
  versions?: DialVersions;
  onOpenChange?: (open: boolean) => void;
}
export function mountPanelToolbar(host: HTMLElement, id: string, hookName = 'createDialKit', versions: DialVersions = 'menu') {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const gallery = versions !== 'menu';
  const presetProps = () => ({ panelId: id, presets: DialStore.getPresets(id), activePresetId: DialStore.getActivePresetId(id) });
  const presets = gallery ? null : mountPresetManager(host, presetProps());
  // With a version gallery the copy button spans the toolbar and gets a label.
  const copyContent = (copied: boolean) => {
    const glyph = icon(copied ? ICON_CHECK : [ICON_CLIPBOARD_PLAIN.board, ICON_CLIPBOARD_PLAIN.body]);
    return gallery ? [glyph, element('span', '', copied ? 'Copied' : 'Copy parameters')] : [glyph];
  };
  const copy = button('Copy parameters', [ICON_CLIPBOARD_PLAIN.board, ICON_CLIPBOARD_PLAIN.body], async () => {
    if (!(await copyText(buildCopyInstruction(hookName, DialStore.getPanel(id)?.name ?? '', DialStore.getValues(id)))) || destroyed)
      return;
    copy.replaceChildren(...copyContent(true));
    clearTimeout(timer);
    timer = setTimeout(() => copy.replaceChildren(...copyContent(false)), 1500);
  });
  copy.classList.add('dialkit-toolbar-primary');
  if (gallery) {
    copy.dataset.wide = 'true';
    copy.replaceChildren(...copyContent(false));
  }
  host.append(copy);
  const stop = DialStore.subscribe(id, () => presets?.update(presetProps()));
  return {
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      stop();
      presets?.destroy();
      copy.remove();
    }
  };
}
export function createDialRoot(options: DialRootOptions = {}) {
  const root = element('div', 'dialkit-root');
  const inline = options.mode === 'inline';
  root.dataset.mode = inline ? 'inline' : 'popover';
  root.dataset.theme = options.theme ?? 'system';
  // Off means off: nothing subscribes and nothing fires.
  if (options.productionEnabled === false)
    return { element: root, destroy() { root.remove(); } };
  const shell = element('div', 'dialkit-panel');
  root.append(shell);
  shell.dataset.mode = root.dataset.mode;
  const position = options.position ?? 'top-right';
  const defaultOpen = inline || (options.defaultOpen ?? true);
  let activePosition = position;
  let offset: PanelDragOffset | null = null;
  let lastDragOffset: PanelDragOffset | null = null;
  let stopDrag: StopGesture | null = null;
  const setOffset = (next: PanelDragOffset | null) => {
    offset = next;
    if (inline)
      return;
    if (offset) {
      delete shell.dataset.position;
      Object.assign(shell.style, { left: `${offset.x}px`, top: `${offset.y}px`, right: 'auto', bottom: 'auto' });
    }
    else {
      shell.dataset.position = activePosition;
      Object.assign(shell.style, { left: '', top: '', right: '', bottom: '' });
    }
    shell.dataset.originX = getPanelOriginX(activePosition, offset);
    shell.dataset.originY = getPanelOriginY(activePosition, offset);
  };
  setOffset(null);
  let panels: PanelConfig[] = [];
  let timelineCount = 0;
  let shellOpen = defaultOpen;
  let wasOpen = shellOpen;
  let reported: boolean | null = null;
  let layout: { count: number; open: boolean } | null = null;
  let signature = '';
  let children: {
    destroy(): void;
  }[] = [];
  let shellFolder: ReturnType<typeof mountFolder> | undefined;
  let destroyed = false;
  const isVisible = () => panels.length > 0 || timelineCount > 0;
  // One home per layout: a lone panel is its own root, everything else is the shell.
  const rootOpen = () => panels.length === 1 ? DialStore.getPanelOpen(panels[0].id) ?? defaultOpen : shellOpen;
  // Runs before views mount, so a carried state beats a panel's own default.
  function carryOpenAcrossLayouts() {
    if (!isVisible() || !layout || layout.count === panels.length || layout.open === rootOpen())
      return;
    if (panels.length !== 1)
      shellOpen = layout.open;
    else if (layout.count > 1)
      DialStore.setPanelOpen(panels[0].id, layout.open);
    else if (DialStore.getPanelOpen(panels[0].id) === undefined)
      DialStore.initPanelOpen(panels[0].id, layout.open);
  }
  function settleOpen() {
    if (!isVisible())
      return;
    const open = rootOpen();
    layout = { count: panels.length, open };
    // Snap to a corner on open, and restore the dragged position on close.
    if (wasOpen !== open && !inline) {
      if (open) {
        lastDragOffset = offset ?? lastDragOffset;
        activePosition = offset ? getPanelCorner(position, offset) : position;
        setOffset(null);
      }
      else if (offset)
        lastDragOffset = offset;
      else if (lastDragOffset)
        setOffset(lastDragOffset);
    }
    wasOpen = open;
    const changed = reported !== null && reported !== open;
    reported = open;
    if (changed)
      options.onOpenChange?.(open);
  }
  function setShellOpen(open: boolean) {
    shellOpen = open;
    shellFolder?.update({ title: 'DialKit', open, isRoot: true, inline, onOpenChange: setShellOpen });
    settleOpen();
  }
  function timelineToggle(host: HTMLElement) {
    if (!timelineCount)
      return;
    const toggle = button('Toggle timeline', [], () => TimelineUiStore.toggle());
    const glyph = svg('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' });
    ICON_TIMELINE.forEach(d => glyph.append(svg('path', { d, fill: 'currentColor' })));
    toggle.replaceChildren(glyph);
    host.append(toggle);
    const sync = () => toggle.setAttribute('aria-pressed', String(TimelineUiStore.getVisible()));
    const stop = TimelineUiStore.subscribe(sync);
    sync();
    children.push({
      destroy() {
        stop();
        toggle.remove();
      }
    });
  }
  function panelView(panel: PanelConfig, host: HTMLElement, isRoot: boolean) {
    DialStore.initPanelOpen(panel.id, isRoot ? defaultOpen : true);
    const folderProps = () => ({
      title: DialStore.getPanel(panel.id)?.name ?? panel.name, open: DialStore.getPanelOpen(panel.id), isRoot, isSection: !isRoot, inline: isRoot && inline, onOpenChange: (open: boolean) => DialStore.setPanelOpen(panel.id, open)
    });
    const folder = mountFolder(host, folderProps());
    const toolbar = folder.toolbar;
    const versions = options.versions ?? 'thumbnails';
    const toolbarView = mountPanelToolbar(toolbar, panel.id, 'createDialKit', versions);
    if (isRoot)
      timelineToggle(toolbar);
    const rendererProps = () => ({ panelId: panel.id, controls: DialStore.getPanel(panel.id)?.controls ?? [], values: DialStore.getValues(panel.id) });
    const renderer = mountControlRenderer(folder.body, rendererProps());
    const gallery = versions === 'menu' ? null : mountVersionGallery(folder.body, { panelId: panel.id, theme: options.theme });
    const update = () => {
      folder.update(folderProps());
      renderer.update(rendererProps());
      if (isRoot)
        settleOpen();
    };
    const stop = DialStore.subscribe(panel.id, update);
    children.push({
      destroy() {
        stop();
        toolbarView.destroy();
        gallery?.destroy();
        renderer.destroy();
        folder.destroy();
      }
    });
  }
  function render() {
    if (destroyed)
      return;
    panels = DialStore.getPanels('panel');
    // Timeline panels render in the dock, so they only add a toggle while one is mounted.
    timelineCount = TimelineUiStore.hasDock() ? TimelineStore.getTimelines().length : 0;
    carryOpenAcrossLayouts();
    root.style.display = isVisible() ? '' : 'none';
    const next = JSON.stringify([panels.map(p => [p.id, p.name, p.controls]), timelineCount > 0]);
    if (next !== signature) {
      signature = next;
      children.forEach(child => child.destroy());
      children = [];
      shell.replaceChildren();
      shellFolder = undefined;
      if (isVisible()) {
        const wrapper = element('div', 'dialkit-panel-wrapper');
        shell.append(wrapper);
        shell.dataset.multiple = String(panels.length > 1);
        if (panels.length === 1)
          panelView(panels[0], wrapper, true);
        else {
          shellFolder = mountFolder(wrapper, { title: 'DialKit', open: shellOpen, isRoot: true, inline, onOpenChange: setShellOpen });
          children.push(shellFolder);
          timelineToggle(shellFolder.toolbar);
          panels.forEach(panel => panelView(panel, shellFolder!.body, false));
          if (!panels.length)
            shellFolder.body.append(element('div', 'dialkit-timeline-toolkit-only', 'Timeline'));
        }
      }
    }
    settleOpen();
  }
  const onResize = () => {
    if (offset)
      setOffset(clampPanelOffset(offset, shell.getBoundingClientRect().width));
    if (lastDragOffset)
      lastDragOffset = clampPanelOffset(lastDragOffset);
  };
  if (!inline) {
    shell.addEventListener('pointerdown', event => {
      const handle = getPanelDragHandle(event.target, shell);
      if (!handle || stopDrag)
        return;
      const start = getPanelDragStart(event.clientX, event.clientY, shell);
      const startOffset = offset;
      let moved = false;
      stopDrag = startPointerGesture(event, handle, {
        move(next) {
          if (!moved && !hasPanelDragMoved(start, next.clientX, next.clientY))
            return;
          moved = true;
          setOffset(getPanelDragOffset(start, next.clientX, next.clientY));
        },
        end(cancelled) {
          stopDrag = null;
          if (!moved)
            return;
          if (cancelled)
            setOffset(startOffset);
          // A drag must not also count as a click that toggles the panel.
          else
            blockPanelDragClick(handle);
        },
      });
    });
    window.addEventListener('resize', onResize);
  }
  (options.target ?? document.body).append(root);
  const shortcuts = mountShortcutListener();
  const stopGlobal = DialStore.subscribeGlobal(render);
  const stopTimelines = TimelineStore.subscribeGlobal(render);
  const stopDock = TimelineUiStore.subscribe(render);
  // Requests to open a panel also reveal the shell it sits in.
  const stopOpen = DialStore.subscribePanelOpen((id, open) => {
    if (open && panels.length > 1 && panels.some(p => p.id === id))
      setShellOpen(true);
  });
  render();
  return {
    element: root, destroy() {
      if (destroyed)
        return;
      destroyed = true;
      stopDrag?.(false);
      window.removeEventListener('resize', onResize);
      stopGlobal();
      stopTimelines();
      stopDock();
      stopOpen();
      shortcuts.destroy();
      children.forEach(child => child.destroy());
      root.remove();
    }
  };
}
export const DialRoot = createDialRoot;
