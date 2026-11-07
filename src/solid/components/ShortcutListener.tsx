import { createContext, useContext, createSignal, onMount, onCleanup, JSX } from 'solid-js';
import { mountShortcutListener, subscribeShortcut } from '../../shortcut-utils';

type ShortcutState = {
  activePanelId: string | null;
  activePath: string | null;
};

const defaultState: ShortcutState = { activePanelId: null, activePath: null };

const ShortcutContext = createContext<() => ShortcutState>(() => defaultState);

export function useShortcutContext() {
  return useContext(ShortcutContext);
}

export function ShortcutListener(props: { children: JSX.Element }) {
  const [activeShortcut, setActiveShortcut] = createSignal<ShortcutState>(defaultState);

  onMount(() => {
    const listener = mountShortcutListener();
    const stop = subscribeShortcut((target) => {
      setActiveShortcut({ activePanelId: target?.panelId ?? null, activePath: target?.path ?? null });
    });
    onCleanup(() => {
      stop();
      listener.destroy();
    });
  });

  return (
    <ShortcutContext.Provider value={activeShortcut}>
      {props.children}
    </ShortcutContext.Provider>
  );
}
