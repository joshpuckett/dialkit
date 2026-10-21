export type PanelDragOffset = {
  x: number;
  y: number;
};

export type PanelDragStart = {
  pointerX: number;
  pointerY: number;
  elX: number;
  elY: number;
};

export type PanelDragOriginX = 'left' | 'right';
export type PanelDragOriginY = 'top' | 'bottom';
export type PanelCorner = `${PanelDragOriginY}-${PanelDragOriginX}`;

const PANEL_DRAG_THRESHOLD = 8;
const COLLAPSED_PANEL_SIZE = 42;

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
  };
}

export function getPanelDragOffset(start: PanelDragStart, pointerX: number, pointerY: number): PanelDragOffset {
  return {
    x: start.elX + pointerX - start.pointerX,
    y: start.elY + pointerY - start.pointerY,
  };
}

/** Move the panel by a keyboard step, keeping all of it inside the viewport. */
export function getPanelKeyboardOffset(
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number
): PanelDragOffset {
  return {
    x: Math.min(Math.max(rect.left + dx, 0), Math.max(viewportWidth - rect.width, 0)),
    y: Math.min(Math.max(rect.top + dy, 0), Math.max(viewportHeight - rect.height, 0)),
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
