import { createContext, useEffect, useState } from 'react';
import { mountShortcutListener, subscribeShortcut } from '../shortcut-utils';

export const ShortcutContext = createContext<{
  activePanelId: string | null;
  activePath: string | null;
}>({ activePanelId: null, activePath: null });

export function ShortcutListener({ children }: { children: React.ReactNode }) {
  const [activeShortcut, setActiveShortcut] = useState<{
    activePanelId: string | null;
    activePath: string | null;
  }>({ activePanelId: null, activePath: null });

  useEffect(() => {
    const listener = mountShortcutListener();
    const stop = subscribeShortcut((target) => {
      setActiveShortcut({ activePanelId: target?.panelId ?? null, activePath: target?.path ?? null });
    });
    return () => {
      stop();
      listener.destroy();
    };
  }, []);

  return (
    <ShortcutContext.Provider value={activeShortcut}>
      {children}
    </ShortcutContext.Provider>
  );
}
