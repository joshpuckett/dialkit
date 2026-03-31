import { createContext, useEffect, useRef, useState, useCallback } from 'react';
import { DialStore } from '../store/DialStore';

export const ShortcutContext = createContext<{
  activePanelId: string | null;
  activePath: string | null;
}>({ activePanelId: null, activePath: null });

function decimalsForStep(step: number): number {
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

function roundValue(val: number, step: number): number {
  const raw = Math.round(val / step) * step;
  return parseFloat(raw.toFixed(decimalsForStep(step)));
}

export function ShortcutListener({ children }: { children: React.ReactNode }) {
  const [activeShortcut, setActiveShortcut] = useState<{
    activePanelId: string | null;
    activePath: string | null;
  }>({ activePanelId: null, activePath: null });

  const activeKeysRef = useRef<Set<string>>(new Set());

  const getActiveModifier = useCallback((e: KeyboardEvent | WheelEvent): 'alt' | 'shift' | 'meta' | undefined => {
    if (e.altKey) return 'alt';
    if (e.shiftKey) return 'shift';
    if (e.metaKey) return 'meta';
    return undefined;
  }, []);

  const isInputFocused = useCallback((): boolean => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if ((el as HTMLElement).contentEditable === 'true') return true;
    return false;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      const key = e.key.toLowerCase();
      const wasAlreadyHeld = activeKeysRef.current.has(key);
      activeKeysRef.current.add(key);

      // Resolve which shortcut this key maps to
      const modifier = getActiveModifier(e);
      const target = DialStore.resolveShortcutTarget(key, modifier);
      if (target) {
        setActiveShortcut({ activePanelId: target.panelId, activePath: target.path });

        // Toggle: flip on first keydown only (not on key repeat)
        if (!wasAlreadyHeld && target.control.type === 'toggle') {
          const currentValue = DialStore.getValue(target.panelId, target.path) as boolean;
          DialStore.updateValue(target.panelId, target.path, !currentValue);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      activeKeysRef.current.delete(key);

      // Clear active shortcut if no keys are held
      if (activeKeysRef.current.size === 0) {
        setActiveShortcut({ activePanelId: null, activePath: null });
      } else {
        // Re-resolve with remaining keys
        let found = false;
        for (const remainingKey of activeKeysRef.current) {
          const modifier = getActiveModifier(e);
          const target = DialStore.resolveShortcutTarget(remainingKey, modifier);
          if (target) {
            setActiveShortcut({ activePanelId: target.panelId, activePath: target.path });
            found = true;
            break;
          }
        }
        if (!found) {
          setActiveShortcut({ activePanelId: null, activePath: null });
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (isInputFocused()) return;
      if (activeKeysRef.current.size === 0) return;

      const modifier = getActiveModifier(e);

      for (const key of activeKeysRef.current) {
        const target = DialStore.resolveShortcutTarget(key, modifier);
        if (!target) continue;

        const { panelId, path, control } = target;
        if (control.type !== 'slider') continue;

        e.preventDefault();

        const currentValue = DialStore.getValue(panelId, path) as number;
        const baseStep = control.step ?? 1;
        const min = control.min ?? 0;
        const max = control.max ?? 1;
        const mode = control.shortcut?.mode ?? 'normal';

        const effectiveStep = mode === 'fine' ? baseStep / 10
          : mode === 'coarse' ? baseStep * 10
          : baseStep;

        // deltaY > 0 = scroll down = decrement, deltaY < 0 = scroll up = increment
        const direction = e.deltaY > 0 ? -1 : 1;
        const newValue = Math.max(min, Math.min(max, currentValue + direction * effectiveStep));

        DialStore.updateValue(panelId, path, roundValue(newValue, effectiveStep));
        break; // Only handle one shortcut per wheel event
      }
    };

    const handleWindowBlur = () => {
      activeKeysRef.current.clear();
      setActiveShortcut({ activePanelId: null, activePath: null });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [getActiveModifier, isInputFocused]);

  return (
    <ShortcutContext.Provider value={activeShortcut}>
      {children}
    </ShortcutContext.Provider>
  );
}
