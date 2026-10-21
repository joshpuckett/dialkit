import { createContext, useEffect, useState } from 'react';
import { mountShortcutListener, subscribeShortcut } from '../shortcut-listener';

export const ShortcutContext = createContext<{
  activePanelId: string | null;
  activePath: string | null;
}>({ activePanelId: null, activePath: null });

export function ShortcutListener({ children }: { children: React.ReactNode }) {
  const [activeShortcut, setActiveShortcut] = useState<{
    activePanelId: string | null;
    activePath: string | null;
  }>({ activePanelId: null, activePath: null });

  // Every root shares one window listener, so two roots never apply a shortcut twice.
  useEffect(() => {
    const listener = mountShortcutListener();
    const unsubscribe = subscribeShortcut((target) => {
      setActiveShortcut({ activePanelId: target?.panelId ?? null, activePath: target?.path ?? null });
    });
    return () => {
      unsubscribe();
      listener.destroy();
    };
  }, []);

  return (
    <ShortcutContext.Provider value={activeShortcut}>
      {children}
    </ShortcutContext.Provider>
  );
}
