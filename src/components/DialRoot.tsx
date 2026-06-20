import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DialStore, PanelConfig } from '../store/DialStore';
import { Panel } from './Panel';
import { ShortcutListener } from './ShortcutListener';
import { blockPanelDragClick, getPanelDragHandle, getPanelDragOffset, getPanelDragStart, getPanelOriginX, hasPanelDragMoved } from '../panel-drag';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';

declare const process: { env?: { NODE_ENV?: string } } | undefined;

const isDevDefault = typeof process !== 'undefined' && process?.env?.NODE_ENV
  ? process.env.NODE_ENV !== 'production'
  : typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE
    ? (import.meta as any).env.MODE !== 'production'
    : true;

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  theme?: DialTheme;
  productionEnabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DialRoot({ position = 'top-right', defaultOpen = true, mode = 'popover', theme = 'system', productionEnabled = isDevDefault, onOpenChange }: DialRootProps) {
  if (!productionEnabled) return null;
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [mounted, setMounted] = useState(false);
  const inline = mode === 'inline';

  // Drag state
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [activePosition, setActivePosition] = useState(position);
  const lastDragOffset = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; elX: number; elY: number } | null>(null);
  const didDragRef = useRef(false);
  const dragTargetRef = useRef<HTMLElement | null>(null);
  const panelOpenStatesRef = useRef<Map<string, boolean>>(new Map());
  const rootOpenRef = useRef<boolean | null>(null);

  // Subscribe to global panel changes
  useEffect(() => {
    setMounted(true);
    setPanels(DialStore.getPanels());

    const unsubscribe = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const fallbackOpen = inline || defaultOpen;
    const nextStates = new Map<string, boolean>();
    for (const panel of panels) {
      nextStates.set(panel.id, panelOpenStatesRef.current.get(panel.id) ?? fallbackOpen);
    }
    panelOpenStatesRef.current = nextStates;
    rootOpenRef.current = Array.from(nextStates.values()).some(Boolean);
  }, [defaultOpen, inline, panels]);

  // Watch for panel open/close — snap to corner on open, restore drag position on close
  useEffect(() => {
    if (!panelRef.current || inline) return;
    const observer = new MutationObserver(() => {
      const inners = panelRef.current?.querySelectorAll('.dialkit-panel-inner');
      if (!inners || inners.length === 0) return;
      const collapsed = Array.from(inners).every(
        (el) => el.getAttribute('data-collapsed') === 'true'
      );
      const currentDragOffset = dragOffset;

      if (!collapsed) {
        // Opening — save drag position, determine corner, snap
        if (currentDragOffset) {
          lastDragOffset.current = currentDragOffset;
          const bubbleCenterX = currentDragOffset.x + 21;
          const midX = window.innerWidth / 2;
          setActivePosition(bubbleCenterX < midX ? 'top-left' : 'top-right');
        } else {
          setActivePosition(position);
        }
        setDragOffset(null);
      } else if (currentDragOffset) {
        lastDragOffset.current = currentDragOffset;
      } else if (lastDragOffset.current) {
        // Closing — restore the dragged position
        setDragOffset(lastDragOffset.current);
      }
    });
    observer.observe(panelRef.current, { subtree: true, attributes: true, attributeFilter: ['data-collapsed'] });
    return () => observer.disconnect();
  }, [inline, dragOffset, position]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const panel = panelRef.current;
    const handle = getPanelDragHandle(e.target, panel);
    if (!panel || !handle) return;

    dragTargetRef.current = handle;
    dragStartRef.current = getPanelDragStart(e.clientX, e.clientY, panel);
    didDragRef.current = false;
    draggingRef.current = true;
    handle.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !dragStartRef.current) return;

    if (!didDragRef.current && !hasPanelDragMoved(dragStartRef.current, e.clientX, e.clientY)) return;
    didDragRef.current = true;

    setDragOffset(getPanelDragOffset(dragStartRef.current, e.clientX, e.clientY));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    dragStartRef.current = null;
    const dragTarget = dragTargetRef.current;

    if (dragTarget?.hasPointerCapture(e.pointerId)) {
      dragTarget.releasePointerCapture(e.pointerId);
    }

    // If we actually dragged, prevent the click from opening the panel
    if (didDragRef.current) {
      e.stopPropagation();
      if (dragTarget) {
        blockPanelDragClick(dragTarget);
      }
    }
    dragTargetRef.current = null;
  }, []);

  const handlePanelOpenChange = useCallback((panelId: string, open: boolean) => {
    panelOpenStatesRef.current.set(panelId, open);
    const fallbackOpen = inline || defaultOpen;
    const nextRootOpen = panels.some((panel) => (
      panelOpenStatesRef.current.get(panel.id) ?? fallbackOpen
    ));

    if (rootOpenRef.current === nextRootOpen) return;
    rootOpenRef.current = nextRootOpen;
    onOpenChange?.(nextRootOpen);
  }, [defaultOpen, inline, onOpenChange, panels]);

  // Don't render on server
  if (!mounted || typeof window === 'undefined') {
    return null;
  }

  // Don't render if no panels registered
  if (panels.length === 0) {
    return null;
  }

  const dragStyle = dragOffset ? {
    top: dragOffset.y,
    left: dragOffset.x,
    right: 'auto' as const,
    bottom: 'auto' as const,
  } : undefined;
  const originX = getPanelOriginX(activePosition, dragOffset);

  const content = (
  <ShortcutListener>
    <div className="dialkit-root" data-mode={mode} data-theme={theme}>
      <div
        ref={panelRef}
        className="dialkit-panel"
        data-position={inline ? undefined : (dragOffset ? undefined : activePosition)}
        data-origin-x={inline ? undefined : originX}
        data-mode={mode}
        style={dragStyle}
        onPointerDown={!inline ? handlePointerDown : undefined}
        onPointerMove={!inline ? handlePointerMove : undefined}
        onPointerUp={!inline ? handlePointerUp : undefined}
        onPointerCancel={!inline ? handlePointerUp : undefined}
      >
        {panels.map((panel) => (
          <Panel
            key={panel.id}
            panel={panel}
            defaultOpen={inline || defaultOpen}
            inline={inline}
            onOpenChange={(open) => handlePanelOpenChange(panel.id, open)}
          />
        ))}
      </div>
    </div>
  </ShortcutListener>
  );

  if (inline) {
    return content;
  }

  return createPortal(content, document.body);
}
