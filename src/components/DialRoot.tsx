import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DialStore, PanelConfig, loadPosition, savePosition } from '../store/DialStore';
import type { DialPosition } from '../store/DialStore';
import { Panel } from './Panel';

export type { DialPosition };
export type DialMode = 'popover' | 'inline';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  positionPicker?: boolean;
}

export function DialRoot({ position = 'top-right', defaultOpen = true, mode = 'popover', positionPicker = false }: DialRootProps) {
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [mounted, setMounted] = useState(false);
  const inline = mode === 'inline';
  const showPicker = positionPicker && !inline;
  const [currentPosition, setCurrentPosition] = useState<DialPosition>(() => showPicker ? loadPosition(position) : position);

  // Subscribe to global panel changes
  useEffect(() => {
    setMounted(true);
    setPanels(DialStore.getPanels());

    const unsubscribe = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });

    return unsubscribe;
  }, []);

  const handlePositionChange = useCallback((pos: DialPosition) => {
    setCurrentPosition(pos);
    savePosition(pos);
  }, []);

  // Derive transform-origin from position for open/close animation
  const growDirection = currentPosition.startsWith('bottom') ? 'up' : 'down';

  // Don't render on server
  if (!mounted || typeof window === 'undefined') {
    return null;
  }

  // Don't render if no panels registered
  if (panels.length === 0) {
    return null;
  }

  const content = (
    <div className="dialkit-root" data-mode={mode}>
      <div
        className="dialkit-panel"
        data-position={inline ? undefined : currentPosition}
        data-mode={mode}
      >
        {panels.map((panel) => (
          <Panel
            key={panel.id}
            panel={panel}
            defaultOpen={inline || defaultOpen}
            inline={inline}
            growDirection={!inline ? growDirection : undefined}
            currentPosition={showPicker ? currentPosition : undefined}
            onPositionChange={showPicker ? handlePositionChange : undefined}
          />
        ))}
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return createPortal(content, document.body);
}
