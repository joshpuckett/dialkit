// The version gallery shown at the top of a panel when `versions` is
// 'thumbnails': Save version, the all-versions toggle, and one thumbnail per
// version. Plain DOM, so every framework mounts the same thing.

import { DialStore } from '../store/DialStore';
import { ICON_CLOSE, ICON_GRID, ICON_PLUS } from '../icons';
import { element, icon, svg, type Mounted } from '../vanilla/dom';
import { ArrivalStore, saveVersionWithAppshot } from './appshot';
import { deleteVersion, listVersions, openVersionsOverview, renameVersion, selectVersion, watchVersionThumbnails } from './controller';
import type { VersionGridHandle } from './grid';
import { ThumbnailStore, versionKey } from './thumbnails';

/** How a panel shows its versions: captured thumbnails (default), or a menu. */
export type DialVersions = 'menu' | 'thumbnails';

export interface VersionGalleryProps {
  panelId: string;
  theme?: 'light' | 'dark' | 'system';
}

export function mountVersionGallery(host: HTMLElement, initial: VersionGalleryProps): Mounted<VersionGalleryProps> {
  let props = initial;
  let overview: VersionGridHandle | null = null;
  let opening = false;
  let saving = false;
  let editing: string | null = null;
  let switchingTo: string | null = null;
  let destroyed = false;

  const root = element('div', 'dialkit-versions');
  const actions = element('div', 'dialkit-versions-actions');
  const save = element('button', 'dialkit-versions-button');
  save.dataset.primary = 'true';
  save.append(icon(ICON_PLUS, '', '0 0 24 24'), 'Save version');
  const toggle = element('button', 'dialkit-versions-button');
  toggle.dataset.icon = 'true';
  const grid = svg('svg', { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' });
  for (const d of ICON_GRID) grid.append(svg('path', { d }));
  toggle.append(grid);
  actions.append(save, toggle);
  const strip = element('div', 'dialkit-versions-strip');
  strip.setAttribute('role', 'listbox');
  strip.setAttribute('aria-label', 'Versions');
  root.append(actions, strip);
  host.prepend(root);

  const thumbs = new Map<string, HTMLElement>();

  // With the grid open it's unclear which version Copy would copy, so the
  // panel's copy button is disabled until the grid closes.
  const syncCopy = (disabled: boolean) => {
    const panel = root.closest('.dialkit-folder');
    panel?.toggleAttribute('data-version-overview', disabled);
    const copy = panel?.querySelector<HTMLButtonElement>('.dialkit-toolbar-primary[data-wide]');
    if (copy) copy.disabled = disabled;
  };

  // These states exclude each other: each would otherwise act on a version list
  // or a live page that the one in progress is about to change.
  const busy = () => !!overview || opening || saving;

  const render = () => {
    const { panelId } = props;
    const versions = listVersions(panelId);
    const activeKey = versionKey(DialStore.getActivePresetId(panelId));
    const arrival = ArrivalStore.get(panelId);
    const many = versions.length > 1;

    root.dataset.panel = panelId;
    toggle.hidden = !many;
    toggle.setAttribute('aria-pressed', String(!!overview || opening));
    root.toggleAttribute('data-overview', !!overview);
    syncCopy(!!overview);
    // The grid only shows the versions it opened with, so saving waits for it to close.
    save.disabled = busy();
    toggle.setAttribute('aria-label', `All versions (${versions.length})`);
    toggle.title = `All versions (${versions.length})`;
    // Thumbnails appear once there's something to compare.
    strip.hidden = !many;

    const keys = new Set(versions.map((v) => v.key));
    for (const [key, node] of thumbs) {
      if (!keys.has(key)) { node.remove(); thumbs.delete(key); }
    }
    versions.forEach((version, index) => {
      const node = thumbs.get(version.key) ?? createThumb(version.key);
      const frame = node.firstElementChild as HTMLButtonElement;
      node.dataset.active = String(version.key === activeKey);
      frame.setAttribute('aria-selected', String(version.key === activeKey));
      frame.setAttribute('aria-label', version.name);
      if (arrival?.key === version.key) node.dataset.arrival = arrival.stage;
      else delete node.dataset.arrival;

      const img = frame.querySelector('img');
      if (version.thumbnail && img?.getAttribute('src') !== version.thumbnail.src) {
        const next = img ?? element('img');
        next.alt = '';
        next.draggable = false;
        next.src = version.thumbnail.src;
        if (!img) frame.append(next);
      }
      const label = node.querySelector<HTMLElement>('.dialkit-version-thumb-label');
      if (label && editing !== version.key) label.textContent = version.name;
      const remove = node.querySelector('.dialkit-version-thumb-delete');
      if (remove) remove.setAttribute('aria-label', `Delete ${version.name}`);

      if (strip.children[index] !== node) strip.insertBefore(node, strip.children[index] ?? null);
    });
  };

  const createThumb = (key: string) => {
    const node = element('div', 'dialkit-version-thumb');
    node.dataset.version = key;
    const frame = element('button', 'dialkit-version-thumb-frame');
    frame.setAttribute('role', 'option');
    // With the grid open, picking a thumbnail zooms into that version.
    frame.addEventListener('click', () => {
      if (overview) overview.select(key);
      else void switchTo(key);
    });
    const label = element('span', 'dialkit-version-thumb-label');
    label.title = 'Double-click to rename';
    label.addEventListener('dblclick', () => rename(key, label));
    node.append(frame, label);
    if (key !== versionKey(null)) {
      const remove = element('button', 'dialkit-version-thumb-delete');
      remove.append(icon(ICON_CLOSE));
      remove.addEventListener('click', () => { if (!busy()) deleteVersion(props.panelId, key); });
      node.append(remove);
    }
    thumbs.set(key, node);
    return node;
  };

  // Inline rename: Enter saves, Escape cancels, blur saves.
  const rename = (key: string, label: HTMLElement) => {
    const current = listVersions(props.panelId).find((v) => v.key === key)?.name ?? '';
    const input = element('input', 'dialkit-version-thumb-label dialkit-version-thumb-input');
    input.value = current;
    input.setAttribute('aria-label', 'Version name');
    editing = key;
    let done = false;
    const end = (commit: boolean) => {
      if (done) return;
      done = true;
      editing = null;
      input.replaceWith(label);
      if (commit) renameVersion(props.panelId, key, input.value);
      render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') end(true);
      else if (e.key === 'Escape') end(false);
    });
    input.addEventListener('blur', () => end(true));
    label.replaceWith(input);
    input.focus();
    input.select();
  };

  // Bring the outgoing version's thumbnail up to date before leaving it. While
  // that capture runs, the latest pick wins.
  const switchTo = async (key: string) => {
    if (switchingTo !== null) { switchingTo = key; return; }
    if (saving || opening) return;
    if (key === versionKey(DialStore.getActivePresetId(props.panelId))) return;
    switchingTo = key;
    await watcher.flush();
    const next = switchingTo;
    switchingTo = null;
    if (!destroyed) selectVersion(props.panelId, next);
  };

  save.addEventListener('click', async () => {
    if (busy()) return;
    saving = true;
    render();
    try {
      await saveVersionWithAppshot(props.panelId, async (key) => {
        // Let the new card lay out before measuring it.
        await new Promise(requestAnimationFrame);
        const slot = thumbs.get(key)?.querySelector<HTMLElement>('.dialkit-version-thumb-frame') ?? null;
        slot?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return slot;
      });
    } finally {
      saving = false;
      if (!destroyed) render();
    }
  });

  toggle.addEventListener('click', async () => {
    if (overview) {
      overview.dismiss();
      return;
    }
    if (opening || saving) return;
    // The grid zooms out of the live page, so the active card must match it.
    opening = true;
    render();
    await watcher.flush();
    opening = false;
    if (destroyed) return;
    overview = openVersionsOverview(props.panelId, props.theme, () => {
      overview = null;
      render();
    });
    render();
  });

  const syncAspect = () => root.style.setProperty('--dialkit-version-aspect', String(window.innerWidth / window.innerHeight));
  syncAspect();
  window.addEventListener('resize', syncAspect);

  let watcher = watchVersionThumbnails(props.panelId);
  let stopStore = DialStore.subscribe(props.panelId, render);
  const stopThumbnails = ThumbnailStore.subscribe(render);
  const stopArrivals = ArrivalStore.subscribe(render);
  render();

  return {
    update(next) {
      if (next.panelId !== props.panelId) {
        watcher.stop();
        stopStore();
        thumbs.forEach((node) => node.remove());
        thumbs.clear();
        watcher = watchVersionThumbnails(next.panelId);
        stopStore = DialStore.subscribe(next.panelId, render);
      }
      props = next;
      render();
    },
    destroy() {
      destroyed = true;
      overview?.close();
      syncCopy(false);
      watcher.stop();
      stopStore();
      stopThumbnails();
      stopArrivals();
      window.removeEventListener('resize', syncAspect);
      root.remove();
    },
  };
}
