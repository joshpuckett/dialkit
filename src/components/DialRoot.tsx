import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DialStore, PanelConfig } from '../store/DialStore';
import { Panel } from './Panel';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  theme?: DialTheme;
}

function useResolvedTheme(theme?: DialTheme): 'light' | 'dark' | undefined {
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  if (!theme) return undefined;
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

export function DialRoot({ position = 'top-right', defaultOpen = true, mode = 'popover', theme }: DialRootProps) {
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [mounted, setMounted] = useState(false);
  const inline = mode === 'inline';
  const resolvedTheme = useResolvedTheme(theme);

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
    <div className="dialkit-root" data-mode={mode} data-theme={resolvedTheme}>
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
