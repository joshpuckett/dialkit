import { useEffect, useLayoutEffect, useState, useRef, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { DialStore, PanelConfig } from '../store/DialStore';
import { TimelineStore } from '../store/TimelineStore';
import { TimelineUiStore } from '../store/TimelineUiStore';
import { isDevDefault } from '../env';
import { Folder } from './Folder';
import { Panel } from './Panel';
import type { DialVersions } from '../versions/gallery';
import { ShortcutListener } from './ShortcutListener';
import { TimelineToggleButton } from './Timeline/TimelineToggleButton';
import { blockPanelDragClick, clampPanelOffset, getPanelCorner, getPanelDragHandle, getPanelDragOffset, getPanelDragStart, getPanelOriginX, getPanelOriginY, hasPanelDragMoved } from '../panel-drag';
import { startPointerGesture, type StopGesture } from '../pointer-gesture';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  theme?: DialTheme;
  productionEnabled?: boolean;
  /** How saved versions appear: captured thumbnails (default), or a menu. */
  versions?: DialVersions;
  onOpenChange?: (open: boolean) => void;
}

// The production gate is a hook-free wrapper, so flipping the prop can never
// change hook order in the component that actually uses hooks.
export function DialRoot({ productionEnabled = isDevDefault, ...props }: DialRootProps) {
  if (!productionEnabled) return null;
  return <DialRootContent {...props} />;
}

function DialRootContent({ position = 'top-right', defaultOpen = true, mode = 'popover', theme = 'system', versions = 'thumbnails', onOpenChange }: Omit<DialRootProps, 'productionEnabled'>) {
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [timelineCount, setTimelineCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inline = mode === 'inline';
  const [shellOpen, setShellOpen] = useState(inline || defaultOpen);

  // Drag state
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef(dragOffset);
  dragOffsetRef.current = dragOffset;
  const [activePosition, setActivePosition] = useState(position);
  const lastDragOffset = useRef<{ x: number; y: number } | null>(null);
  const stopDragRef = useRef<StopGesture | null>(null);

  // Subscribe to registered editing surfaces. Timeline-backed panels render
  // in DialTimeline, but their presence adds a visibility toggle here, as long
  // as a dock is mounted for that toggle to show and hide.
  useEffect(() => {
    const syncTimelines = () => setTimelineCount(TimelineUiStore.hasDock() ? TimelineStore.getTimelines().length : 0);
    setMounted(true);
    setPanels(DialStore.getPanels('panel'));
    syncTimelines();

    const unsubscribePanels = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels('panel'));
    });
    const unsubscribeTimelines = TimelineStore.subscribeGlobal(syncTimelines);
    const unsubscribeDock = TimelineUiStore.subscribe(syncTimelines);

    return () => {
      unsubscribePanels();
      unsubscribeTimelines();
      unsubscribeDock();
    };
  }, []);

  // The root's open state has one home per layout: a lone panel is its own root,
  // and everything else lives in the shell.
  const single = panels.length === 1 ? panels[0] : null;
  const singleId = single?.id;
  const subscribeSingle = useCallback(
    (callback: () => void) => (singleId ? DialStore.subscribe(singleId, callback) : () => {}),
    [singleId]
  );
  const getSingleOpen = useCallback(() => (singleId ? DialStore.getPanelOpen(singleId) : undefined), [singleId]);
  const singleOpen = useSyncExternalStore(subscribeSingle, getSingleOpen, getSingleOpen);
  const rootOpen = single ? (singleOpen ?? (inline || defaultOpen)) : shellOpen;
  const visible = mounted && (panels.length > 0 || timelineCount > 0);

  // Panels coming and going move that state between homes, so the root stays as
  // the person left it.
  const layoutRef = useRef<{ count: number; open: boolean } | null>(null);
  const skipReportRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (!visible) return;
    const previous = layoutRef.current;
    layoutRef.current = { count: panels.length, open: rootOpen };
    if (!previous || previous.count === panels.length || previous.open === rootOpen) return;
    if (panels.length !== 1) {
      setShellOpen(previous.open);
    } else if (previous.count > 1) {
      DialStore.setPanelOpen(panels[0].id, previous.open);
    } else if (DialStore.getPanelOpen(panels[0].id) === undefined) {
      DialStore.initPanelOpen(panels[0].id, previous.open);
    } else {
      return;
    }
    layoutRef.current = { count: panels.length, open: previous.open };
    skipReportRef.current = true;
  }, [visible, panels.length, rootOpen]);

  // Report changes to the root, whichever home they happened in.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const reportedOpenRef = useRef<boolean | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!visible) return;
    if (skipReportRef.current) {
      skipReportRef.current = false;
      return;
    }
    if (reportedOpenRef.current !== null && reportedOpenRef.current !== rootOpen) {
      onOpenChangeRef.current?.(rootOpen);
    }
    reportedOpenRef.current = rootOpen;
  });

  // Snap to a corner on open, and restore the dragged position on close.
  const wasOpenRef = useRef(rootOpen);
  useIsomorphicLayoutEffect(() => {
    if (wasOpenRef.current === rootOpen) return;
    wasOpenRef.current = rootOpen;
    if (inline) return;
    const offset = dragOffsetRef.current;
    if (rootOpen) {
      lastDragOffset.current = offset ?? lastDragOffset.current;
      setActivePosition(offset ? getPanelCorner(position, offset) : position);
      setDragOffset(null);
    } else if (offset) {
      lastDragOffset.current = offset;
    } else if (lastDragOffset.current) {
      setDragOffset(lastDragOffset.current);
    }
  }, [rootOpen, inline, position]);

  useEffect(() => {
    if (!dragOffsetRef.current && !lastDragOffset.current) setActivePosition(position);
  }, [position]);

  // Keep a dragged panel on screen when the window shrinks.
  useEffect(() => {
    if (inline) return;
    const onResize = () => {
      setDragOffset((offset) => offset && clampPanelOffset(offset, panelRef.current?.getBoundingClientRect().width));
      if (lastDragOffset.current) lastDragOffset.current = clampPanelOffset(lastDragOffset.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [inline]);

  useEffect(() => () => stopDragRef.current?.(false), []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const panel = panelRef.current;
    const handle = getPanelDragHandle(e.target, panel);
    if (!panel || !handle || stopDragRef.current) return;

    const start = getPanelDragStart(e.clientX, e.clientY, panel);
    const startOffset = dragOffsetRef.current;
    let moved = false;
    stopDragRef.current = startPointerGesture(e.nativeEvent, handle, {
      move(next) {
        if (!moved && !hasPanelDragMoved(start, next.clientX, next.clientY)) return;
        moved = true;
        setDragOffset(getPanelDragOffset(start, next.clientX, next.clientY));
      },
      end(cancelled) {
        stopDragRef.current = null;
        if (!moved) return;
        if (cancelled) setDragOffset(startOffset);
        // A drag must not also count as a click that toggles the panel.
        else blockPanelDragClick(handle);
      },
    });
  }, []);

  // Requests to open a panel also reveal the shell it sits in.
  useEffect(() => DialStore.subscribePanelOpen((id, open) => {
    if (open && panels.length > 1 && panels.some(panel => panel.id === id)) setShellOpen(true);
  }), [panels]);

  // Don't render on server
  if (!mounted || typeof window === 'undefined') {
    return null;
  }

  // Don't render if no editing surfaces are registered.
  if (panels.length === 0 && timelineCount === 0) {
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
      >
        {panels.length === 0 ? (
          <div className="dialkit-panel-wrapper">
            <Folder
              title="DialKit"
              open={shellOpen}
              defaultOpen={inline || defaultOpen}
              isRoot={true}
              inline={inline}
              onOpenChange={setShellOpen}
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
              onOpenChange={setShellOpen}
              toolbar={timelineToggle}
            >
              {panels.map((panel) => (
                <Panel
                  key={panel.id}
                  panel={panel}
                  defaultOpen={true}
                  variant="section"
                  versions={versions}
                  theme={theme}
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
              versions={versions}
              theme={theme}
            />
          ))
        )}
      </div>
    </div>
  </ShortcutListener>
  );

  if (inline) {
    return content;
  }

  return createPortal(content, document.body);
}
