import { createContext, useContext, createSignal, onMount, onCleanup, JSX } from 'solid-js';
import { mountShortcutListener, subscribeShortcut } from '../../shortcut-listener';

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

  // Every root shares one window listener, so two roots never apply a shortcut twice.
  onMount(() => {
    const listener = mountShortcutListener();
    const unsubscribe = subscribeShortcut((target) => {
      setActiveShortcut({ activePanelId: target?.panelId ?? null, activePath: target?.path ?? null });
    });
    onCleanup(() => {
      unsubscribe();
      listener.destroy();
    });
  });

  return (
    <ShortcutContext.Provider value={activeShortcut}>
      {props.children}
    </ShortcutContext.Provider>
  );
}
