import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DialStore, PanelConfig } from '../store/DialStore';
import { Panel } from './Panel';
import { ShortcutListener } from './ShortcutListener';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
}

export function DialRoot({ position = 'top-right', defaultOpen = true, mode = 'popover' }: DialRootProps) {
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [mounted, setMounted] = useState(false);
  const inline = mode === 'inline';

  // Subscribe to global panel changes
  useEffect(() => {
    setMounted(true);
    setPanels(DialStore.getPanels());

    const unsubscribe = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });

    return unsubscribe;
  }, []);

  // Don't render on server
  if (!mounted || typeof window === 'undefined') {
    return null;
  }

  // Don't render if no panels registered
  if (panels.length === 0) {
    return null;
  }

  const content = (
    <ShortcutListener>
      <div className="dialkit-root" data-mode={mode}>
        <div className="dialkit-panel" data-position={inline ? undefined : position} data-mode={mode}>
          {panels.map((panel) => (
            <Panel key={panel.id} panel={panel} defaultOpen={inline || defaultOpen} inline={inline} />
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
