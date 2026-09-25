export type DropdownPosition = {
  top: number;
  left: number;
  width: number;
  above: boolean;
  maxHeight: number;
};

export type DropdownPositionOptions = {
  dropdownHeight?: number;
  gap?: number;
  allowAbove?: boolean;
  width?: number;
  maxHeight?: number;
  preferSide?: boolean;
  fixed?: boolean;
};

export function getDropdownPosition(
  trigger: HTMLElement,
  portalRoot: HTMLElement,
  options: DropdownPositionOptions = {}
): DropdownPosition {
  const { dropdownHeight = 0, gap = 4, allowAbove = true } = options;
  const triggerRect = trigger.getBoundingClientRect();
  const rootRect = portalRoot.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const margin = 8;
  const spaceBelow = Math.max(0, viewportTop + viewportHeight - triggerRect.bottom - gap - margin);
  const spaceAbove = Math.max(0, triggerRect.top - viewportTop - gap - margin);
  const above = allowAbove && spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
  let maxHeight = Math.min(options.maxHeight ?? 320, above ? spaceAbove : spaceBelow);
  const height = Math.min(dropdownHeight, maxHeight);
  const width = Math.min(options.width ?? triggerRect.width, Math.max(0, viewportWidth - margin * 2));
  let left = Math.max(viewportLeft + margin, Math.min(triggerRect.left, viewportLeft + viewportWidth - width - margin));
  let top = Math.max(viewportTop + margin, above ? triggerRect.top - height - gap : triggerRect.bottom + gap);

  // Taller editors sit beside the panel so the full control remains visible.
  if (options.preferSide) {
    const sideRect = trigger.closest('.dialkit-panel-inner')?.getBoundingClientRect() ?? triggerRect;
    const before = sideRect.left - width - gap;
    const after = sideRect.right + gap;
    if (before >= viewportLeft + margin) left = before;
    else if (after + width <= viewportLeft + viewportWidth - margin) left = after;
    maxHeight = Math.min(options.maxHeight ?? 480, viewportHeight - margin * 2);
    top = Math.max(viewportTop + margin, Math.min(triggerRect.top - 32, viewportTop + viewportHeight - Math.min(dropdownHeight, maxHeight) - margin));
  }

  return {
    top: options.fixed ? top : top - rootRect.top + portalRoot.scrollTop - portalRoot.clientTop,
    left: options.fixed ? left : left - rootRect.left + portalRoot.scrollLeft - portalRoot.clientLeft,
    width,
    above,
    maxHeight,
  };
}

/** Render a fixed popup in the top layer, where viewport coordinates hold even under a transformed ancestor. */
export function showInTopLayer(popup: HTMLElement) {
  if (typeof popup.showPopover !== 'function' || popup.matches(':popover-open')) return;
  popup.setAttribute('popover', 'manual');
  popup.showPopover();
}

/** Track scroll, resize, panel dragging, and layout animations while a popup is open. */
export function observeDropdownPosition(trigger: HTMLElement, update: () => void, popup?: () => HTMLElement | null | undefined): () => void {
  let frame = 0;
  let disposed = false;
  let previous = '';
  const tick = () => {
    if (disposed) return;
    const floating = popup?.();
    if (floating?.isConnected && floating.style.position === 'fixed') showInTopLayer(floating);
    const rect = trigger.getBoundingClientRect();
    const root = getDialKitPortalRoot(trigger)?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const next = [rect.x, rect.y, rect.width, rect.height, root?.x, root?.y,
      popup?.()?.scrollHeight, window.innerWidth, window.innerHeight, viewport?.height, viewport?.offsetTop, viewport?.offsetLeft].join(',');
    if (next !== previous) {
      previous = next;
      update();
    }
    if (!disposed) frame = requestAnimationFrame(tick);
  };
  tick();
  window.addEventListener('scroll', update, true);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', update, true);
  };
}

export function getDialKitPortalRoot(trigger: HTMLElement | null | undefined): HTMLElement | null {
  return (trigger?.closest('.dialkit-root') as HTMLElement | null) ?? null;
}
