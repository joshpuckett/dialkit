import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MotionConfig } from 'motion/react';
import { DialStore, PanelConfig } from '../store/DialStore';
import { TimelineStore } from '../store/TimelineStore';
import { isDevDefault } from '../env';
import { Folder } from './Folder';
import { Panel } from './Panel';
import { ShortcutListener } from './ShortcutListener';
import { TimelineToggleButton } from './Timeline/TimelineToggleButton';
import { blockPanelDragClick, capturePanelPointer, releasePanelPointer, getPanelCorner, getPanelDragHandle, getPanelDragOffset, getPanelDragStart, getPanelKeyboardOffset, getPanelOriginX, getPanelOriginY, hasPanelDragMoved } from '../panel-drag';
import { observePanelKeyboard } from '../panel-keyboard';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  theme?: DialTheme;
  productionEnabled?: boolean;
  /** Shortcut that opens the panel and moves focus into it, such as `"mod+period"`. Off by default. */
  hotkey?: string;
  onOpenChange?: (open: boolean) => void;
}

export function DialRoot({ position = 'top-right', defaultOpen = true, mode = 'popover', theme = 'system', productionEnabled = isDevDefault, hotkey, onOpenChange }: DialRootProps) {
  if (!productionEnabled) return null;
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [timelineCount, setTimelineCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inline = mode === 'inline';
  const [shellOpen, setShellOpen] = useState(inline || defaultOpen);

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
  const keyboardRef = useRef<ReturnType<typeof observePanelKeyboard> | null>(null);
  const hasSurfaces = panels.length > 0 || timelineCount > 0;

  // Subscribe to registered editing surfaces. Timeline-backed panels render
  // in DialTimeline, but their presence adds a visibility toggle here.
  useEffect(() => {
    setMounted(true);
    setPanels(DialStore.getPanels('panel'));
    setTimelineCount(TimelineStore.getTimelines().length);

    const unsubscribePanels = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels('panel'));
    });
    const unsubscribeTimelines = TimelineStore.subscribeGlobal(() => {
      setTimelineCount(TimelineStore.getTimelines().length);
    });

    return () => {
      unsubscribePanels();
      unsubscribeTimelines();
    };
  }, []);

  useEffect(() => {
    const fallbackOpen = inline || defaultOpen;
    const nextStates = new Map<string, boolean>();
    for (const panel of panels) {
      nextStates.set(panel.id, panelOpenStatesRef.current.get(panel.id) ?? DialStore.getPanelOpen(panel.id) ?? fallbackOpen);
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
          setActivePosition(getPanelCorner(position, currentDragOffset));
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

  const movePanel = useCallback((dx: number, dy: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) setDragOffset(getPanelKeyboardOffset(rect, dx, dy, window.innerWidth, window.innerHeight));
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const keyboard = observePanelKeyboard(panel, { hotkey, inline, move: movePanel });
    keyboardRef.current = keyboard;
    return () => {
      keyboard.destroy();
      keyboardRef.current = null;
    };
  }, [mounted, hasSurfaces, inline, movePanel]);

  // Also runs when the panels change, since that can rebuild the root header.
  useEffect(() => {
    keyboardRef.current?.update({ hotkey, inline, move: movePanel });
  }, [hotkey, inline, movePanel, panels]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const panel = panelRef.current;
    const handle = getPanelDragHandle(e.target, panel);
    if (!panel || !handle) return;

    dragTargetRef.current = handle;
    dragStartRef.current = getPanelDragStart(e.clientX, e.clientY, panel);
    didDragRef.current = false;
    draggingRef.current = true;
    capturePanelPointer(handle, e.pointerId);
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
      releasePanelPointer(dragTarget, e.pointerId);
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

  const handleRootOpenChange = useCallback((open: boolean) => {
    setShellOpen(open);
    if (rootOpenRef.current === open) return;
    rootOpenRef.current = open;
    onOpenChange?.(open);
  }, [onOpenChange]);

  useEffect(() => DialStore.subscribePanelOpen((id, open) => {
    if (!panels.some(panel => panel.id === id)) return;
    if (panels.length > 1 && open) handleRootOpenChange(true);
    else if (panels.length === 1) handlePanelOpenChange(id, open);
  }), [panels, handleRootOpenChange, handlePanelOpenChange]);

  // Don't render on server
  if (!mounted || typeof window === 'undefined') {
    return null;
  }

  // Don't render if no editing surfaces are registered.
  if (!hasSurfaces) {
    return null;
  }

  const dragStyle = dragOffset ? {
    top: dragOffset.y,
    left: dragOffset.x,
    right: 'auto' as const,
    bottom: 'auto' as const,
  } : undefined;
  const originX = getPanelOriginX(activePosition, dragOffset);
  const originY = getPanelOriginY(activePosition, dragOffset);
  const hasMultiplePanels = panels.length > 1;
  const timelineToggle = timelineCount > 0 ? <TimelineToggleButton /> : null;

  const content = (
  <MotionConfig reducedMotion="user">
  <ShortcutListener>
    <div className="dialkit-root" data-mode={mode} data-theme={theme}>
      <div
        ref={panelRef}
        className="dialkit-panel"
        data-position={inline ? undefined : (dragOffset ? undefined : activePosition)}
        data-origin-x={inline ? undefined : originX}
        data-origin-y={inline ? undefined : originY}
        data-mode={mode}
        data-multiple={hasMultiplePanels ? 'true' : undefined}
        style={dragStyle}
        onPointerDown={!inline ? handlePointerDown : undefined}
        onPointerMove={!inline ? handlePointerMove : undefined}
        onPointerUp={!inline ? handlePointerUp : undefined}
        onPointerCancel={!inline ? handlePointerUp : undefined}
      >
        {panels.length === 0 ? (
          <div className="dialkit-panel-wrapper">
            <Folder
              title="DialKit"
              open={shellOpen}
              defaultOpen={inline || defaultOpen}
              isRoot={true}
              inline={inline}
              onOpenChange={handleRootOpenChange}
              toolbar={timelineToggle}
            >
              <div className="dialkit-timeline-toolkit-only">Timeline</div>
            </Folder>
          </div>
        ) : hasMultiplePanels ? (
          <div className="dialkit-panel-wrapper">
            <Folder
              title="DialKit"
              open={shellOpen}
              defaultOpen={inline || defaultOpen}
              isRoot={true}
              inline={inline}
              onOpenChange={handleRootOpenChange}
              toolbar={timelineToggle}
            >
              {panels.map((panel) => (
                <Panel
                  key={panel.id}
                  panel={panel}
                  defaultOpen={true}
                  variant="section"
                />
              ))}
            </Folder>
          </div>
        ) : (
          panels.map((panel) => (
            <Panel
              key={panel.id}
              panel={panel}
              defaultOpen={inline || defaultOpen}
              inline={inline}
              toolbarExtra={timelineToggle}
              onOpenChange={(open) => handlePanelOpenChange(panel.id, open)}
            />
          ))
        )}
      </div>
    </div>
  </ShortcutListener>
  </MotionConfig>
  );

  if (inline) {
    return content;
  }

  return createPortal(content, document.body);
}
