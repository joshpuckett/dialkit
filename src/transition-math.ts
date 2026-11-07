// Deterministic sampling of transition curves, used for timeline scrubbing.
// Springs use the closed-form damped-harmonic-oscillator solution with
// Motion's own visualDuration/bounce → stiffness/damping mapping, so a
// scrubbed position matches what Motion plays.

import { isEasingConfigValue, isPhysicsSpring, isSpringConfigValue, SPRING_DEFAULTS } from './store/DialStore';
import type { EasingConfig, SpringConfig, TransitionConfig } from './store/DialStore';

export { isPhysicsSpring };

export type SpringParams = { stiffness: number; damping: number; mass: number };

/** The bounce a timeline clip starts with when its config names none. */
export const DEFAULT_CLIP_BOUNCE = 0.2;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isTransitionConfig(value: unknown): value is TransitionConfig {
  return isSpringConfigValue(value) || isEasingConfigValue(value);
}

export function springParams(spring: SpringConfig): SpringParams {
  if (isPhysicsSpring(spring)) {
    return {
      stiffness: spring.stiffness ?? SPRING_DEFAULTS.stiffness,
      damping: spring.damping ?? SPRING_DEFAULTS.damping,
      mass: spring.mass ?? SPRING_DEFAULTS.mass,
    };
  }
  // Motion's mapping (motion-dom spring generator)
  const visualDuration = Math.max(0.05, spring.visualDuration ?? SPRING_DEFAULTS.visualDuration);
  const bounce = spring.bounce ?? SPRING_DEFAULTS.bounce;
  const root = (2 * Math.PI) / (visualDuration * 1.2);
  const stiffness = root * root;
  const damping = 2 * Math.min(1, Math.max(0.05, 1 - bounce)) * Math.sqrt(stiffness);
  return { stiffness, damping, mass: 1 };
}

/** Normalized spring position 0 → 1 (may overshoot), starting at rest. */
export function springProgress(t: number, { stiffness, damping, mass }: SpringParams): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 0.9999) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta < 1.0001) {
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  const wd = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + wd;
  const r2 = -zeta * w0 - wd;
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
}

/** Estimated time for a spring to visually settle (within 0.5% of target). */
export function springSettleDuration(params: SpringParams): number {
  const w0 = Math.sqrt(params.stiffness / params.mass);
  const zeta = params.damping / (2 * Math.sqrt(params.stiffness * params.mass));
  const decay =
    zeta >= 1
      ? zeta * w0 - w0 * Math.sqrt(Math.max(0, zeta * zeta - 1)) // slowest exponent
      : zeta * w0;
  const duration = Math.log(200) / Math.max(decay, 1e-6);
  return round2(clamp(duration, 0.05, 10));
}

/** Eased progress of a cubic-bezier easing at linear progress p (0–1). */
export function cubicBezierProgress(p: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  // Solve the bezier's parameter t for x = p (Newton-Raphson, bisection fallback)
  const sampleX = (t: number) => bezierAxis(t, x1, x2);
  const sampleY = (t: number) => bezierAxis(t, y1, y2);

  let t = p;
  for (let i = 0; i < 8; i++) {
    const x = sampleX(t) - p;
    if (Math.abs(x) < 1e-5) return sampleY(t);
    const dx = bezierAxisDerivative(t, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    t -= x / dx;
  }

  let lo = 0;
  let hi = 1;
  t = p;
  while (hi - lo > 1e-5) {
    if (sampleX(t) < p) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return sampleY(t);
}

function bezierAxis(t: number, a1: number, a2: number): number {
  return ((1 - 3 * a2 + 3 * a1) * t * t * t) + ((3 * a2 - 6 * a1) * t * t) + (3 * a1 * t);
}

function bezierAxisDerivative(t: number, a1: number, a2: number): number {
  return 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
}

export type ResolvedClipTransition = {
  /** Motion-ready transition with its duration driven by the clip length. */
  transition: TransitionConfig;
  /** Effective clip duration — the bar length. Derived for physics springs. */
  duration: number;
  /** Physics springs have emergent duration; the bar is derived, not resizable. */
  isPhysics: boolean;
};

// The bar IS the duration: time-mode springs get visualDuration from the
// clip length, easings get duration from it, and physics springs derive
// the clip length from their settle time.
export function resolveClipTransition(
  raw: TransitionConfig,
  clipDuration: number
): ResolvedClipTransition {
  const safeDuration = Math.max(0.05, clipDuration);

  if (raw.type === 'easing') {
    return {
      transition: { ...raw, duration: safeDuration } as EasingConfig,
      duration: safeDuration,
      isPhysics: false,
    };
  }
  if (isPhysicsSpring(raw)) {
    return {
      transition: raw,
      duration: springSettleDuration(springParams(raw)),
      isPhysics: true,
    };
  }
  return {
    transition: { type: 'spring', bounce: raw.bounce ?? DEFAULT_CLIP_BOUNCE, visualDuration: safeDuration },
    duration: safeDuration,
    isPhysics: false,
  };
}

/**
 * Eased progress of a clip's transition at `elapsed` seconds after its start.
 * Springs keep evolving past the bar (bounce tail) and converge to 1;
 * easings clamp at 1. May overshoot 1 for bouncy curves.
 */
export function transitionProgress(
  elapsed: number,
  duration: number,
  transition: TransitionConfig | undefined
): number {
  if (elapsed <= 0) return 0;
  if (!transition) {
    return duration > 0 ? Math.min(1, elapsed / duration) : 1;
  }
  if (transition.type === 'easing') {
    return cubicBezierProgress(Math.min(1, duration > 0 ? elapsed / duration : 1), transition.ease);
  }
  const params = springParams(transition);
  // Snap to done once settled so late samples are exactly 1
  if (elapsed >= springSettleDuration(params)) return 1;
  return springProgress(elapsed, params);
}
