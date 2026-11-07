// Framework-agnostic glue between DialStore versions (presets) and their
// thumbnails, shared by every framework's version gallery.

import { DialStore } from '../store/DialStore';
import { openVersionGrid, type GridVersion, type VersionGridHandle } from './grid';
import { BASE_VERSION, captureViewport, ThumbnailStore, versionKey } from './thumbnails';

export type VersionEntry = GridVersion & { presetId: string | null };

const SETTLE_DELAY_MS = 900;

/** All versions of a panel, oldest first, starting with the base version. */
export function listVersions(panelId: string): VersionEntry[] {
  const thumbnails = ThumbnailStore.getAll(panelId);
  const presets = DialStore.getPresets(panelId);
  return [
    { key: BASE_VERSION, presetId: null, name: DialStore.getBaseName(panelId), thumbnail: thumbnails[BASE_VERSION] },
    ...presets.map((preset) => ({
      key: preset.id,
      presetId: preset.id,
      name: preset.name,
      thumbnail: thumbnails[preset.id],
    })),
  ];
}

export function selectVersion(panelId: string, key: string): void {
  if (key === BASE_VERSION) DialStore.clearActivePreset(panelId);
  else DialStore.loadPreset(panelId, key);
}

export function renameVersion(panelId: string, key: string, name: string): void {
  DialStore.renamePreset(panelId, key === BASE_VERSION ? null : key, name);
}

export function deleteVersion(panelId: string, key: string): void {
  if (key === BASE_VERSION) return;
  DialStore.deletePreset(panelId, key);
  ThumbnailStore.delete(panelId, key);
}

export type ThumbnailWatcher = {
  /** Recapture the active version now if its thumbnail is missing or stale. */
  flush: () => Promise<void>;
  stop: () => void;
};

/**
 * Track which thumbnails are out of date. Editing a version only marks its
 * thumbnail stale; the gallery flushes before leaving the version or opening
 * the grid, so the page isn't captured on every change. A version without a
 * thumbnail gets one as soon as the page settles on it, before any edits, so
 * saving those edits as a new version leaves it with its own picture.
 */
export function watchVersionThumbnails(panelId: string): ThumbnailWatcher {
  const activeKey = () => versionKey(DialStore.getActivePresetId(panelId));
  const valuesOf = () => JSON.stringify(DialStore.getValues(panelId));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastValues = valuesOf();
  let lastKey = activeKey();
  let capturing: Promise<void> | null = null;
  let stopped = false;

  const capture = (): Promise<void> => {
    capturing ??= (async () => {
      const key = activeKey();
      const values = valuesOf();
      const result = await captureViewport();
      // Discard if the version changed while capturing.
      if (!result || stopped || key !== activeKey()) return;
      ThumbnailStore.set(panelId, key, result.thumbnail);
      // Edits made mid-capture aren't in it.
      if (valuesOf() !== values) ThumbnailStore.markStale(panelId, key);
    })().finally(() => { capturing = null; });
    return capturing;
  };

  const flush = async () => {
    await capturing;
    const key = activeKey();
    if (!ThumbnailStore.get(panelId, key) || ThumbnailStore.isStale(panelId, key)) await capture();
    // The thumbnail now shows these edits, so the version has to hold them too.
    DialStore.keepEdits(panelId);
  };

  // Wait for the page to settle on the version (transitions, layout) first.
  const captureMissingSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (stopped || ThumbnailStore.get(panelId, activeKey()) || DialStore.hasEdits(panelId)) return;
      if (document.querySelector('.dialkit-version-overlay, .dialkit-appshot')) { captureMissingSoon(); return; }
      void capture();
    }, SETTLE_DELAY_MS);
  };

  const unsubscribe = DialStore.subscribe(panelId, () => {
    // Compare contents: renames and saves hand out new snapshot objects too.
    const values = valuesOf();
    const key = activeKey();
    if (key !== lastKey) captureMissingSoon();
    else if (values !== lastValues) ThumbnailStore.markStale(panelId, key);
    lastValues = values;
    lastKey = key;
  });

  ThumbnailStore.prune(panelId, [BASE_VERSION, ...DialStore.getPresets(panelId).map((p) => p.id)]);
  // A stored thumbnail can predate this page load's values.
  ThumbnailStore.markStale(panelId, lastKey);
  captureMissingSoon();

  return {
    flush,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      const gone = !DialStore.getPanel(panelId) && Object.keys(DialStore.getValues(panelId)).length === 0;
      if (gone) ThumbnailStore.forget(panelId);
    },
  };
}

/**
 * Zoom the page out into a grid of every version. Opens immediately from the
 * cached thumbnails, which the watcher keeps current.
 */
export function openVersionsOverview(panelId: string, theme?: 'light' | 'dark' | 'system', onClose?: () => void): VersionGridHandle {
  const key = versionKey(DialStore.getActivePresetId(panelId));
  const handle = openVersionGrid({
    versions: listVersions(panelId),
    activeKey: key,
    theme,
    onSelect: (next) => selectVersion(panelId, next),
    onRename: (next, name) => renameVersion(panelId, next, name),
    onClose: () => { stopThumbnails(); stopVersions(); onClose?.(); },
  });
  const refresh = () => handle.update(listVersions(panelId), versionKey(DialStore.getActivePresetId(panelId)));
  const stopThumbnails = ThumbnailStore.subscribe(refresh);
  const stopVersions = DialStore.subscribe(panelId, refresh);
  return handle;
}
