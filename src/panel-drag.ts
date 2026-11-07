export type PanelDragOffset = {
  x: number;
  y: number;
};

export type PanelDragStart = {
  pointerX: number;
  pointerY: number;
  elX: number;
  elY: number;
  width?: number;
};

export type PanelDragOriginX = 'left' | 'right';
export type PanelDragOriginY = 'top' | 'bottom';
export type PanelCorner = `${PanelDragOriginY}-${PanelDragOriginX}`;

const PANEL_DRAG_THRESHOLD = 8;
const PANEL_VIEWPORT_MARGIN = 8;
export const COLLAPSED_PANEL_SIZE = 42;
export const PANEL_WIDTH = 280;

const DRAG_EXCLUSION_SELECTOR = [
  '.dialkit-panel-icon',
  '.dialkit-panel-toolbar',
  'button',
  'input',
  'select',
  'textarea',
  'a',
  '[role="button"]',
  '[contenteditable="true"]',
].join(',');

export function getPanelDragHandle(target: EventTarget | null, panel: HTMLElement | null): HTMLElement | null {
  if (!(target instanceof Element) || !panel) return null;

  const inner = target.closest<HTMLElement>('.dialkit-panel-inner');
  if (!inner || !panel.contains(inner)) return null;

  if (inner.getAttribute('data-collapsed') === 'true') {
    return inner;
  }

  const header = target.closest<HTMLElement>('.dialkit-panel-header');
  if (!header || !inner.contains(header)) return null;

  if (target.closest(DRAG_EXCLUSION_SELECTOR)) return null;

  return header;
}

export function getPanelDragStart(pointerX: number, pointerY: number, panel: HTMLElement): PanelDragStart {
  const rect = panel.getBoundingClientRect();
  return {
    pointerX,
    pointerY,
    elX: rect.left,
    elY: rect.top,
    width: rect.width,
  };
}

export function getPanelDragOffset(start: PanelDragStart, pointerX: number, pointerY: number): PanelDragOffset {
  return clampPanelOffset({
    x: start.elX + pointerX - start.pointerX,
    y: start.elY + pointerY - start.pointerY,
  }, start.width);
}

/** A dragged panel keeps enough on screen to grab again, including after a resize. */
export function clampPanelOffset(
  offset: PanelDragOffset,
  width = COLLAPSED_PANEL_SIZE,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : undefined,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : undefined
): PanelDragOffset {
  if (!viewportWidth || !viewportHeight) return offset;
  const minX = PANEL_VIEWPORT_MARGIN - Math.max(0, width - COLLAPSED_PANEL_SIZE);
  const maxX = viewportWidth - COLLAPSED_PANEL_SIZE - PANEL_VIEWPORT_MARGIN;
  const maxY = viewportHeight - COLLAPSED_PANEL_SIZE - PANEL_VIEWPORT_MARGIN;
  return {
    x: Math.max(minX, Math.min(maxX, offset.x)),
    y: Math.max(PANEL_VIEWPORT_MARGIN, Math.min(maxY, offset.y)),
  };
}

export function hasPanelDragMoved(start: PanelDragStart, pointerX: number, pointerY: number): boolean {
  const dx = pointerX - start.pointerX;
  const dy = pointerY - start.pointerY;
  return Math.hypot(dx, dy) >= PANEL_DRAG_THRESHOLD;
}

export function getPanelOriginX(
  position: string,
  offset: PanelDragOffset | null,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : undefined
): PanelDragOriginX {
  if (offset && viewportWidth) {
    return offset.x + COLLAPSED_PANEL_SIZE / 2 < viewportWidth / 2 ? 'left' : 'right';
  }

  return position.endsWith('left') ? 'left' : 'right';
}

export function getPanelOriginY(
  position: string,
  offset: PanelDragOffset | null,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : undefined
): PanelDragOriginY {
  if (offset && viewportHeight) {
    return offset.y + COLLAPSED_PANEL_SIZE / 2 < viewportHeight / 2 ? 'top' : 'bottom';
  }

  return position.startsWith('bottom') ? 'bottom' : 'top';
}

/** Use the bubble's center for both the snap destination and animation origin. */
export function getPanelCorner(
  position: string,
  offset: PanelDragOffset | null,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : undefined,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : undefined
): PanelCorner {
  return `${getPanelOriginY(position, offset, viewportHeight)}-${getPanelOriginX(position, offset, viewportWidth)}`;
}

export function blockPanelDragClick(handle: HTMLElement) {
  const blocker = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };

  handle.addEventListener('click', blocker, { capture: true, once: true });
  window.setTimeout(() => {
    handle.removeEventListener('click', blocker, true);
  }, 0);
}

/** A pointer can end while a framework is replacing the dragged header. */
export function capturePanelPointer(handle: HTMLElement, pointerId: number): void {
  try { handle.setPointerCapture(pointerId); }
  catch (error) {
    if (!(error instanceof DOMException) || !['NotFoundError', 'InvalidStateError'].includes(error.name)) throw error;
  }
}

export function releasePanelPointer(handle: HTMLElement, pointerId: number): void {
  try { if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId); }
  catch (error) {
    if (!(error instanceof DOMException) || !['NotFoundError', 'InvalidStateError'].includes(error.name)) throw error;
  }
}
