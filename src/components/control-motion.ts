import type { Transition } from 'motion/react';

/**
 * Shared enter/exit animation preset for the wrapper that Panel.tsx
 * puts around every control so conditionally-visible controls animate
 * in and out smoothly when their visibleWhen rule flips.
 *
 * The wrapper's `height: auto` fits the child control's natural row
 * height (DialKit controls use CSS fixed heights like
 * `height: var(--dial-row-height)` on `.dialkit-slider-wrapper`).
 *
 * `marginBottom: -6` cancels the parent's 6px flex gap during exit so
 * scalar controls don't leave a 6px orphan of empty space while they
 * shrink. At rest it animates back to 0, restoring the normal gap.
 * The -6 value must match `.dialkit-folder-inner { gap: 6px }` in
 * theme.css — if the gap changes, update this value to match.
 *
 * `overflow: hidden` clips the child while the wrapper's height is
 * less than auto, giving the collapse-reveal effect.
 */
export const CONTROL_ANIM = {
  initial: { opacity: 0, height: 0, marginBottom: -6 },
  animate: { opacity: 1, height: 'auto' as const, marginBottom: 0 },
  exit: { opacity: 0, height: 0, marginBottom: -6 },
  transition: {
    type: 'spring',
    visualDuration: 0.25,
    bounce: 0.1,
  } as Transition,
  style: { overflow: 'hidden' as const },
} as const;
