// Save-version "appshot": the viewport flashes white like a camera shutter,
// the captured frame fades in over the flash, and the frame flies into its
// thumbnail slot in the panel.
//
// The choreography follows ChatGPT for Mac's Appshot transition: one progress
// value drives a curved path that swings past the target, a slight mid-flight
// swell, shadow padding, corner radii, and a fading shadow.

import { DialStore } from '../store/DialStore';
import { callListeners, pageSingleton } from '../store/shared';
import { GALLERY_SPRING } from './spring';
import { captureViewport, ThumbnailStore, versionKey } from './thumbnails';

const APPSHOT = {
  shutterFadeIn: 150, // ms, ease-in-out
  moveFallbackDelay: 200, // ms; the flight starts when the shutter is in, or after this
  imageFadeIn: 180, // ms, ease-in, over the opaque shutter
  arcOvershoot: 50, // px the path swings past the target, vertically
  sizeBump: 0.06, // peak extra size mid-flight
  paddingX: 20, // px of shadow room around the flying frame
  paddingTop: 10,
  minCornerRadius: 2,
  landingAt: 0.75, // progress at which the real thumbnail shows underneath
  labelAt: 0.95, // progress at which the thumbnail's label fades in
};

const EASE_IN = 'cubic-bezier(0.42, 0, 1, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.42, 0, 0.58, 1)';

type Rect = { x: number; y: number; width: number; height: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The flying frame's rect at progress `p` between `source` and `target`. */
function frameAt(source: Rect, target: Rect, p: number): Rect {
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  // Quadratic curve through a midpoint that overshoots the target vertically.
  const my = ty + (ty < sy ? -1 : 1) * APPSHOT.arcOvershoot;
  const cx = 2 * ((sx + tx) / 2 - 0.25 * sx - 0.25 * tx);
  const cy = 2 * (my - 0.25 * sy - 0.25 * ty);
  const q = 1 - p;
  const x = q * q * sx + 2 * p * q * cx + p * p * tx;
  const y = q * q * sy + 2 * p * q * cy + p * p * ty;
  const swell = 1 + q * Math.sin(Math.PI * p) * APPSHOT.sizeBump;
  const width = lerp(source.width, target.width, p) * swell;
  const height = lerp(source.height, target.height, p) * swell;
  return { x: x - width / 2, y: y - height / 2, width, height };
}

type FlightHooks = {
  /** The real thumbnail can show underneath the frame. */
  onLanding: () => void;
  /** The thumbnail's label can fade in. */
  onLabel: () => void;
};

type Appshot = {
  fly: (frame: HTMLCanvasElement, slot: HTMLElement | null, hooks: FlightHooks) => Promise<void>;
  cancel: () => void;
};

/** Raise the shutter over the viewport. Call fly() once the frame is captured. */
function startAppshot(): Appshot {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const source: Rect = { x: 0, y: 0, width: W, height: H };

  // Moving layers are viewport-sized and positioned with transforms only, so
  // the flight stays on the compositor.
  const container = layer('dialkit-appshot');
  const shadow = layer('dialkit-appshot-shadow');
  const card = layer('dialkit-appshot-card');
  const shutter = layer('dialkit-appshot-shutter');
  const image = layer('dialkit-appshot-image');
  card.append(shutter, image);
  container.append(shadow, card);
  for (const node of [card, shutter, image]) {
    node.style.width = `${W}px`;
    node.style.height = `${H}px`;
  }
  document.body.append(container);

  const shutterIn = shutter.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: APPSHOT.shutterFadeIn,
    easing: EASE_IN_OUT,
    fill: 'forwards',
  });
  const ready = Promise.race([
    shutterIn.finished.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, APPSHOT.moveFallbackDelay)),
  ]);

  const cancel = () => container.remove();

  const fly: Appshot['fly'] = async (frame, slot, { onLanding, onLabel }) => {
    await ready;
    const rect = slot?.getBoundingClientRect();
    if (!slot || !rect || rect.width === 0) {
      const out = shutter.animate([{ opacity: 1 }, { opacity: 0 }], { duration: APPSHOT.imageFadeIn, easing: EASE_IN, fill: 'forwards' });
      await out.finished.catch(() => {});
      cancel();
      return;
    }
    // The frame carries shadow padding, so its resting rect is the slot
    // expanded by that padding; the image itself lands exactly on the slot.
    const target: Rect = {
      x: rect.x - APPSHOT.paddingX,
      y: rect.y - APPSHOT.paddingTop,
      width: rect.width + APPSHOT.paddingX * 2,
      height: rect.height + APPSHOT.paddingTop,
    };
    const slotRadius = Math.min(parseFloat(getComputedStyle(slot).borderRadius) || 0, rect.width / 2, rect.height / 2);

    // Sample the geometry along progress; the linear() spring maps time to
    // progress, so the browser runs the whole flight.
    const steps = 48;
    const samples = Array.from({ length: steps + 1 }, (_, i) => {
      const p = i / steps;
      const f = frameAt(source, target, p);
      const padX = Math.min(Math.floor((f.width - 1) / 2), APPSHOT.paddingX * p);
      const padTop = APPSHOT.paddingTop * p;
      const boxW = f.width - padX * 2;
      const boxH = f.height - padTop;
      const k = Math.min(boxW / W, boxH / H);
      const frameRadius = lerp(0, slotRadius, p);
      return {
        p,
        k,
        x: f.x + padX + (boxW - W * k) / 2,
        y: f.y + padTop,
        radius: lerp(frameRadius, Math.max(APPSHOT.minCornerRadius, slotRadius), p),
        fade: clamp01((p - APPSHOT.landingAt) * 4),
      };
    });
    // The shadow is sized for where it lands and scaled up from there, so it
    // settles with an exact, unscaled blur.
    const end = samples[steps];
    shadow.style.width = `${W * end.k}px`;
    shadow.style.height = `${H * end.k}px`;
    shadow.style.borderRadius = `${slotRadius}px`;

    frame.className = 'dialkit-appshot-frame';
    image.append(frame);
    container.dataset.flying = 'true';
    shutterIn.finish();
    image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: APPSHOT.imageFadeIn, easing: EASE_IN, fill: 'forwards' });
    const timing = { duration: GALLERY_SPRING.duration * 1000, easing: GALLERY_SPRING.easing, fill: 'forwards' as const };
    const flight = card.animate(samples.map((s) => ({
      offset: s.p,
      transform: `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.k})`,
    })), timing);
    // Radius runs separately so a busy main thread can't hold back the motion.
    card.animate(samples.map((s) => ({ offset: s.p, borderRadius: `${s.radius / s.k}px` })), timing);
    shadow.animate(samples.map((s) => ({
      offset: s.p,
      transform: `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.k / end.k})`,
      opacity: s.p * (1 - 0.8 * s.fade),
    })), timing);

    let landed = false;
    let labeled = false;
    const land = () => { if (!landed) { landed = true; onLanding(); } };
    const label = () => { land(); if (!labeled) { labeled = true; onLabel(); } };
    const landTimer = setTimeout(land, GALLERY_SPRING.timeAt(APPSHOT.landingAt) * 1000);
    const labelTimer = setTimeout(label, GALLERY_SPRING.timeAt(APPSHOT.labelAt) * 1000);
    await flight.finished.catch(() => {});
    clearTimeout(landTimer);
    clearTimeout(labelTimer);
    label();
    container.remove();
  };

  return { fly, cancel };
}

export type Arrival = { key: string; stage: 'pending' | 'landing' };

/**
 * The version currently flying into the panel, per panel. Galleries hide its
 * card while 'pending', show it at 'landing', and fade its label in after.
 */
class ArrivalStoreImpl {
  private arrivals = new Map<string, Arrival>();
  private listeners = new Set<() => void>();

  get(panelId: string): Arrival | null {
    return this.arrivals.get(panelId) ?? null;
  }

  set(panelId: string, arrival: Arrival | null): void {
    if (arrival) this.arrivals.set(panelId, arrival);
    else this.arrivals.delete(panelId);
    callListeners(this.listeners);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

export const ArrivalStore = /* @__PURE__ */ pageSingleton('ArrivalStore', () => new ArrivalStoreImpl());

/**
 * Save the current values as a new version, flying a capture of the page into
 * its thumbnail. `resolveSlot` returns the new thumbnail once it has rendered.
 * Resolves null when the panel went away during the capture: nothing is saved.
 */
export async function saveVersionWithAppshot(
  panelId: string,
  resolveSlot: (key: string) => Promise<HTMLElement | null>,
): Promise<string | null> {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const previousKey = versionKey(DialStore.getActivePresetId(panelId));
  const capturedValues = JSON.stringify(DialStore.getValues(panelId));
  const appshot = reduceMotion ? null : startAppshot();
  const capture = await captureViewport();
  if (!DialStore.getPanel(panelId)) {
    appshot?.cancel();
    return null;
  }
  const edited = DialStore.hasEdits(panelId);
  let id: string;
  try {
    id = DialStore.saveNewPreset(panelId);
  } catch (error) {
    appshot?.cancel();
    throw error;
  }
  // Same tick as the save, so the new card never renders before its flight.
  if (appshot && capture) ArrivalStore.set(panelId, { key: id, stage: 'pending' });
  if (capture) {
    // Edits made during the capture are saved but aren't in the picture.
    const matches = JSON.stringify(DialStore.getValues(panelId)) === capturedValues;
    ThumbnailStore.set(panelId, id, capture.thumbnail);
    if (!matches) ThumbnailStore.markStale(panelId, id);
    // Without edits the two versions are identical, so this picture fits both.
    // With edits, the previous version keeps its own picture.
    if (matches && !edited && (!ThumbnailStore.get(panelId, previousKey) || ThumbnailStore.isStale(panelId, previousKey))) {
      ThumbnailStore.set(panelId, previousKey, capture.thumbnail);
    }
  }
  if (!appshot || !capture) {
    appshot?.cancel();
    return id;
  }
  try {
    await appshot.fly(capture.canvas, await resolveSlot(id), {
      onLanding: () => ArrivalStore.set(panelId, { key: id, stage: 'landing' }),
      onLabel: () => ArrivalStore.set(panelId, null),
    });
  } finally {
    ArrivalStore.set(panelId, null);
  }
  return id;
}

function layer(className: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  node.dataset.dialkitIgnore = '';
  return node;
}
