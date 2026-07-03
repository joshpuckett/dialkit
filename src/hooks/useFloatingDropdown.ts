import { useEffect, useRef } from 'react';
import { attachDropdown, type AttachDropdownOptions } from '../dropdown-position';

/**
 * Tethers a floating dropdown to a trigger via Floating UI while `isOpen`.
 * Returns refs to attach to the trigger and the floating element. Positioning
 * stays glued through scroll/resize/layout shifts — no manual recompute.
 */
export function useFloatingDropdown<T extends HTMLElement, F extends HTMLElement>(
  isOpen: boolean,
  options: AttachDropdownOptions = {}
) {
  const triggerRef = useRef<T>(null);
  const floatingRef = useRef<F>(null);
  // Keep the latest options without retriggering the effect on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!isOpen || !triggerRef.current || !floatingRef.current) return;
    return attachDropdown(triggerRef.current, floatingRef.current, optionsRef.current);
  }, [isOpen]);

  return { triggerRef, floatingRef };
}
