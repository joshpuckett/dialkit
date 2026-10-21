// Framework-agnostic timeline logic: config parsing, value interpolation,
// and per-frame clip-state derivation. The React hook (and future Solid/
// Svelte/Vue adapters) stay thin wrappers over this module.
//
// The computation is split in two so the 60Hz clock stays cheap:
//   computeStaticClips  — everything derivable from stored values alone
//                         (runs only when a value is edited)
//   computeClipState    — the time-dependent fields for one clip
//                         (runs per frame, sampling cached curve params)
//
// Internally every animating clip is a sequence of steps: a from/to clip is
// one implicit step, a `steps` clip is several chained ones, and a `props`
// clip holds one step-list per property track (each with its own cycle and
// phase offset). Untouched properties hold their prior value through a step.

import { DialStore, formatLabel, inferStep, isHexColor, resolveDialValues } from './store/DialStore';
import type { DialConfig, DialValue, ResolvedValues, TransitionConfig } from './store/DialStore';
import {
  clamp,
  cubicBezierProgress,
  isPhysicsSpring,
  isTransitionConfig,
  resolveClipTransition,
  round2,
  springParams,
  springProgress,
  springSettleDuration,
} from './transition-math';
import type { SpringParams } from './transition-math';
import { announce } from './announce';
import { TIMELINE_CLIP_COLORS, TimelineStore } from './store/TimelineStore';
import type { TimelineClipMeta, TimelineClipTrackMeta } from './store/TimelineStore';

// ── Public config types ──

// A clip is a named span on the timeline — one row each: when it starts, how
// long it runs, and (optionally) the values it animates between plus the
// curve it animates with. `from`/`to` accept any normal DialKit leaf values
// (numbers, colors, etc.). Everything is editable by clicking the clip in
// the dock. Clips with from/to get a default spring transition when none is
// specified.
//
// A looping clip repeats its cycle from `at` until the timeline ends: the
// bar is one cycle, so dragging it longer slows the loop. A loop that should
// return to where it started (a bob, a pulse) is written as a sequence whose
// last step lands back on the starting values — there is no mirror mode.
export type TimelineClipLoop = 'off' | 'repeat';

// One leg of a sequence. Only the properties named in `to` animate; every
// other property holds its value from the previous leg (or `from`).
// The index allows `undefined` because TypeScript synthesizes `prop?:
// undefined` union arms for legs that touch different property sets.
export type TimelineStepValues = {
  [key: string]: DialConfig[string] | undefined;
};

export type TimelineStepConfig = {
  duration?: number;
  to?: TimelineStepValues;
  transition?: TransitionConfig;
};

// Independent per-property tracks. When one object's properties animate
// with different timing, each property is a full track: its own values,
// duration, curve, and a `delay` offset from the clip's `at` (a phase shift
// for looping clips). The clip row becomes a read-only composite of its
// tracks; editing happens on the tracks. Properties that share timing
// belong in a plain from/to/steps clip instead.
export type TimelinePropStepConfig = {
  duration?: number;
  to?: number | string;
  transition?: TransitionConfig;
};

export type TimelinePropConfig = {
  from?: number | string;
  to?: number | string;
  duration?: number;
  /** Offset from the clip's `at` in seconds. */
  delay?: number;
  transition?: TransitionConfig;
  steps?: TimelinePropStepConfig[];
};

type TimelineClipBase = {
  at: number;
  duration?: number;
  transition?: TransitionConfig;
  loop?: boolean | TimelineClipLoop;
};

// The three clip shapes are mutually exclusive, encoded with optional-never
// fields so TypeScript rejects ambiguous combinations (`steps` + `to`,
// `props` + `from`, …) at the call site. Parse warns for untyped consumers.
export type TimelineClipConfig = TimelineClipBase &
  (
    | {
        from?: DialConfig;
        to?: DialConfig;
        steps?: never;
        props?: never;
      }
    | {
        from?: DialConfig;
        to?: never;
        /** Sequential legs on one row — a segmented bar; boundaries retime legs. */
        steps: TimelineStepConfig[];
        props?: never;
      }
    | {
        from?: never;
        to?: never;
        steps?: never;
        /** Independent per-property tracks — mutually exclusive with from/to/steps. */
        props: { [prop: string]: TimelinePropConfig };
      }
  );

/** Nested keys group clips into a collapsible layer — purely presentational. */
export type TimelineGroupConfig = {
  [key: string]: TimelineClipConfig;
};

export type TimelineConfig = {
  /** Total timeline length in seconds. Inferred from the last clip when omitted. */
  duration?: number;
} & {
  [key: string]: TimelineClipConfig | TimelineGroupConfig | number | undefined;
};

/** CSS-friendly output for consumers not using Motion — spread into a style. */
export type TimelineClipCss = {
  transitionDuration: string;
  transitionTimingFunction: string;
};

export type TimelineClipValues<C extends TimelineClipConfig = TimelineClipConfig> = {
  at: number;
  duration: number;
  /** Effective code-defined loop mode. */
  loop: TimelineClipLoop;
  /** Playhead is at or past the clip start. */
  started: boolean;
  /** Playhead is inside the clip — for looping clips, inside any cycle. */
  active: boolean;
  /** Playhead is past the clip end (for looping clips, past the timeline end). */
  done: boolean;
  /**
   * 0–1 position of the playhead within the clip — cycle progress (a
   * sawtooth) for looping clips, sequence progress for steps clips.
   */
  progress: number;
  /** Index of the leg under the playhead, for sequence clips. */
  step: C['steps'] extends TimelineStepConfig[] ? number : undefined;
  from: C['props'] extends Record<string, TimelinePropConfig>
    ? { [K in keyof C['props']]: number | string }
    : C['from'] extends DialConfig
      ? ResolvedValues<C['from']>
      : undefined;
  to: C['props'] extends Record<string, TimelinePropConfig>
    ? { [K in keyof C['props']]: number | string }
    : C['steps'] extends TimelineStepConfig[]
      ? C['from'] extends DialConfig
        ? ResolvedValues<C['from']>
        : Record<string, number | string>
      : C['to'] extends DialConfig
        ? ResolvedValues<C['to']>
        : undefined;
  /** `to` once the clip has started, `from` before — hand it to Motion's animate.
   * For sequences this is the final merged state; for props clips, per-track
   * endpoint records. */
  animate: C['props'] extends Record<string, TimelinePropConfig>
    ? { [K in keyof C['props']]: number | string }
    : C['steps'] extends TimelineStepConfig[]
      ? C['from'] extends DialConfig
        ? ResolvedValues<C['from']>
        : Record<string, number | string> | undefined
      : C['to'] extends DialConfig
        ? C['from'] extends DialConfig
          ? ResolvedValues<C['from']> | ResolvedValues<C['to']>
          : ResolvedValues<C['to']> | undefined
        : undefined;
  /** The clip's editable curve — single-curve clips only. */
  transition: C['props'] extends Record<string, TimelinePropConfig>
    ? undefined
    : C['steps'] extends TimelineStepConfig[]
      ? undefined
      : C extends { transition: TransitionConfig } | { from: DialConfig } | { to: DialConfig }
        ? TransitionConfig
        : undefined;
  /** Duration + timing-function for native CSS transitions — single-curve clips only. */
  css: C['props'] extends Record<string, TimelinePropConfig>
    ? undefined
    : C['steps'] extends TimelineStepConfig[]
      ? undefined
      : C extends { transition: TransitionConfig } | { from: DialConfig } | { to: DialConfig }
        ? TimelineClipCss
        : undefined;
  /**
   * Values interpolated through the clip's curves at the current playhead —
   * bind to style for true scrubbing: the element is exactly at this point
   * in time whether playing, paused, or scrubbing. Sequence clips report the
   * merged state of all legs (declare every animated property in `from`);
   * props clips report every track's value.
   */
  current: C['props'] extends Record<string, TimelinePropConfig>
    ? { [K in keyof C['props']]: number | string }
    : C['steps'] extends TimelineStepConfig[]
      ? C['from'] extends DialConfig
        ? ResolvedValues<C['from']>
        : Record<string, number | string>
      : C['to'] extends DialConfig
        ? C['from'] extends DialConfig
          ? ResolvedValues<C['from']> | ResolvedValues<C['to']>
          : undefined
        : undefined;
};

export type TimelineGroupValues<G extends TimelineGroupConfig> = {
  [K in keyof G as G[K] extends TimelineClipConfig ? K : never]: TimelineClipValues<
    Extract<G[K], TimelineClipConfig>
  >;
};

export type DialTimelineValues<T extends TimelineConfig> = {
  time: number;
  playing: boolean;
  duration: number;
  play: () => void;
  pause: () => void;
  replay: () => void;
  seek: (time: number) => void;
} & {
  [K in keyof T as T[K] extends TimelineClipConfig ? K : never]: TimelineClipValues<
    Extract<T[K], TimelineClipConfig>
  >;
} & {
  [K in keyof T as T[K] extends TimelineClipConfig
    ? never
    : T[K] extends TimelineGroupConfig
      ? K
      : never]: TimelineGroupValues<Extract<T[K], TimelineGroupConfig>>;
};

export const CLIP_VALUE_STEP = 0.01;
export const TIMELINE_MIN_CLIP_DURATION = 0.05;
const DEFAULT_STEP_DURATION = 0.3;
const DEFAULT_CLIP_TRANSITION: TransitionConfig = { type: 'spring', bounce: 0.2 };
const RESERVED_KEYS = new Set(['time', 'playing', 'duration', 'play', 'pause', 'replay', 'seek']);

// ── Config parsing ──

export type ParsedTimeline = {
  duration: number;
  dialConfig: DialConfig;
  clips: TimelineClipMeta[];
};

function isClipConfig(value: unknown): value is TimelineClipConfig {
  return isPlainObject(value) && Number.isFinite((value as TimelineClipConfig).at);
}

// A group is a plain object (no `at`) with at least one clip entry — nested
// one level. Non-clip children are skipped individually (with a warning)
// rather than invalidating the whole group.
function isGroupConfig(value: unknown): value is TimelineGroupConfig {
  if (!isPlainObject(value) || 'at' in value) return false;
  const entries = Object.values(value);
  return entries.length > 0 && entries.some(isClipConfig);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeFinite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function animatedDuration(value: unknown, fallback = DEFAULT_STEP_DURATION): number {
  return Math.max(TIMELINE_MIN_CLIP_DURATION, nonNegativeFinite(value, fallback));
}

function transitionDefaultDuration(transition: TransitionConfig): number {
  if (transition.type === 'easing') return animatedDuration(transition.duration);
  // Motion gives physics parameters precedence over time parameters when a
  // mixed config reaches it, so duration inference must make the same choice.
  if (isPhysicsSpring(transition)) {
    return animatedDuration(springSettleDuration(springParams(transition)));
  }
  if (transition.visualDuration !== undefined) return animatedDuration(transition.visualDuration);
  return animatedDuration(springSettleDuration(springParams(transition)));
}

// Bar length defaults: physics always owns its emergent duration. Time-based
// curves use an explicit bar duration first, then their own duration, then the
// standard step duration. `inheritedTransition` matters for physics because a
// step/track can inherit an advanced spring from its parent.
function defaultStepDuration(
  step: { duration?: number; transition?: TransitionConfig },
  inheritedTransition?: TransitionConfig
): number {
  const curve = step.transition ?? inheritedTransition;
  if (curve && isPhysicsSpring(curve)) return transitionDefaultDuration(curve);
  if (step.duration !== undefined) return animatedDuration(step.duration);
  if (step.transition) return transitionDefaultDuration(step.transition);
  return DEFAULT_STEP_DURATION;
}

function defaultTrackDuration(
  track: TimelinePropConfig,
  inheritedTransition?: TransitionConfig
): number {
  const curve = track.transition ?? inheritedTransition;
  if (track.steps?.length) {
    return track.steps.reduce((sum, step) => sum + defaultStepDuration(step, curve), 0);
  }
  if (curve && isPhysicsSpring(curve)) return transitionDefaultDuration(curve);
  if (track.duration !== undefined) return animatedDuration(track.duration);
  if (track.transition) return transitionDefaultDuration(track.transition);
  return DEFAULT_STEP_DURATION;
}

function defaultClipDuration(clip: TimelineClipConfig): number {
  const defaultCurve = isTransitionConfig(clip.transition)
    ? clip.transition
    : DEFAULT_CLIP_TRANSITION;
  if (clip.props) {
    return Object.values(clip.props).reduce(
      (max, track) => Math.max(
        max,
        nonNegativeFinite(track.delay) + defaultTrackDuration(track, defaultCurve)
      ),
      0
    );
  }
  if (clip.steps?.length) {
    return clip.steps.reduce((sum, step) => sum + defaultStepDuration(step, defaultCurve), 0);
  }

  const animating = Boolean(clip.transition || clip.from || clip.to);
  // Marker windows are allowed to be zero-length; actual animations are not.
  if (!animating) return nonNegativeFinite(clip.duration);
  if (isPhysicsSpring(defaultCurve)) return transitionDefaultDuration(defaultCurve);
  if (clip.duration !== undefined) return animatedDuration(clip.duration);
  if (isTransitionConfig(clip.transition)) return transitionDefaultDuration(clip.transition);
  // A from/to clip with neither duration nor transition animates with the
  // default spring, so its bar defaults to that spring's settle time instead
  // of collapsing to the minimum bar length. Markers stay zero-length.
  return clip.from || clip.to ? transitionDefaultDuration(DEFAULT_CLIP_TRANSITION) : 0;
}

export function normalizeLoopMode(value: unknown): TimelineClipLoop {
  // `mirror` no longer exists — sequences whose last step returns home
  // replaced it. Legacy values fold into `repeat`.
  if (value === true || value === 'mirror' || value === 'repeat') return 'repeat';
  return 'off';
}

// The bar owns the duration, so stored transitions carry only their shape:
// bounce for time springs, physics params as-is, and easings keep their
// (structural) duration field pinned to the clip length.
function normalizeStoredTransition(transition: TransitionConfig, clipDuration: number): TransitionConfig {
  if (transition.type === 'easing') {
    return { ...transition, duration: clipDuration };
  }
  if (isPhysicsSpring(transition)) {
    return transition;
  }
  return { type: 'spring', bounce: transition.bounce ?? 0.2 };
}

type ClipParseEntry = {
  path: string;
  childKey: string;
  group?: string;
  clip: TimelineClipConfig;
};

function collectClipEntries(config: TimelineConfig): ClipParseEntry[] {
  const entries: ClipParseEntry[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (key === 'duration') continue;
    if (RESERVED_KEYS.has(key)) {
      console.warn(`[dialkit] Timeline key "${key}" collides with a reserved key and was skipped.`);
      continue;
    }
    if (isClipConfig(value)) {
      entries.push({ path: key, childKey: key, clip: value });
    } else if (isGroupConfig(value)) {
      for (const [childKey, childClip] of Object.entries(value)) {
        if (isClipConfig(childClip)) {
          entries.push({ path: `${key}.${childKey}`, childKey, group: key, clip: childClip });
        } else {
          console.warn(
            `[dialkit] Timeline clip "${key}.${childKey}" is missing a numeric "at" and was skipped.`
          );
        }
      }
    } else {
      console.warn(
        `[dialkit] Timeline entry "${key}" is neither a clip (needs a numeric "at") nor a group of clips and was skipped.`
      );
    }
  }
  return entries;
}

/** Strips explicit-undefined leaves so step targets are safe to merge/range. */
function definedValues(values: TimelineStepValues | undefined): DialConfig | undefined {
  if (!values) return undefined;
  const result: DialConfig = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function setDialPath(dialConfig: DialConfig, path: string, value: DialConfig): void {
  const segments = path.split('.');
  let node = dialConfig;
  for (const segment of segments.slice(0, -1)) {
    node = (node[segment] ??= {}) as DialConfig;
  }
  node[segments[segments.length - 1]] = value;
}

export function parseTimelineConfig(config: TimelineConfig): ParsedTimeline {
  const entries = collectClipEntries(config);

  let maxEnd = 0;
  for (const { clip } of entries) {
    maxEnd = Math.max(maxEnd, nonNegativeFinite(clip.at) + defaultClipDuration(clip));
  }

  // Exact fit: the window ends when the content does, so a looping timeline
  // plays one full pass and wraps with no dead tail. Ceil (never round) to
  // 2dp — undershooting the content end would clip loops and drift their
  // phase every wrap. Set `duration` in config for slack to drag clips later.
  const duration =
    typeof config.duration === 'number' && Number.isFinite(config.duration) && config.duration > 0
      ? config.duration
      : maxEnd > 0
        ? Math.ceil(maxEnd * 100 - 1e-4) / 100
        : 1;

  const dialConfig: DialConfig = {};
  const clips: TimelineClipMeta[] = [];

  entries.forEach(({ path, childKey, group, clip }, index) => {
    // These combinations are untypeable (optional-never fields) but reachable
    // from plain JS — warn and pick a deterministic winner.
    const raw = clip as TimelineClipBase & {
      from?: DialConfig;
      to?: DialConfig;
      steps?: TimelineStepConfig[];
      props?: Record<string, TimelinePropConfig>;
    };
    if (raw.props && (raw.steps?.length || raw.from || raw.to)) {
      console.warn(
        `[dialkit] Timeline clip "${path}": "props" is mutually exclusive with from/to/steps — using "props".`
      );
    } else if (raw.steps?.length && raw.to) {
      console.warn(
        `[dialkit] Timeline clip "${path}": "to" is ignored when "steps" is present — each leg's "to" defines its targets.`
      );
    }

    const hasSteps = Boolean(clip.steps?.length) && !clip.props;
    const hasProps = Boolean(clip.props);
    const single = isTransitionConfig(clip.transition) ? clip.transition : undefined;
    const total = defaultClipDuration(clip);
    const defaultCurve = single ?? DEFAULT_CLIP_TRANSITION;
    const clipAt = nonNegativeFinite(clip.at);

    const clipDial: DialConfig = {
      at: [clipAt, 0, duration, CLIP_VALUE_STEP],
    };
    // Sequence and props clips derive their length from their parts — no
    // duration dial.
    if (!hasSteps && !hasProps) {
      clipDial.duration = [total, 0, duration, CLIP_VALUE_STEP];
    }

    // Every animating single-curve clip gets an editable curve; the bar
    // drives its duration.
    if (!hasSteps && !hasProps && (clip.transition || clip.from || clip.to)) {
      clipDial.transition = normalizeStoredTransition(defaultCurve, total);
    }

    // Independent property tracks: each is a full mini-clip folder — delay
    // (bar position), from/to or steps, and its own curve. The parent row
    // is a read-only composite.
    let tracks: TimelineClipTrackMeta[] | undefined;
    if (clip.props) {
      tracks = [];
      for (const [prop, track] of Object.entries(clip.props)) {
        if (TRACK_RESERVED.has(prop) || /^step\d+$/.test(prop)) {
          console.warn(`[dialkit] Timeline property "${prop}" collides with a clip field and was skipped.`);
          continue;
        }
        const trackDuration = defaultTrackDuration(track, defaultCurve);
        const trackCurve = track.transition ?? defaultCurve;
        const hasTrackSteps = Boolean(track.steps?.length);
        const trackDial: DialConfig = {
          delay: [nonNegativeFinite(track.delay), 0, duration, CLIP_VALUE_STEP],
        };
        if (!hasTrackSteps) {
          trackDial.duration = [trackDuration, 0, duration, CLIP_VALUE_STEP];
          trackDial.transition = normalizeStoredTransition(trackCurve, trackDuration);
        }
        const fromValue = track.from ?? (hasTrackSteps ? undefined : track.to);
        if (hasTrackSteps && fromValue === undefined) {
          console.warn(
            `[dialkit] Timeline clip "${path}": track "${prop}" has steps but no "from" — declare its starting value.`
          );
        }
        if (fromValue !== undefined) {
          trackDial.from = scalarDial(prop, fromValue, hasTrackSteps ? track.steps![0]?.to : track.to);
        }
        if (!hasTrackSteps && track.to !== undefined) {
          trackDial.to = scalarDial(prop, track.to, fromValue);
        }
        let trackStepKeys: string[] | undefined;
        if (hasTrackSteps) {
          trackStepKeys = [];
          let previous = fromValue;
          track.steps!.forEach((step, stepIndex) => {
            const stepKey = `step${stepIndex + 1}`;
            trackStepKeys!.push(stepKey);
            const stepDuration = defaultStepDuration(step, trackCurve);
            const stepDial: DialConfig = {
              duration: [stepDuration, 0, duration, CLIP_VALUE_STEP],
              transition: normalizeStoredTransition(step.transition ?? trackCurve, stepDuration),
            };
            if (step.to !== undefined) {
              stepDial.to = scalarDial(prop, step.to, previous);
              previous = step.to;
            }
            trackDial[stepKey] = stepDial;
          });
        }
        clipDial[prop] = trackDial;
        tracks.push({ prop, stepKeys: trackStepKeys });
      }
    }

    if (clip.from && !hasProps) {
      clipDial.from = withFromToRanges(
        clip.from,
        hasSteps ? definedValues(clip.steps![0]?.to) : clip.to
      );
    }
    if (!hasSteps && !hasProps && clip.to) {
      clipDial.to = withFromToRanges(clip.to, clip.from);
    }

    // One folder per leg: duration (the segment), target values, curve.
    // Untouched properties hold — the running state feeds slider ranges.
    let stepKeys: string[] | undefined;
    if (hasSteps) {
      stepKeys = [];
      let running: DialConfig | undefined = clip.from;
      clip.steps!.forEach((step, stepIndex) => {
        const stepKey = `step${stepIndex + 1}`;
        stepKeys!.push(stepKey);
        const stepDuration = defaultStepDuration(step, defaultCurve);
        const stepDial: DialConfig = {
          duration: [stepDuration, 0, duration, CLIP_VALUE_STEP],
          transition: normalizeStoredTransition(step.transition ?? defaultCurve, stepDuration),
        };
        const stepTo = definedValues(step.to);
        if (stepTo) {
          // The hold rule needs a starting value: a property first animated
          // mid-sequence has nothing to interpolate from and jumps instead.
          for (const prop of Object.keys(stepTo)) {
            if (!running || !(prop in running)) {
              console.warn(
                `[dialkit] Timeline clip "${path}": property "${prop}" first animates in step ${stepIndex + 1} with no starting value — declare it in "from".`
              );
            }
          }
          stepDial.to = withFromToRanges(stepTo, running);
        }
        clipDial[stepKey] = stepDial;
        running = { ...(running ?? {}), ...(stepTo ?? {}) };
      });
    }

    setDialPath(dialConfig, path, clipDial);

    clips.push({
      key: path,
      label: formatLabel(childKey),
      color: TIMELINE_CLIP_COLORS[index % TIMELINE_CLIP_COLORS.length],
      loop: normalizeLoopMode(clip.loop),
      group,
      stepKeys,
      tracks,
    });
  });

  return { duration, dialConfig, clips };
}

const TRACK_RESERVED = new Set(['at', 'duration', 'loop', 'from', 'to', 'transition', 'delay']);

// A scalar track value as a dial — wraps it in a single-key record so
// tracks and clips share exactly one range-inference policy.
function scalarDial(prop: string, value: number | string, counterpart: number | string | undefined): DialConfig[string] {
  const record = withFromToRanges(
    { [prop]: value } as DialConfig,
    counterpart === undefined ? undefined : ({ [prop]: counterpart } as DialConfig)
  );
  return record[prop];
}

// ── from/to slider ranges ──

// Bare numbers in from/to get property-aware slider ranges (the generic
// DialKit inference is value-based, which turns `y: 0` into a 0–1 slider).
// Ranges expand to include the actual from/to endpoints when they fall outside.
const FROM_TO_RANGE_PRESETS: [RegExp, { min: number; max: number; step: number }][] = [
  [/^(x|y|z|tx|ty|offsetx|offsety|translatex|translatey)$/i, { min: -100, max: 100, step: 1 }],
  [/rotat|angle|skew/i, { min: -180, max: 180, step: 1 }],
  [/^scale/i, { min: 0, max: 2, step: 0.01 }],
  [/opacity|alpha/i, { min: 0, max: 1, step: 0.01 }],
  [/blur|radius|spread/i, { min: 0, max: 100, step: 1 }],
];

function inferFromToRange(key: string, value: number, counterpart: number | undefined): [number, number, number, number] {
  const lo = Math.min(value, counterpart ?? value);
  const hi = Math.max(value, counterpart ?? value);

  const preset = FROM_TO_RANGE_PRESETS.find(([pattern]) => pattern.test(key))?.[1];
  if (preset) {
    return [value, Math.min(preset.min, lo), Math.max(preset.max, hi), preset.step];
  }

  // Generic fallback: unit-ish values get 0–1, everything else a range
  // spanning both endpoints with room to overshoot.
  if (lo >= 0 && hi <= 1) {
    return [value, 0, 1, 0.01];
  }
  const extent = Math.max(Math.abs(lo), Math.abs(hi), 1);
  const min = lo < 0 ? -extent * 2 : 0;
  const max = Math.max(extent * 2, hi);
  return [value, min, max, inferStep(min, max)];
}

// Rewrites bare-number leaves in a from/to config as explicit range tuples,
// using the matching key in the counterpart config to size the range.
function withFromToRanges(config: DialConfig, counterpart: DialConfig | undefined): DialConfig {
  const result: DialConfig = {};
  for (const [key, value] of Object.entries(config)) {
    const other = counterpart?.[key];
    if (typeof value === 'number') {
      result[key] = inferFromToRange(key, value, typeof other === 'number' ? other : undefined);
    } else if (isPlainObject(value) && !('type' in value)) {
      result[key] = withFromToRanges(
        value as DialConfig,
        isPlainObject(other) && !('type' in other) ? (other as DialConfig) : undefined
      );
    } else {
      result[key] = value as DialConfig[string];
    }
  }
  return result;
}

// ── Static clip data (edit-time) ──

// A curve ready to sample: cached spring params or bezier points, plus the
// duration easings normalize against.
type CurveStatic = {
  duration: number;
  spring?: SpringParams;
  settle?: number;
  ease?: [number, number, number, number];
};

function curveStatic(transition: TransitionConfig | undefined, duration: number): CurveStatic {
  if (!transition) return { duration };
  if (transition.type === 'easing') return { duration, ease: transition.ease };
  const spring = springParams(transition);
  return { duration, spring, settle: springSettleDuration(spring) };
}

function sampleCurve(curve: CurveStatic, elapsed: number): number {
  if (elapsed <= 0) return 0;
  if (curve.spring) {
    // Snap to done once settled so late samples are exactly 1
    if (curve.settle !== undefined && elapsed >= curve.settle) return 1;
    return springProgress(elapsed, curve.spring);
  }
  if (curve.ease) {
    return cubicBezierProgress(clamp(curve.duration > 0 ? elapsed / curve.duration : 1, 0, 1), curve.ease);
  }
  return curve.duration > 0 ? Math.min(1, elapsed / curve.duration) : 1;
}

export type TimelineStepStatic = {
  key: string | null; // null for the implicit single step of a from/to clip
  offset: number; // seconds from clip/track start
  duration: number; // effective — physics-resolved
  isPhysics: boolean;
  /** Full property state at step start — the hold rule made concrete. */
  start: Record<string, unknown>;
  /** Targets this step animates; untouched properties hold `start`. */
  to: Record<string, unknown>;
  curve: CurveStatic;
};

/**
 * One track: a step chain with its own cycle length and phase offset from
 * the clip's `at`. This is the unified runtime model — a shared-timing clip
 * is exactly one track (prop unset, delay 0) whose steps carry the full
 * property record; a props clip is one single-property track per entry.
 */
export type TimelineTrackStatic = {
  /** Set for a props clip's single-property tracks; unset for the shared track. */
  prop?: string;
  delay: number;
  duration: number;
  steps: TimelineStepStatic[];
};

export type TimelineClipStatic = {
  key: string;
  childKey: string;
  group?: string;
  at: number;
  /** Effective total duration — the bar length (one cycle for looping clips;
   * the widest track extent for props clips). */
  duration: number;
  loop: TimelineClipLoop;
  /** Where the clip stops affecting values: at + duration, or the timeline end when looping. */
  end: number;
  isPhysics: boolean;
  /** Motion-ready transition, its duration injected from the bar — single-curve clips only. */
  transition?: TransitionConfig;
  css?: TimelineClipCss;
  from?: Record<string, unknown>;
  /** Final merged state (the last leg's landing values for sequences). */
  to?: Record<string, unknown>;
  /** Every animating clip is tracks; empty for markers. */
  tracks: TimelineTrackStatic[];
  explicitSteps: boolean;
  /** Union of every property the clip touches. */
  props?: string[];
};

function resolvedAtPath(resolved: Record<string, unknown>, path: string): Record<string, unknown> {
  let node: unknown = resolved;
  for (const segment of path.split('.')) {
    node = isPlainObject(node) ? node[segment] : undefined;
  }
  return isPlainObject(node) ? node : {};
}

export function computeStaticClips(
  parsed: ParsedTimeline,
  flatValues: Record<string, DialValue>
): TimelineClipStatic[] {
  const resolved = resolveDialValues(parsed.dialConfig, flatValues) as Record<string, unknown>;
  return parsed.clips.map((clip) =>
    buildClipStatic(resolvedAtPath(resolved, clip.key), clip, parsed.duration)
  );
}

export type TimelineStaticState = {
  duration: number;
  clips: TimelineClipStatic[];
};

/**
 * Resolves the editable clip model and grows the timeline when a live value
 * creates content beyond its authored window. This is most important for
 * physics springs: changing stiffness/damping changes their emergent length.
 * The parsed duration remains the minimum, so shortening a clip never removes
 * the original editing room.
 */
export function computeStaticTimeline(
  parsed: ParsedTimeline,
  flatValues: Record<string, DialValue>
): TimelineStaticState {
  let clips = computeStaticClips(parsed, flatValues);
  const maxEnd = clips.reduce(
    (end, clip) => Math.max(end, clip.at + clip.duration),
    parsed.duration
  );
  const duration = maxEnd > parsed.duration
    ? Math.ceil(maxEnd * 100 - 1e-4) / 100
    : parsed.duration;

  if (duration !== parsed.duration) {
    clips = clips.map((clip) =>
      clip.loop === 'repeat' ? { ...clip, end: duration } : clip
    );
  }

  return { duration, clips };
}

/** The dock's resolver: the same static model the hook animates with,
 * rebuilt from flat stored values — bars, popovers, and playback can never
 * disagree about geometry. */
export function computeClipStaticFromValues(
  values: Record<string, DialValue>,
  clip: TimelineClipMeta,
  timelineDuration: number
): TimelineClipStatic {
  return buildClipStatic(unflattenClipValues(values, clip.key), clip, timelineDuration);
}

function buildClipStatic(
  clipResolved: Record<string, unknown>,
  clip: TimelineClipMeta,
  timelineDuration: number
): TimelineClipStatic {
  {
    const at = typeof clipResolved.at === 'number' ? clipResolved.at : 0;
    const from = isPlainObject(clipResolved.from) ? clipResolved.from : undefined;
    const single = isTransitionConfig(clipResolved.transition) ? clipResolved.transition : undefined;

    const staticClip: TimelineClipStatic = {
      key: clip.key,
      childKey: clip.group ? clip.key.slice(clip.group.length + 1) : clip.key,
      group: clip.group,
      at,
      duration: 0,
      loop: 'off',
      end: 0,
      isPhysics: false,
      from,
      tracks: [],
      explicitSteps: Boolean(clip.stepKeys?.length),
    };

    if (clip.tracks?.length) {
      // Independent property tracks: each chains its own scalar steps and
      // carries its own cycle length and phase offset.
      const tracks: (TimelineTrackStatic & { prop: string })[] = clip.tracks.map(({ prop, stepKeys }) => {
        const trackResolved = isPlainObject(clipResolved[prop])
          ? (clipResolved[prop] as Record<string, unknown>)
          : {};
        const delay = typeof trackResolved.delay === 'number' ? trackResolved.delay : 0;
        const fromValue = trackResolved.from;
        let steps: TimelineStepStatic[];
        let trackDuration = 0;

        if (stepKeys?.length) {
          let running = fromValue;
          steps = stepKeys.map((stepKey) => {
            const stepResolved = isPlainObject(trackResolved[stepKey])
              ? (trackResolved[stepKey] as Record<string, unknown>)
              : {};
            const storedDuration =
              typeof stepResolved.duration === 'number' ? stepResolved.duration : 0;
            const raw = isTransitionConfig(stepResolved.transition) ? stepResolved.transition : undefined;
            const effective = raw
              ? resolveClipTransition(raw, storedDuration)
              : { transition: undefined, duration: storedDuration, isPhysics: false };
            const toValue = stepResolved.to;
            const step: TimelineStepStatic = {
              key: stepKey,
              offset: trackDuration,
              duration: effective.duration,
              isPhysics: effective.isPhysics,
              start: running === undefined ? {} : { [prop]: running },
              to: toValue === undefined ? {} : { [prop]: toValue },
              curve: curveStatic(effective.transition, effective.duration),
            };
            if (toValue !== undefined) running = toValue;
            trackDuration += effective.duration;
            return step;
          });
        } else {
          const storedDuration =
            typeof trackResolved.duration === 'number' ? trackResolved.duration : 0;
          const raw = isTransitionConfig(trackResolved.transition) ? trackResolved.transition : undefined;
          const effective = raw
            ? resolveClipTransition(raw, storedDuration)
            : { transition: undefined, duration: storedDuration, isPhysics: false };
          const toValue = trackResolved.to;
          trackDuration = effective.duration;
          steps = [
            {
              key: null,
              offset: 0,
              duration: effective.duration,
              isPhysics: effective.isPhysics,
              start: fromValue === undefined ? {} : { [prop]: fromValue },
              to: toValue === undefined ? {} : { [prop]: toValue },
              curve: curveStatic(effective.transition, effective.duration),
            },
          ];
        }

        return { prop, delay, duration: trackDuration, steps };
      });

      staticClip.tracks = tracks;
      staticClip.props = tracks.map((track) => track.prop);
      staticClip.duration = tracks.reduce((max, track) => Math.max(max, track.delay + track.duration), 0);
      staticClip.from = Object.fromEntries(
        tracks.map((track) => [track.prop, track.steps[0].start[track.prop]])
      );
      staticClip.to = Object.fromEntries(
        tracks.map((track) => {
          const last = track.steps[track.steps.length - 1];
          return [track.prop, last.to[track.prop] ?? last.start[track.prop]];
        })
      );

      staticClip.loop = staticClip.duration > 0 ? clip.loop : 'off';
      staticClip.end = staticClip.loop === 'off' ? staticClip.at + staticClip.duration : timelineDuration;
      return staticClip;
    }

    if (clip.stepKeys?.length) {
      // Sequence: chain the legs, threading the running state through so
      // untouched properties hold their prior value.
      let running: Record<string, unknown> = { ...(from ?? {}) };
      let offset = 0;
      const steps: TimelineStepStatic[] = clip.stepKeys.map((stepKey) => {
        const stepResolved = isPlainObject(clipResolved[stepKey])
          ? (clipResolved[stepKey] as Record<string, unknown>)
          : {};
        const storedDuration =
          typeof stepResolved.duration === 'number' ? stepResolved.duration : 0;
        const raw = isTransitionConfig(stepResolved.transition) ? stepResolved.transition : undefined;
        const effective = raw
          ? resolveClipTransition(raw, storedDuration)
          : { transition: undefined, duration: storedDuration, isPhysics: false };
        const to = isPlainObject(stepResolved.to) ? stepResolved.to : {};
        const step: TimelineStepStatic = {
          key: stepKey,
          offset,
          duration: effective.duration,
          isPhysics: effective.isPhysics,
          start: running,
          to,
          curve: curveStatic(effective.transition, effective.duration),
        };
        running = { ...running, ...to };
        offset += effective.duration;
        return step;
      });

      staticClip.tracks = [{ delay: 0, duration: offset, steps }];
      staticClip.duration = offset;
      staticClip.to = running;
    } else {
      const storedDuration = typeof clipResolved.duration === 'number' ? clipResolved.duration : 0;
      const to = isPlainObject(clipResolved.to) ? clipResolved.to : undefined;

      if (single) {
        const effective = resolveClipTransition(single, storedDuration);
        staticClip.duration = effective.duration;
        staticClip.isPhysics = effective.isPhysics;
        staticClip.transition = effective.transition;
        staticClip.css = transitionToCss(effective.transition);
        staticClip.to = to;
        if (from && to) {
          staticClip.tracks = [
            {
              delay: 0,
              duration: effective.duration,
              steps: [
                {
                  key: null,
                  offset: 0,
                  duration: effective.duration,
                  isPhysics: effective.isPhysics,
                  start: from,
                  to,
                  curve: curveStatic(effective.transition, effective.duration),
                },
              ],
            },
          ];
        }
      } else {
        // Curveless clip (markers, or defensive fallback): the bar is the
        // stored duration; from/to animate with the default spring.
        staticClip.duration = storedDuration;
        staticClip.to = to;
        if (from && to) {
          const base = resolveClipTransition(DEFAULT_CLIP_TRANSITION, storedDuration);
          staticClip.duration = base.duration;
          staticClip.tracks = [
            {
              delay: 0,
              duration: base.duration,
              steps: [
                {
                  key: null,
                  offset: 0,
                  duration: base.duration,
                  isPhysics: false,
                  start: from,
                  to,
                  curve: curveStatic(base.transition, base.duration),
                },
              ],
            },
          ];
        }
      }
    }

    if (staticClip.tracks.length) {
      const props = new Set<string>(Object.keys(from ?? {}));
      for (const track of staticClip.tracks) {
        for (const step of track.steps) {
          for (const prop of Object.keys(step.to)) props.add(prop);
        }
      }
      staticClip.props = Array.from(props);
    }

    staticClip.loop = staticClip.duration > 0 ? clip.loop : 'off';
    staticClip.end = staticClip.loop === 'off' ? staticClip.at + staticClip.duration : timelineDuration;

    return staticClip;
  }
}

// ── Per-frame clip state ──

function stepAtPosition(steps: TimelineStepStatic[], pos: number): TimelineStepStatic {
  for (const step of steps) {
    if (pos < step.offset + step.duration) return step;
  }
  return steps[steps.length - 1];
}

/** One property's value at a cycle position — the hold rule in one place,
 * shared by the frame pass and the waveform sampler. */
function evalPropAtPos(steps: TimelineStepStatic[], prop: string, pos: number): unknown {
  const step = stepAtPosition(steps, pos);
  const within = Math.max(0, pos - step.offset);
  if (prop in step.to) {
    const eased = sampleCurve(step.curve, within);
    return interpolateResolved(step.start[prop], step.to[prop], eased);
  }
  return step.start[prop];
}

/**
 * `time` is the playhead (what the dock shows); `cycleTime` is continuous
 * time across timeline wraps (wraps × duration + time). Looping clips fold
 * against `cycleTime`, so a looping timeline never snaps their phase — the
 * window is a viewport onto animations that repeat forever. Scrubbing seeks
 * with cycleTime === time, which is the deterministic first-pass state.
 */
export function computeClipState(
  clip: TimelineClipStatic,
  time: number,
  cycleTime = time
): Record<string, unknown> {
  const total = clip.duration;
  const looping = clip.loop === 'repeat' && total > 0;
  // Once the timeline has wrapped, a looping clip is already running even
  // before its `at` — it has been repeating since the previous pass.
  const started = time >= clip.at || (looping && cycleTime > time);
  const done = time >= clip.end;
  const elapsed = time - clip.at;
  const phaseElapsed = looping ? cycleTime - clip.at : elapsed;

  const fold = (e: number): number => (looping ? e % total : e);

  const basePos = started ? fold(Math.max(0, phaseElapsed)) : 0;
  const progress = total > 0 ? clamp(basePos / total, 0, 1) : started ? 1 : 0;

  let current: Record<string, unknown> | undefined;
  let stepIndex = 0;

  if (clip.tracks.length && clip.props?.length) {
    // One loop for every clip kind: each track folds against its own cycle,
    // offset by its delay. The delay applies once, then cycles fold — with
    // equal periods that is a permanent phase shift (Motion's semantics). A
    // shared-timing clip is a single track whose steps carry every property.
    current = {};
    for (const track of clip.tracks) {
      const props = track.prop !== undefined ? [track.prop] : clip.props;
      for (const prop of props) {
        const startValue = track.steps[0]?.start[prop];
        if (!started) {
          if (startValue !== undefined) current[prop] = startValue;
          continue;
        }
        const phase = phaseElapsed - track.delay;
        if (phase <= 0) {
          if (startValue !== undefined) current[prop] = startValue;
          continue;
        }
        const pos = looping && track.duration > 0 ? phase % track.duration : phase;
        const value = evalPropAtPos(track.steps, prop, pos);
        if (value !== undefined) current[prop] = value;
      }
    }
    const shared = clip.tracks[0];
    if (started && clip.explicitSteps && shared.prop === undefined) {
      stepIndex = shared.steps.indexOf(stepAtPosition(shared.steps, basePos));
    }
  }

  return {
    at: clip.at,
    duration: clip.duration,
    loop: clip.loop,
    started,
    active: started && !done,
    done,
    progress,
    step: clip.explicitSteps ? stepIndex : undefined,
    from: clip.from,
    to: clip.to,
    animate: started ? clip.to : clip.from,
    transition: clip.transition,
    css: clip.css,
    current,
  };
}

// ── Value interpolation ──

// Mixes two resolved from/to value trees at eased progress p.
// Numbers lerp (and can overshoot), hex colors mix in clamped RGB,
// anything else switches at the midpoint.
export function interpolateResolved(from: unknown, to: unknown, p: number): unknown {
  if (typeof from === 'number' && typeof to === 'number') {
    return from + (to - from) * p;
  }
  if (typeof from === 'string' && typeof to === 'string') {
    const mixed = mixHexColors(from, to, p);
    if (mixed) return mixed;
  }
  if (isPlainObject(from) && isPlainObject(to)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(from)) {
      result[key] = key in to ? interpolateResolved(from[key], to[key], p) : from[key];
    }
    for (const key of Object.keys(to)) {
      if (!(key in from)) result[key] = to[key];
    }
    return result;
  }
  return p < 0.5 ? from : to;
}

function parseHex(hex: string): [number, number, number, number] | null {
  if (!isHexColor(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ];
}

function mixHexColors(a: string, b: string, p: number): string | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const t = clamp(p, 0, 1);
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const rgb = `#${hex(mixed[0])}${hex(mixed[1])}${hex(mixed[2])}`;
  return mixed[3] === 255 ? rgb : `${rgb}${hex(mixed[3])}`;
}

// ── CSS output ──

// Approximates the clip's transition as CSS transition properties so
// non-Motion consumers can use native CSS. Easing configs map exactly;
// springs are approximated with an overshoot bezier scaled by bounce.
export function transitionToCss(transition: TransitionConfig | undefined): TimelineClipCss | undefined {
  if (!transition) return undefined;

  if (transition.type === 'easing') {
    return {
      transitionDuration: `${round2(transition.duration)}s`,
      transitionTimingFunction: `cubic-bezier(${transition.ease.map((v) => round2(v)).join(', ')})`,
    };
  }

  const params = springParams(transition);
  const dampingRatio = params.damping / (2 * Math.sqrt(params.stiffness * params.mass));
  const duration = transition.visualDuration ?? springSettleDuration(params);
  const bounce = transition.bounce ?? Math.max(0, round2(1 - dampingRatio));

  return {
    transitionDuration: `${round2(duration)}s`,
    transitionTimingFunction:
      bounce > 0.05
      ? `cubic-bezier(0.34, ${round2(1.2 + bounce)}, 0.64, 1)`
      : 'cubic-bezier(0.25, 0.6, 0.35, 1)',
  };
}

// ── Dock helpers ──

/** Popover display values: swap stored shape-only transitions for their
 * effective configs (duration injected from the bar/segment) so the curve
 * editor shows the transition as it actually runs. */
export function timelinePopoverDisplayValues(
  values: Record<string, DialValue>,
  clipKey: string,
  stepKeys?: string[],
  stepKey?: string
): Record<string, DialValue> {
  const display = { ...values };
  const swap = (path: string, duration: number) => {
    const raw = display[path];
    if (isTransitionConfig(raw)) display[path] = resolveClipTransition(raw, duration).transition;
  };

  if (stepKey) {
    swap(`${clipKey}.${stepKey}.transition`, numberValue(values[`${clipKey}.${stepKey}.duration`]));
    return display;
  }

  const cycle = stepKeys?.length
    ? stepKeys.reduce((sum, sk) => sum + numberValue(values[`${clipKey}.${sk}.duration`]), 0)
    : numberValue(values[`${clipKey}.duration`]);

  swap(`${clipKey}.transition`, cycle);
  return display;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

// ── Property lanes ──

/** Rebuilds the nested resolved shape for one clip from flat stored values —
 * the dock's inverse of the panel's path flattening. */
function unflattenClipValues(
  values: Record<string, DialValue>,
  clipKey: string
): Record<string, unknown> {
  const prefix = `${clipKey}.`;
  const result: Record<string, unknown> = {};
  const entries = Object.entries(values)
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, value]) => ({ segments: path.slice(prefix.length).split('.'), value }))
    .sort((a, b) => a.segments.length - b.segments.length);

  for (const { segments, value } of entries) {
    let node = result;
    for (let i = 0; i < segments.length - 1; i++) {
      const existing = node[segments[i]];
      node = (isPlainObject(existing) ? existing : (node[segments[i]] = {})) as Record<string, unknown>;
    }
    node[segments[segments.length - 1]] = cloneTimelineValue(value);
  }
  return result;
}

function cloneTimelineValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneTimelineValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneTimelineValue(nested)])
  );
}

/** Dragging a track bar edits the property's phase offset. */
export function clampTrackDelay(
  delay: number,
  at: number,
  trackDuration: number,
  timelineDuration: number
): number {
  return clamp(round2(delay), 0, Math.max(0, round2(timelineDuration - at - trackDuration)));
}

// Clip-edit clamp policy — one place, shared by every gesture/consumer.
export function clampClipMove(at: number, duration: number, timelineDuration: number): number {
  return clamp(round2(at), 0, Math.max(0, timelineDuration - duration));
}

export function clampClipResizeEnd(duration: number, at: number, timelineDuration: number): number {
  return clamp(round2(duration), TIMELINE_MIN_CLIP_DURATION, timelineDuration - at);
}

export function clampClipResizeStart(
  newAt: number,
  at: number,
  duration: number
): { at: number; duration: number } {
  const clampedAt = clamp(round2(newAt), 0, at + duration - TIMELINE_MIN_CLIP_DURATION);
  return { at: clampedAt, duration: round2(at + duration - clampedAt) };
}

/** Resizing one leg of a sequence: the other legs keep their length, the
 * whole bar must still fit the timeline. */
export function clampStepResize(
  duration: number,
  at: number,
  otherStepsTotal: number,
  timelineDuration: number
): number {
  const max = Math.max(TIMELINE_MIN_CLIP_DURATION, timelineDuration - at - otherStepsTotal);
  return clamp(round2(duration), TIMELINE_MIN_CLIP_DURATION, max);
}

/** Copy-for-agent export: strip editor-only state, normalize shape-only
 * transitions, resolve physics durations, and drop zero-value defaults. */
export function normalizeTimelineValuesForCopy(
  values: Record<string, DialValue>,
  clips: TimelineClipMeta[]
): Record<string, DialValue> {
  const normalized: Record<string, DialValue> = { ...values };

  // Transition mode is editor UI state, not part of a DialKit config. It is
  // stored beside values so mode switches survive presets, but must never be
  // included in the tune → copy → remove payload.
  for (const path of Object.keys(normalized)) {
    if (path.endsWith('.__mode')) delete normalized[path];
  }

  const normalizeTransitionAt = (transitionPath: string, durationPath: string) => {
    const raw = normalized[transitionPath];
    if (!isTransitionConfig(raw)) return;
    if (isPhysicsSpring(raw)) {
      // A mode switch can leave the previous time-based bar duration stored.
      // Export the spring's actual derived length so the copied config exactly
      // matches the timeline the author just tuned.
      normalized[durationPath] = transitionDefaultDuration(raw);
    }
    normalized[transitionPath] = normalizeStoredTransition(
      raw,
      numberValue(normalized[durationPath])
    );
  };

  for (const clip of clips) {
    for (const stepKey of clip.stepKeys ?? []) {
      normalizeTransitionAt(
        `${clip.key}.${stepKey}.transition`,
        `${clip.key}.${stepKey}.duration`
      );
    }

    normalizeTransitionAt(`${clip.key}.transition`, `${clip.key}.duration`);

    // Property tracks: normalize each track's transitions against its own
    // durations, drop zero delays (the config default).
    for (const track of clip.tracks ?? []) {
      const trackKey = `${clip.key}.${track.prop}`;
      for (const stepKey of track.stepKeys ?? []) {
        normalizeTransitionAt(
          `${trackKey}.${stepKey}.transition`,
          `${trackKey}.${stepKey}.duration`
        );
      }
      normalizeTransitionAt(`${trackKey}.transition`, `${trackKey}.duration`);
      if (normalized[`${trackKey}.delay`] === 0) {
        delete normalized[`${trackKey}.delay`];
      }
    }

    delete normalized[`${clip.key}.loop`];
  }
  return normalized;
}

// ── Formatting ──

export function formatClock(time: number, tenths = false): string {
  const safe = Math.max(0, time);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  const secondsText = tenths
    ? seconds.toFixed(1).padStart(4, '0')
    : String(Math.floor(seconds)).padStart(2, '0');
  return `${String(minutes).padStart(2, '0')}:${secondsText}`;
}

export function formatSeconds(value: number): string {
  return `${round2(value)}s`;
}

export function formatStepLabel(stepKey: string): string {
  const match = /^step(\d+)$/.exec(stepKey);
  return match ? `Step ${match[1]}` : formatLabel(stepKey);
}

// ── Keyboard ──
// Shared by every adapter so the playhead, clips and clip editor respond to
// the same keys everywhere.

/** Arrow keys move the playhead and clips by this many seconds; Shift moves ten times as far. */
const TIMELINE_KEY_STEP = 0.05;

type TimelineKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey' | 'target' | 'currentTarget' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'
>;

function formatTimelineTime(time: number): string {
  return `${time.toFixed(2)} seconds`;
}

export function playheadValueText(time: number, duration: number): string {
  return `${formatTimelineTime(time)} of ${duration.toFixed(2)}`;
}

/** A clip's (or sequence leg's) accessible name: its label and the span it covers. */
export function clipAccessibleName(label: string, at: number, duration: number): string {
  return `${label}, ${at.toFixed(2)} to ${formatTimelineTime(at + duration)}`;
}

/**
 * Playhead keys: arrows step along a 0.05 s grid, Shift a 0.5 s grid,
 * Option/Alt 0.01 s; Home and End jump to either end.
 */
export function playheadKeyTime(
  key: string,
  time: number,
  duration: number,
  shift = false,
  fine = false
): number | undefined {
  if (key === 'Home') return 0;
  if (key === 'End') return duration;
  const direction = key === 'ArrowRight' || key === 'ArrowUp' ? 1
    : key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 0;
  if (!direction) return undefined;
  const step = shift ? TIMELINE_KEY_STEP * 10 : fine ? CLIP_VALUE_STEP : TIMELINE_KEY_STEP;
  const position = time / step;
  const next = (direction > 0 ? Math.floor(position + 1e-9) + 1 : Math.ceil(position - 1e-9) - 1) * step;
  return clamp(Number(next.toFixed(6)), 0, Math.max(0, duration));
}

/** Keyboard scrubbing on the playhead. Like a pointer scrub, it pauses playback. */
export function handlePlayheadKey(
  event: TimelineKeyEvent,
  timelineId: string,
  reveal?: (time: number) => void
): void {
  if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey) return;
  const transport = TimelineStore.getTransport(timelineId);
  const next = playheadKeyTime(event.key, transport.time, transport.duration, event.shiftKey, event.altKey);
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  TimelineStore.pause(timelineId);
  reveal?.(next);
  TimelineStore.seek(timelineId, next);
}

/** Up/Down on the dock's resize handle raise or lower its maximum height by 20px (Shift 100px). */
export function dockResizeKeyHeight(
  key: string,
  height: number,
  min: number,
  max: number,
  shift = false
): number | undefined {
  const direction = key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0;
  if (!direction) return undefined;
  const limit = Math.max(min, max);
  return clamp(Math.min(height, limit) + direction * (shift ? 100 : 20), min, limit);
}

const SPACE_OWNERS = 'button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="button"]';

/** Space plays or pauses while focus is in the timeline, unless a button or field owns the key. */
export function handleTimelineSpaceKey(event: TimelineKeyEvent, timelineId: string): void {
  if (event.key !== ' ' || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if ((event.target as Element | null)?.closest?.(SPACE_OWNERS)) return;
  event.preventDefault();
  if (TimelineStore.getTransport(timelineId).playing) {
    TimelineStore.pause(timelineId);
    announce(`Paused at ${formatTimelineTime(TimelineStore.getTransport(timelineId).time)}`);
  } else {
    TimelineStore.play(timelineId);
    announce('Playing');
  }
}

export type TimelineClipKeyTarget = {
  /** Value path of the clip or property track. */
  key: string;
  label: string;
  at: number;
  duration: number;
  timelineDuration: number;
  /** Property tracks sit at `baseAt + delay`; moving one edits its delay. */
  baseAt?: number;
  delayMode?: boolean;
  fixedDuration?: boolean;
  steps?: Pick<TimelineStepStatic, 'key' | 'duration' | 'isPhysics'>[];
};

export type TimelineClipKeyEdit = {
  values: Record<string, number>;
  at: number;
  end: number;
};

/**
 * Left/Right move a clip by the same rules as dragging it; with `resize`
 * (Option/Alt) they change its length instead — for a sequence, the length
 * of the focused leg (the last one when none is given).
 */
export function clipKeyEdit(
  target: TimelineClipKeyTarget,
  key: string,
  shift = false,
  resize = false,
  stepKey?: string
): TimelineClipKeyEdit | undefined {
  const direction = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (!direction) return undefined;
  const dt = direction * TIMELINE_KEY_STEP * (shift ? 10 : 1);
  const { key: path, at, duration, timelineDuration, baseAt = 0, steps } = target;
  if (!resize) {
    if (target.delayMode) {
      const delay = clampTrackDelay(at + dt - baseAt, baseAt, duration, timelineDuration);
      return { values: { [`${path}.delay`]: delay }, at: baseAt + delay, end: baseAt + delay + duration };
    }
    const nextAt = clampClipMove(at + dt, duration, timelineDuration);
    return { values: { [`${path}.at`]: nextAt }, at: nextAt, end: nextAt + duration };
  }
  if (steps?.length) {
    const index = stepKey ? steps.findIndex((step) => step.key === stepKey) : steps.length - 1;
    const step = steps[index];
    if (!step || step.isPhysics) return undefined;
    const others = steps.reduce((sum, candidate, j) => (j === index ? sum : sum + candidate.duration), 0);
    const next = clampStepResize(step.duration + dt, at, others, timelineDuration);
    return { values: { [`${path}.${step.key ?? ''}.duration`]: next }, at, end: at + others + next };
  }
  if (target.fixedDuration || duration <= 0) return undefined;
  const next = clampClipResizeEnd(duration + dt, at, timelineDuration);
  return { values: { [`${path}.duration`]: next }, at, end: at + next };
}

/**
 * Clip keys: Enter or Space opens the clip (as a click does), Left/Right move
 * it, and Option/Alt + Left/Right change its length. Sequence legs take focus
 * one by one; `open` receives the focused element and its step key.
 */
export function handleTimelineClipKey(
  event: TimelineKeyEvent,
  timelineId: string,
  target: TimelineClipKeyTarget,
  open: (element: HTMLElement, stepKey?: string) => void
): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
  const element = event.target as HTMLElement;
  if (element !== event.currentTarget && element.dataset?.step === undefined) return;
  const stepKey = element.dataset?.step || undefined;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    open(element, stepKey);
    return;
  }
  const edit = clipKeyEdit(target, event.key, event.shiftKey, event.altKey, stepKey);
  if (!edit) return;
  event.preventDefault();
  event.stopPropagation();
  const resolve = clipElementResolver(element);
  DialStore.updateValues(timelineId, edit.values);
  if (!element.isConnected) resolve()?.focus({ preventScroll: true });
  announce(`${target.label} ${edit.at.toFixed(2)} to ${formatTimelineTime(edit.end)}`);
}

/**
 * Run an update that may rebuild the timeline's rows, then put focus back on
 * the control at the same position if the focused one was replaced.
 */
export function preserveTimelineFocus(root: HTMLElement, update: () => void): void {
  const stops = () => Array.from(root.querySelectorAll<HTMLElement>('button, [tabindex="0"]'));
  const active = document.activeElement;
  const index = active instanceof HTMLElement && root.contains(active) ? stops().indexOf(active) : -1;
  update();
  if (index >= 0 && !active!.isConnected) stops()[index]?.focus({ preventScroll: true });
}

const POPOVER_FOCUSABLE ='button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard for the clip editor: its first field takes focus on open. Escape
 * closes it from anywhere; Escape inside it, the close button, or tabbing past
 * either end returns focus to the clip that opened it. Returns a cleanup.
 */
export function observeClipPopover(
  popover: HTMLElement,
  close: () => void,
  opener: () => HTMLElement | null | undefined = focusedClip()
): () => void {
  let frame = 0;
  const stops = () => Array.from(popover.querySelectorAll<HTMLElement>(POPOVER_FOCUSABLE))
    .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'));
  const focusFirstField = (attempt = 0) => {
    const field = stops().find((element) => !element.closest('.dialkit-timeline-popover-header'));
    // Adapters reveal the popover once it has been measured.
    if (field && getComputedStyle(popover).visibility !== 'hidden') {
      field.focus({ preventScroll: true });
      return;
    }
    if (attempt < 10) frame = requestAnimationFrame(() => focusFirstField(attempt + 1));
  };
  const returnFocus = () => {
    const target = opener();
    if (target?.isConnected) target.focus({ preventScroll: true });
  };
  // On the document, after the controls' own handlers, so a field that uses
  // Escape (cancelling an edit, closing a menu) keeps it.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const inside = popover.contains(event.target as Node);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      if (inside) returnFocus();
      return;
    }
    if (event.key !== 'Tab' || !inside) return;
    const focusable = stops();
    const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1];
    if (edge && document.activeElement !== edge) return;
    event.preventDefault();
    close();
    returnFocus();
  };
  const onClick = (event: MouseEvent) => {
    if ((event.target as Element).closest?.('.dialkit-timeline-popover-close')) returnFocus();
  };
  focusFirstField();
  document.addEventListener('keydown', onKeyDown);
  popover.addEventListener('click', onClick, true);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('keydown', onKeyDown);
    popover.removeEventListener('click', onClick, true);
  };
}

/** The focused clip or sequence leg, captured now so focus can return to it. */
function focusedClip(): () => HTMLElement | null {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  return active instanceof HTMLElement && active.closest('.dialkit-timeline-clip') ? clipElementResolver(active) : () => null;
}

/** Some adapters rebuild clip rows on edit; find the same clip (or leg) again by its key. */
function clipElementResolver(element: HTMLElement): () => HTMLElement | null {
  const section = element.closest?.('.dialkit-timeline-section');
  const key = element.closest?.<HTMLElement>('.dialkit-timeline-clip')?.dataset.clip;
  const stepKey = element.dataset?.step;
  return () => {
    if (element.isConnected) return element;
    if (!section || key === undefined) return null;
    const clip = section.querySelector<HTMLElement>(`.dialkit-timeline-clip[data-clip="${CSS.escape(key)}"]`);
    return stepKey ? clip?.querySelector<HTMLElement>(`[data-step="${CSS.escape(stepKey)}"]`) ?? null : clip;
  };
}
