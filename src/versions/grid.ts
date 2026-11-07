// "View all" versions overlay.
//
// The live page is never transformed. A fixed overlay renders the versions as
// cached screenshots and moves the whole grid like a camera: zoomed into one
// card (which then exactly covers the viewport) or at rest. When a version is
// chosen, its values load into the real page underneath while the camera zooms
// into its card; once settled, the overlay fades and the live page takes over.
// This mirrors Open Layer's gallery → demo transition.
//
// Motion is a CSS linear() spring run by the browser (Web Animations), and an
// interrupted transition continues from wherever the camera currently is.

import { ICON_CLOSE } from '../icons';
import { element, icon } from '../vanilla/dom';
import { GALLERY_SPRING } from './spring';
import type { Thumbnail } from './thumbnails';

export type GridVersion = {
  key: string;
  name: string;
  thumbnail?: Thumbnail;
};

export type VersionGridOptions = {
  versions: GridVersion[];
  activeKey: string;
  theme?: 'light' | 'dark' | 'system';
  /** Load a version into the live page. Called before the zoom-in starts. */
  onSelect: (key: string) => void;
  /** Rename a version (double-click its name). */
  onRename?: (key: string, name: string) => void;
  onClose?: () => void;
};

export type VersionGridHandle = {
  /** Zoom into a version's card, load it, then hand off to the live page. */
  select: (key: string) => void;
  /** Zoom back into the active version, then hand off to the live page. */
  dismiss: () => void;
  /** Remove immediately. */
  close: () => void;
  update: (versions: GridVersion[], activeKey: string) => void;
};

const CARD_RADIUS = 14;
const SETTLE_FADE_MS = 140; // Open Layer: settled preview fades off the live page

let current: VersionGridHandle | null = null;

export function openVersionGrid(options: VersionGridOptions): VersionGridHandle {
  current?.close();
  registerSceneProperties();

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let versions = options.versions;
  let activeKey = options.activeKey;
  let focusKey = activeKey;
  let closing = false;
  let animations: Animation[] = [];

  const overlay = element('div', 'dialkit-version-overlay');
  overlay.dataset.theme = options.theme ?? 'system';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Versions');

  const scroller = element('div', 'dialkit-version-overlay-scroll');
  const grid = element('div', 'dialkit-version-overlay-grid');
  const close = element('button', 'dialkit-version-overlay-close');
  close.setAttribute('aria-label', 'Close versions');
  close.append(icon(ICON_CLOSE));
  scroller.append(grid);
  overlay.append(scroller, close);

  const cards = new Map<string, HTMLElement>();
  const focusCard = (key: string, opts?: FocusOptions) =>
    cards.get(key)?.querySelector<HTMLElement>('.dialkit-version-card-frame')?.focus(opts);

  const render = () => {
    grid.textContent = '';
    cards.clear();
    grid.style.setProperty('--dialkit-version-aspect', String(window.innerWidth / window.innerHeight));
    grid.style.setProperty('--dialkit-version-columns', String(columnsFor(versions.length)));
    for (const version of versions) {
      const card = element('div', 'dialkit-version-card');
      card.dataset.key = version.key;
      const frame = element('button', 'dialkit-version-card-frame');
      frame.setAttribute('aria-label', version.name);
      if (version.thumbnail) {
        const img = element('img');
        img.src = version.thumbnail.src;
        img.alt = '';
        img.draggable = false;
        img.decoding = 'sync';
        frame.append(img);
      }
      const label = element('span', 'dialkit-version-card-label');
      label.textContent = version.name;
      label.title = 'Double-click to rename';
      label.addEventListener('dblclick', () => editLabel(version.key, label, frame));
      card.append(frame, label);
      frame.addEventListener('click', () => choose(version.key));
      frame.addEventListener('focus', () => { focusKey = version.key; });
      cards.set(version.key, card);
      grid.append(card);
    }
    reserveDialKitSpace();
  };

  // Inline rename: Enter saves, Escape cancels, blur saves.
  const editLabel = (key: string, label: HTMLElement, frame: HTMLElement) => {
    if (closing || !options.onRename) return;
    const previous = versions.find((v) => v.key === key)?.name ?? label.textContent ?? '';
    const input = element('input', 'dialkit-version-card-input');
    input.value = previous;
    input.setAttribute('aria-label', 'Version name');
    let done = false;
    const end = (save: boolean) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (save && name && name !== previous) {
        options.onRename!(key, name);
        versions = versions.map((v) => (v.key === key ? { ...v, name } : v));
        label.textContent = name;
        frame.setAttribute('aria-label', name);
      }
      input.replaceWith(label);
      frame.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); end(true); }
      else if (e.key === 'Escape') { e.preventDefault(); end(false); }
    });
    input.addEventListener('blur', () => end(true));
    label.replaceWith(input);
    input.focus();
    input.select();
  };

  // Keep cards out from under the DialKit panel when it's docked on a side.
  const reserveDialKitSpace = () => {
    const panel = document.querySelector('.dialkit-panel:not([data-mode="inline"])');
    const rect = panel?.getBoundingClientRect();
    const gutter = 32;
    scroller.style.paddingRight = '';
    scroller.style.paddingLeft = '';
    if (!rect || rect.width === 0) return;
    if (rect.left > window.innerWidth / 2) scroller.style.paddingRight = `${window.innerWidth - rect.left + gutter}px`;
    else scroller.style.paddingLeft = `${rect.right + gutter}px`;
  };

  // Camera transform that makes `key`'s card exactly cover the viewport.
  const zoomedInto = (key: string): string | null => {
    const frame = cards.get(key)?.querySelector<HTMLElement>('.dialkit-version-card-frame');
    if (!frame) return null;
    const prev = grid.style.transform;
    grid.style.transform = 'none';
    const home = frame.getBoundingClientRect();
    const origin = grid.getBoundingClientRect();
    grid.style.transform = prev;
    const s = window.innerWidth / home.width;
    const tx = -origin.x - s * (home.x - origin.x);
    const ty = -origin.y - s * (home.y - origin.y);
    return `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
  };

  // Spring the camera, scene value (labels, chrome), and card radius together,
  // starting from whatever is on screen now.
  const animateTo = (transform: string, scene: 0 | 1): Promise<void> => {
    const style = getComputedStyle(grid);
    const from = {
      transform: style.transform === 'none' ? 'translate3d(0px, 0px, 0) scale(1)' : style.transform,
      scene: parseFloat(getComputedStyle(overlay).getPropertyValue('--dialkit-scene')) || 0,
      radius: style.getPropertyValue('--dialkit-card-radius').trim() || '0px',
    };
    animations.forEach((a) => a.cancel());
    const scale = scaleOf(transform);
    const timing: KeyframeAnimationOptions = {
      duration: reduceMotion ? 0 : GALLERY_SPRING.duration * 1000,
      easing: GALLERY_SPRING.easing,
      fill: 'forwards',
    };
    overlay.dataset.animating = 'true';
    animations = [
      grid.animate([
        { transform: from.transform, '--dialkit-card-radius': from.radius },
        { transform, '--dialkit-card-radius': `${(CARD_RADIUS * scene) / scale}px` },
      ], timing),
      overlay.animate([{ '--dialkit-scene': from.scene }, { '--dialkit-scene': scene }], timing),
    ];
    return Promise.all(animations.map((a) => a.finished)).then(
      () => { delete overlay.dataset.animating; },
      () => {}, // superseded by a newer transition
    );
  };

  const finish = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    if (current === handle) current = null;
    const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduceMotion ? 0 : SETTLE_FADE_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    fade.onfinish = () => overlay.remove();
    options.onClose?.();
  };

  const choose = (requested: string) => {
    if (closing) return;
    // A card can outlive its version when something else deletes it.
    const key = versions.some((v) => v.key === requested) ? requested : activeKey;
    closing = true;
    overlay.dataset.closing = 'true';
    if (key !== activeKey) {
      options.onSelect(key);
      activeKey = key;
    }
    const target = zoomedInto(key);
    if (!target) { finish(); return; }
    let done = false;
    const settle = () => { if (!done) { done = true; finish(); } };
    animateTo(target, 0).then(settle);
    // The curve is within ~0.1% of rest by here; hand off to the live page.
    setTimeout(settle, GALLERY_SPRING.duration * 750);
  };

  const onKey = (e: KeyboardEvent) => {
    // Typing a name owns the keyboard.
    if (e.target instanceof HTMLInputElement && overlay.contains(e.target)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      choose(activeKey);
      return;
    }
    const columns = columnsFor(versions.length);
    const arrows: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    if (e.key in arrows) {
      e.preventDefault();
      const index = versions.findIndex((v) => v.key === focusKey);
      const next = versions[Math.max(0, Math.min(versions.length - 1, (index < 0 ? 0 : index) + arrows[e.key]))];
      focusCard(next.key);
    }
  };

  const onResize = () => {
    if (closing) return;
    animations.forEach((a) => a.cancel());
    delete overlay.dataset.animating;
    render();
  };

  close.addEventListener('click', () => choose(activeKey));
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  // Build the first frame fully zoomed in, then insert it, so the very first
  // paint is the live page's twin rather than the resting grid.
  overlay.style.setProperty('--dialkit-scene', '0');
  overlay.style.visibility = 'hidden';
  document.body.append(overlay);
  render();
  const anchor = cards.get(activeKey);
  if (anchor) scroller.scrollTop = Math.max(0, anchor.offsetTop - (scroller.clientHeight - anchor.offsetHeight) / 2);
  const start = zoomedInto(activeKey);
  if (start) {
    grid.style.transform = start;
    grid.style.setProperty('--dialkit-card-radius', '0px');
  }
  overlay.style.visibility = '';
  animateTo('translate3d(0px, 0px, 0) scale(1)', 1).then(() => {
    if (closing) return;
    // Settle into plain resting styles so scrolling and hover behave normally.
    overlay.style.setProperty('--dialkit-scene', '1');
    grid.style.transform = '';
    grid.style.removeProperty('--dialkit-card-radius');
    animations.forEach((a) => a.cancel());
    animations = [];
  });
  focusCard(activeKey, { preventScroll: true });

  const handle: VersionGridHandle = {
    select: (key) => choose(key),
    dismiss: () => choose(activeKey),
    close: () => {
      if (closing) return;
      closing = true;
      animations.forEach((a) => a.cancel());
      finish();
    },
    update: (next, nextActive) => {
      versions = next;
      activeKey = nextActive;
      for (const [key, card] of cards) {
        if (versions.some((v) => v.key === key)) continue;
        card.remove();
        cards.delete(key);
      }
      // Only refresh cards in place; re-rendering would reset motion. A new version
      // has nothing in motion to lose once the grid is at rest.
      if (versions.some((v) => !cards.has(v.key)) && !closing) {
        render();
        return;
      }
      for (const version of versions) {
        const card = cards.get(version.key);
        const img = card?.querySelector('img');
        if (img && version.thumbnail && img.src !== version.thumbnail.src) img.src = version.thumbnail.src;
        const label = card?.querySelector('.dialkit-version-card-label');
        if (label && label.textContent !== version.name) label.textContent = version.name;
      }
    },
  };
  current = handle;
  return handle;
}

function scaleOf(transform: string): number {
  const match = /scale\(([^)]+)\)/.exec(transform);
  return match ? parseFloat(match[1]) : 1;
}

let registered = false;
function registerSceneProperties() {
  if (registered || typeof CSS === 'undefined' || !('registerProperty' in CSS)) return;
  registered = true;
  for (const [name, syntax, initialValue] of [
    ['--dialkit-scene', '<number>', '1'],
    ['--dialkit-card-radius', '<length>', `${CARD_RADIUS}px`],
  ]) {
    try {
      CSS.registerProperty({ name, syntax, inherits: true, initialValue });
    } catch { /* already registered */ }
  }
}

function columnsFor(count: number): number {
  const width = window.innerWidth;
  const max = width >= 1100 ? 3 : width >= 680 ? 2 : 1;
  return Math.max(1, Math.min(max, Math.max(count, 2)));
}
