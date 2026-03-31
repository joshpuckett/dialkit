import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { DialStore, isDevEnvironment, PanelConfig } from '../store/DialStore';
import { Panel } from './Panel';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';

const EMPTY_PANELS: PanelConfig[] = [];

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  /** Controls whether DialKit renders. Defaults to true in development, false in production. */
  enabled?: boolean;
}

export function DialRoot({ position = 'top-right', defaultOpen = true, mode = 'popover', enabled = isDevEnvironment() }: DialRootProps) {
  const inline = mode === 'inline';

  // Sync enabled state to the store
  useEffect(() => {
    DialStore.setEnabled(enabled);
  }, [enabled]);

  // Subscribe to panel changes
  const panels = useSyncExternalStore(
    (callback) => DialStore.subscribeGlobal(callback),
    () => DialStore.getPanels(),
    () => EMPTY_PANELS
  );

  // Don't render when disabled
  if (!enabled) {
    return null;
  }

  // Don't render on server
  if (typeof window === 'undefined') {
    return null;
  }

  // Don't render if no panels registered
  if (panels.length === 0) {
    return null;
  }

  const content = (
    <div className="dialkit-root" data-mode={mode}>
      <div className="dialkit-panel" data-position={inline ? undefined : position} data-mode={mode}>
        {panels.map((panel) => (
          <Panel key={panel.id} panel={panel} defaultOpen={inline || defaultOpen} inline={inline} />
        ))}
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return createPortal(content, document.body);
}
