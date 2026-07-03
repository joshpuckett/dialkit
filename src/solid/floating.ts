import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { attachDropdown, type AttachDropdownOptions } from '../dropdown-position';

/**
 * Tethers a floating dropdown to a trigger via Floating UI while `isOpen`.
 * While open and both elements exist, runs `attachDropdown` inside a
 * createEffect and detaches via onCleanup. Positioning stays glued through
 * scroll/resize/layout shifts — no manual recompute.
 */
export function useFloatingDropdown(
  isOpen: Accessor<boolean>,
  getTrigger: () => HTMLElement | null | undefined,
  getFloating: () => HTMLElement | null | undefined,
  options: AttachDropdownOptions = {}
) {
  createEffect(() => {
    if (!isOpen()) return;
    const trigger = getTrigger();
    const floating = getFloating();
    if (!trigger || !floating) return;
    const cleanup = attachDropdown(trigger, floating, options);
    onCleanup(cleanup);
  });
}
