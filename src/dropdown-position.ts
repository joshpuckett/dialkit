import { computePosition, autoUpdate, offset, flip, shift, size, type Placement } from '@floating-ui/dom';

export type AttachDropdownOptions = {
  placement?: Placement;
  gap?: number;
  matchWidth?: boolean;
  padding?: number;
  onPlacement?: (placement: Placement) => void;
};

/**
 * Tether a floating element to a trigger using Floating UI. `autoUpdate` keeps
 * it glued through scrolling ancestors, resize, and layout shifts, and
 * flip/shift keep it on-screen. Returns a cleanup function to detach.
 */
export function attachDropdown(
  trigger: HTMLElement,
  floating: HTMLElement,
  options: AttachDropdownOptions = {}
): () => void {
  const { placement = 'bottom-start', gap = 4, matchWidth = false, padding = 8, onPlacement } = options;

  const middleware = [offset(gap), flip({ padding }), shift({ padding })];
  if (matchWidth) {
    middleware.push(
      size({
        apply({ rects, elements }) {
          elements.floating.style.minWidth = `${rects.reference.width}px`;
        },
      })
    );
  }

  const update = () => {
    computePosition(trigger, floating, { strategy: 'fixed', placement, middleware }).then(
      ({ x, y, placement: resolved }) => {
        floating.style.position = 'fixed';
        floating.style.left = `${x}px`;
        floating.style.top = `${y}px`;
        onPlacement?.(resolved);
      }
    );
  };

  return autoUpdate(trigger, floating, update);
}

export function getDialKitPortalRoot(trigger: HTMLElement | null | undefined): HTMLElement | null {
  return (trigger?.closest('.dialkit-root') as HTMLElement | null) ?? null;
}
