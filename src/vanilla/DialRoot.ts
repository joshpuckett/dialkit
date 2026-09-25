import { DialStore, type PanelConfig } from '../store/DialStore';
import { TimelineStore } from '../store/TimelineStore';
import { TimelineUiStore } from '../store/TimelineUiStore';
import { blockPanelDragClick, capturePanelPointer, releasePanelPointer, getPanelCorner, getPanelDragHandle, getPanelDragOffset, getPanelDragStart, getPanelOriginX, getPanelOriginY, hasPanelDragMoved, type PanelDragStart, type PanelDragOffset } from '../panel-drag';
import { buildCopyInstruction } from '../copy-instruction';
import { ICON_CLIPBOARD_PLAIN, ICON_CHECK } from '../icons';
import { mountControlRenderer } from './ControlRenderer';
import { mountFolder } from './controls';
import { mountPresetManager } from './menus';
import { mountShortcutListener } from './shortcuts';
import { button, element, icon } from './dom';
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
  onOpenChange?: (open: boolean) => void;
}
export function mountPanelToolbar(host: HTMLElement, id: string, hookName = 'createDialKit') {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const presetProps = () => ({ panelId: id, presets: DialStore.getPresets(id), activePresetId: DialStore.getActivePresetId(id) });
  const presets = mountPresetManager(host, presetProps());
  const copy = button('Copy parameters', [ICON_CLIPBOARD_PLAIN.board, ICON_CLIPBOARD_PLAIN.body], async () => {
    try {
      await navigator.clipboard.writeText(buildCopyInstruction(hookName, DialStore.getPanel(id)?.name ?? '', DialStore.getValues(id)));
    }
    catch {
      return;
    }
    if (destroyed)
      return;
    copy.replaceChildren(icon(ICON_CHECK));
    clearTimeout(timer);
    timer = setTimeout(() => copy.replaceChildren(icon([ICON_CLIPBOARD_PLAIN.board, ICON_CLIPBOARD_PLAIN.body])), 1500);
  });
  copy.classList.add('dialkit-toolbar-primary');
  host.append(copy);
  const stop = DialStore.subscribe(id, () => presets.update(presetProps()));
  return {
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      stop();
      presets.destroy();
      copy.remove();
    }
  };
}
export function createDialRoot(initial: DialRootOptions = {}) {
  let options = initial;
  const root = element('div', 'dialkit-root');
  const shell = element('div', 'dialkit-panel');
  root.append(shell);
  const inline = options.mode === 'inline';
  root.dataset.mode = shell.dataset.mode = inline ? 'inline' : 'popover';
  root.dataset.theme = options.theme ?? 'system';
  let position = options.position ?? 'top-right';
  shell.dataset.position = position;
  let offset: PanelDragOffset | null = null;
  let drag: {
    start: PanelDragStart;
    handle: HTMLElement;
    id: number;
    moved: boolean;
  } | undefined;
  const origin = () => {
    shell.dataset.originX = getPanelOriginX(position, offset);
    shell.dataset.originY = getPanelOriginY(position, offset);
  };
  origin();
  let shellOpen = inline || (options.defaultOpen ?? true);
  let lastOpen = shellOpen;
  let signature = '';
  let children: {
    destroy(): void;
  }[] = [];
  let shellFolder: ReturnType<typeof mountFolder> | undefined;
  let destroyed = false;
  const notify = (open: boolean) => {
    if (lastOpen !== open) {
      lastOpen = open;
      options.onOpenChange?.(open);
    }
  };
  function setShellOpen(open: boolean) {
    shellOpen = open;
    shellFolder?.update({ title: 'DialKit', open, isRoot: true, inline, onOpenChange: setShellOpen });
    notify(open);
  }
  function timelineToggle(host: HTMLElement) {
    if (!TimelineStore.getTimelines().length)
      return;
    const toggle = button('Toggle timeline', ['M3 5h18v14H3z', 'M7 9h10M7 13h6'], () => TimelineUiStore.toggle());
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
    DialStore.initPanelOpen(panel.id, isRoot ? inline || (options.defaultOpen ?? true) : true);
    const folderProps = () => ({
      title: DialStore.getPanel(panel.id)?.name ?? panel.name, open: DialStore.getPanelOpen(panel.id), isRoot, isSection: !isRoot, inline: isRoot && inline, onOpenChange: (open: boolean) => {
        DialStore.setPanelOpen(panel.id, open);
        if (isRoot)
          notify(open);
      }
    });
    const folder = mountFolder(host, folderProps());
    const toolbar = folder.toolbar;
    const toolbarView = mountPanelToolbar(toolbar, panel.id);
    if (isRoot)
      timelineToggle(toolbar);
    const rendererProps = () => ({ panelId: panel.id, controls: DialStore.getPanel(panel.id)?.controls ?? [], values: DialStore.getValues(panel.id) });
    const renderer = mountControlRenderer(folder.body, rendererProps());
    const update = () => {
      folder.update(folderProps());
      renderer.update(rendererProps());
    };
    const stop = DialStore.subscribe(panel.id, update);
    children.push({
      destroy() {
        stop();
        toolbarView.destroy();
        renderer.destroy();
        folder.destroy();
      }
    });
  }
  function render() {
    if (destroyed)
      return;
    const panels = DialStore.getPanels('panel');
    const timelines = TimelineStore.getTimelines();
    root.style.display = panels.length || timelines.length ? '' : 'none';
    const next = JSON.stringify([panels.map(p => [p.id, p.name, p.controls]), timelines.length > 0]);
    if (next === signature)
      return;
    signature = next;
    children.forEach(child => child.destroy());
    children = [];
    shell.replaceChildren();
    shellFolder = undefined;
    if (!panels.length && !timelines.length)
      return;
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
  const endDrag = () => {
    if (!drag)
      return;
    const current = drag;
    drag = undefined;
    releasePanelPointer(current.handle, current.id);
    if (current.moved)
      blockPanelDragClick(current.handle);
  };
  if (!inline) {
    shell.addEventListener('pointerdown', event => {
      if (event.button !== 0)
        return;
      const handle = getPanelDragHandle(event.target, shell);
      if (!handle)
        return;
      event.preventDefault();
      drag = { start: getPanelDragStart(event.clientX, event.clientY, shell), handle, id: event.pointerId, moved: false };
      capturePanelPointer(handle, event.pointerId);
    });
    shell.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId || (!drag.moved && !hasPanelDragMoved(drag.start, event.clientX, event.clientY)))
        return;
      drag.moved = true;
      offset = getPanelDragOffset(drag.start, event.clientX, event.clientY);
      delete shell.dataset.position;
      Object.assign(shell.style, { left: `${offset.x}px`, top: `${offset.y}px`, right: 'auto', bottom: 'auto' });
      origin();
    });
    shell.addEventListener('pointerup', endDrag);
    shell.addEventListener('pointercancel', endDrag);
    shell.addEventListener('lostpointercapture', endDrag);
  }
  if (options.productionEnabled !== false)
    (options.target ?? document.body).append(root);
  const shortcuts = options.productionEnabled !== false ? mountShortcutListener() : undefined;
  const stopGlobal = options.productionEnabled !== false ? DialStore.subscribeGlobal(render) : () => {
  };
  const stopTimelines = options.productionEnabled !== false ? TimelineStore.subscribeGlobal(render) : () => {
  };
  const stopOpen = DialStore.subscribePanelOpen((id, open) => {
    if (destroyed)
      return;
    const panels = DialStore.getPanels('panel');
    if (!panels.some(p => p.id === id))
      return;
    if (panels.length > 1 && open)
      setShellOpen(true);
    else if (panels.length === 1)
      notify(open);
    if (!open && !inline && offset) {
      position = getPanelCorner(position, offset);
      offset = null;
      shell.style.cssText = '';
      shell.dataset.position = position;
      origin();
    }
  });
  if (options.productionEnabled !== false)
    render();
  return {
    element: root,
    /** Apply new settings in place; `defaultOpen` only affects panels registered afterwards. */
    update(next: Pick<DialRootOptions, 'theme' | 'position' | 'defaultOpen' | 'onOpenChange'>) {
      if (destroyed)
        return;
      options = { ...options, ...next };
      root.dataset.theme = options.theme ?? 'system';
      if (next.position && next.position !== position) {
        position = next.position;
        // A dragged panel keeps its offset and adopts the corner when it next collapses.
        if (!inline && !offset) {
          shell.dataset.position = position;
          origin();
        }
      }
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      endDrag();
      stopGlobal();
      stopTimelines();
      stopOpen();
      shortcuts?.destroy();
      children.forEach(child => child.destroy());
      root.remove();
    }
  };
}
export const DialRoot = createDialRoot;
