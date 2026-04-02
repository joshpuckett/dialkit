import { createContext, useEffect, useRef, useState, useCallback } from 'react';
import { DialStore, ControlMeta, ShortcutConfig } from '../store/DialStore';

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

function getEffectiveStep(control: ControlMeta, shortcut: ShortcutConfig): number {
  const baseStep = control.step ?? 1;
  const mode = shortcut.mode ?? 'normal';
  return mode === 'fine' ? baseStep / 10
    : mode === 'coarse' ? baseStep * 10
    : baseStep;
}

function applySliderDelta(
  panelId: string,
  path: string,
  control: ControlMeta,
  effectiveStep: number,
  direction: number
): void {
  const currentValue = DialStore.getValue(panelId, path) as number;
  const min = control.min ?? 0;
  const max = control.max ?? 1;
  const newValue = Math.max(min, Math.min(max, currentValue + direction * effectiveStep));
  DialStore.updateValue(panelId, path, roundValue(newValue, effectiveStep));
}

// How many pixels of mouse movement = one step
const DRAG_SENSITIVITY = 4;

export function ShortcutListener({ children }: { children: React.ReactNode }) {
  const [activeShortcut, setActiveShortcut] = useState<{
    activePanelId: string | null;
    activePath: string | null;
  }>({ activePanelId: null, activePath: null });

  const activeKeysRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef<number | null>(null);
  const dragAccumulatorRef = useRef(0);

  const getActiveModifier = useCallback((e: KeyboardEvent | WheelEvent | MouseEvent): 'alt' | 'shift' | 'meta' | undefined => {
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

  // Find the active target for key-based interactions (scroll, drag, move)
  const resolveActiveTarget = useCallback((interaction: string) => {
    for (const key of activeKeysRef.current) {
      // We can't get the modifier from a stored key, so we check all panels
      const panels = DialStore.getPanels();
      for (const panel of panels) {
        for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
          if (!shortcut.key) continue;
          if (shortcut.key.toLowerCase() !== key) continue;
          if ((shortcut.interaction ?? 'scroll') !== interaction) continue;
          const control = DialStore.getPanel(panel.id)?.controls
            ? findControl(panel.controls, path)
            : null;
          if (control && control.type === 'slider') {
            return { panelId: panel.id, path, control, shortcut };
          }
        }
      }
    }
    return null;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      const key = e.key.toLowerCase();
      const wasAlreadyHeld = activeKeysRef.current.has(key);
      activeKeysRef.current.add(key);

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

      // Reset mouse tracking when a new key is pressed (for move/drag)
      if (!wasAlreadyHeld) {
        lastMouseXRef.current = null;
        dragAccumulatorRef.current = 0;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      activeKeysRef.current.delete(key);

      // Reset drag state when key is released
      isDraggingRef.current = false;
      lastMouseXRef.current = null;
      dragAccumulatorRef.current = 0;

      if (activeKeysRef.current.size === 0) {
        setActiveShortcut({ activePanelId: null, activePath: null });
      } else {
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

    // ── Scroll: key+scroll and scroll-only ──
    const handleWheel = (e: WheelEvent) => {
      if (isInputFocused()) return;

      const modifier = getActiveModifier(e);

      // Key+scroll shortcuts
      if (activeKeysRef.current.size > 0) {
        for (const key of activeKeysRef.current) {
          const target = DialStore.resolveShortcutTarget(key, modifier);
          if (!target) continue;

          const { panelId, path, control } = target;
          const interaction = control.shortcut?.interaction ?? 'scroll';
          if (interaction !== 'scroll' || control.type !== 'slider') continue;

          e.preventDefault();
          const effectiveStep = getEffectiveStep(control, control.shortcut!);
          const direction = e.deltaY > 0 ? -1 : 1;
          applySliderDelta(panelId, path, control, effectiveStep, direction);
          return;
        }
      }

      // Scroll-only shortcuts (no key needed)
      const scrollOnlyTargets = DialStore.resolveScrollOnlyTargets();
      for (const { panelId, path, control, shortcut } of scrollOnlyTargets) {
        if (control.type !== 'slider') continue;

        e.preventDefault();
        const effectiveStep = getEffectiveStep(control, shortcut);
        const direction = e.deltaY > 0 ? -1 : 1;
        applySliderDelta(panelId, path, control, effectiveStep, direction);
        return;
      }
    };

    // ── Drag: key+mousedown starts, mousemove adjusts, mouseup stops ──
    const handleMouseDown = (e: MouseEvent) => {
      if (isInputFocused()) return;
      if (activeKeysRef.current.size === 0) return;

      const target = resolveActiveTarget('drag');
      if (target) {
        isDraggingRef.current = true;
        lastMouseXRef.current = e.clientX;
        dragAccumulatorRef.current = 0;
        e.preventDefault();
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      lastMouseXRef.current = null;
      dragAccumulatorRef.current = 0;
    };

    // ── Move + Drag: mousemove handles both ──
    const handleMouseMove = (e: MouseEvent) => {
      if (isInputFocused()) return;
      if (activeKeysRef.current.size === 0) return;

      // Drag interaction (requires mousedown)
      if (isDraggingRef.current) {
        const target = resolveActiveTarget('drag');
        if (target && lastMouseXRef.current !== null) {
          const deltaX = e.clientX - lastMouseXRef.current;
          lastMouseXRef.current = e.clientX;
          dragAccumulatorRef.current += deltaX;

          const effectiveStep = getEffectiveStep(target.control, target.shortcut);
          const steps = Math.trunc(dragAccumulatorRef.current / DRAG_SENSITIVITY);
          if (steps !== 0) {
            dragAccumulatorRef.current -= steps * DRAG_SENSITIVITY;
            applySliderDelta(target.panelId, target.path, target.control, effectiveStep, steps);
          }
        }
        return;
      }

      // Move interaction (no click needed, just key held + mouse movement)
      const moveTarget = resolveActiveTarget('move');
      if (moveTarget) {
        if (lastMouseXRef.current === null) {
          lastMouseXRef.current = e.clientX;
          return;
        }

        const deltaX = e.clientX - lastMouseXRef.current;
        lastMouseXRef.current = e.clientX;
        dragAccumulatorRef.current += deltaX;

        const effectiveStep = getEffectiveStep(moveTarget.control, moveTarget.shortcut);
        const steps = Math.trunc(dragAccumulatorRef.current / DRAG_SENSITIVITY);
        if (steps !== 0) {
          dragAccumulatorRef.current -= steps * DRAG_SENSITIVITY;
          applySliderDelta(moveTarget.panelId, moveTarget.path, moveTarget.control, effectiveStep, steps);
        }
      }
    };

    const handleWindowBlur = () => {
      activeKeysRef.current.clear();
      isDraggingRef.current = false;
      lastMouseXRef.current = null;
      dragAccumulatorRef.current = 0;
      setActiveShortcut({ activePanelId: null, activePath: null });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [getActiveModifier, isInputFocused, resolveActiveTarget]);

  return (
    <ShortcutContext.Provider value={activeShortcut}>
      {children}
    </ShortcutContext.Provider>
  );
}

function findControl(controls: ControlMeta[], path: string): ControlMeta | null {
  for (const control of controls) {
    if (control.path === path) return control;
    if (control.type === 'folder' && control.children) {
      const found = findControl(control.children, path);
      if (found) return found;
    }
  }
  return null;
}
