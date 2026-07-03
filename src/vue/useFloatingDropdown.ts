import { watch, onBeforeUnmount, type Ref } from 'vue';
import { attachDropdown, type AttachDropdownOptions } from '../dropdown-position';

/**
 * Tethers a floating dropdown to a trigger via Floating UI while `isOpen`.
 * While the dropdown is open and both trigger + floating exist, calls
 * attachDropdown and stores the returned cleanup; runs cleanup on close and
 * on unmount. Positioning stays glued through scroll/resize/layout shifts.
 */
export function useFloatingDropdown(
  isOpen: Ref<boolean>,
  triggerRef: Ref<HTMLElement | null>,
  floatingRef: Ref<HTMLElement | null>,
  options: AttachDropdownOptions = {}
) {
  let cleanup: (() => void) | null = null;

  const detach = () => {
    cleanup?.();
    cleanup = null;
  };

  const attach = () => {
    detach();
    if (isOpen.value && triggerRef.value && floatingRef.value) {
      cleanup = attachDropdown(triggerRef.value, floatingRef.value, options);
    }
  };

  // React to open state and to the floating element mounting/unmounting.
  watch([isOpen, floatingRef], () => attach(), { flush: 'post' });

  onBeforeUnmount(detach);
}
