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

/** Track scroll, resize, panel dragging, and layout animations while a popup is open. */
export function observeDropdownPosition(trigger: HTMLElement, update: () => void, popup?: () => HTMLElement | null | undefined): () => void {
  let frame = 0;
  let disposed = false;
  let previous = '';
  const tick = () => {
    if (disposed) return;
    const floating = popup?.();
    if (floating?.isConnected && floating.style.position === 'fixed' && typeof floating.showPopover === 'function' && !floating.matches(':popover-open')) {
      floating.setAttribute('popover', 'manual');
      floating.showPopover();
    }
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

/** Pickers portal out of the popover that opened them, so containment alone can't
 * tell whether a press landed inside that popover. */
export function isFloatingControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest('.dialkit-color-popover, .dialkit-image-popover, .dialkit-select-dropdown') !== null;
}

export type AnchorRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

function clipBar(section: Element | null, clipKey: string): HTMLElement | null {
  if (!section) return null;
  for (const bar of Array.from(section.querySelectorAll<HTMLElement>('[data-clip-key]'))) {
    if (bar.dataset.clipKey === clipKey) return bar;
  }
  return null;
}

/** Where a clip bar (or one leg of it) is now, or null when it is no longer on screen. */
export function clipAnchorRect(section: Element | null, clipKey: string, stepKey?: string): AnchorRect | null {
  const bar = clipBar(section, clipKey);
  if (!bar) return null;
  const anchor = (stepKey && bar.querySelector(`[data-step="${stepKey}"]`)) || bar;
  const { left, top, right, bottom, width, height } = anchor.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
}

/** Hands focus back to the bar of a dismissed editor, unless focus has already moved on. */
export function returnFocusToClip(section: Element | null, clipKey: string): void {
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest('.dialkit-timeline-popover')) return;
  clipBar(section, clipKey)?.focus({ preventScroll: true });
}
