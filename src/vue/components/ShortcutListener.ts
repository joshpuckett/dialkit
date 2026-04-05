import { defineComponent, h, inject, onMounted, onUnmounted, provide, ref, type InjectionKey, type Ref } from 'vue';
import { DialStore, ControlMeta, ShortcutConfig } from '../../store/DialStore';
import { getEffectiveStep, applySliderDelta, findControl, isInputFocused, getActiveModifier, DRAG_SENSITIVITY } from '../../shortcut-utils';

export interface ShortcutState {
  activePanelId: Ref<string | null>;
  activePath: Ref<string | null>;
}

export const ShortcutKey: InjectionKey<ShortcutState> = Symbol('DialKitShortcut');

export function useShortcutContext(): ShortcutState {
  return inject(ShortcutKey, {
    activePanelId: ref(null),
    activePath: ref(null),
  });
}

export const ShortcutListener = defineComponent({
  name: 'DialKitShortcutListener',
  setup(_, { slots }) {
    const activePanelId = ref<string | null>(null);
    const activePath = ref<string | null>(null);

    const activeKeys = new Set<string>();
    let isDragging = false;
    let lastMouseX: number | null = null;
    let dragAccumulator = 0;

    provide(ShortcutKey, { activePanelId, activePath });

    const resolveActiveTarget = (interaction: string) => {
      for (const key of activeKeys) {
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
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      const key = e.key.toLowerCase();

      // Arrow keys adjust the active shortcut's slider
      if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
        if (activeKeys.size > 0) {
          const target = resolveActiveTarget('scroll') || resolveActiveTarget('drag') || resolveActiveTarget('move');
          if (target && target.control.type === 'slider') {
            e.preventDefault();
            const direction = (key === 'arrowright' || key === 'arrowup') ? 1 : -1;
            const effectiveStep = getEffectiveStep(target.control, target.shortcut);
            applySliderDelta(target.panelId, target.path, target.control, effectiveStep, direction);
            return;
          }
        }
      }

      const wasAlreadyHeld = activeKeys.has(key);
      activeKeys.add(key);

      const modifier = getActiveModifier(e);
      const target = DialStore.resolveShortcutTarget(key, modifier);
      if (target) {
        activePanelId.value = target.panelId;
        activePath.value = target.path;

        // Toggle: flip on first keydown only (not on key repeat)
        if (!wasAlreadyHeld && target.control.type === 'toggle') {
          const currentValue = DialStore.getValue(target.panelId, target.path) as boolean;
          DialStore.updateValue(target.panelId, target.path, !currentValue);
        }
      }

      // Reset mouse tracking when a new key is pressed (for move/drag)
      if (!wasAlreadyHeld) {
        lastMouseX = null;
        dragAccumulator = 0;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      activeKeys.delete(key);

      // Reset drag state when key is released
      isDragging = false;
      lastMouseX = null;
      dragAccumulator = 0;

      if (activeKeys.size === 0) {
        activePanelId.value = null;
        activePath.value = null;
      } else {
        let found = false;
        for (const remainingKey of activeKeys) {
          const modifier = getActiveModifier(e);
          const target = DialStore.resolveShortcutTarget(remainingKey, modifier);
          if (target) {
            activePanelId.value = target.panelId;
            activePath.value = target.path;
            found = true;
            break;
          }
        }
        if (!found) {
          activePanelId.value = null;
          activePath.value = null;
        }
      }
    };

    // Scroll: key+scroll and scroll-only
    const handleWheel = (e: WheelEvent) => {
      if (isInputFocused()) return;

      const modifier = getActiveModifier(e);

      // Key+scroll shortcuts
      if (activeKeys.size > 0) {
        for (const key of activeKeys) {
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

    // Drag: key+mousedown starts, mousemove adjusts, mouseup stops
    const handleMouseDown = (e: MouseEvent) => {
      if (isInputFocused()) return;
      if (activeKeys.size === 0) return;

      const target = resolveActiveTarget('drag');
      if (target) {
        isDragging = true;
        lastMouseX = e.clientX;
        dragAccumulator = 0;
        e.preventDefault();
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      lastMouseX = null;
      dragAccumulator = 0;
    };

    // Move + Drag: mousemove handles both
    const handleMouseMove = (e: MouseEvent) => {
      if (isInputFocused()) return;
      if (activeKeys.size === 0) return;

      // Drag interaction (requires mousedown)
      if (isDragging) {
        const target = resolveActiveTarget('drag');
        if (target && lastMouseX !== null) {
          const deltaX = e.clientX - lastMouseX;
          lastMouseX = e.clientX;
          dragAccumulator += deltaX;

          const effectiveStep = getEffectiveStep(target.control, target.shortcut);
          const steps = Math.trunc(dragAccumulator / DRAG_SENSITIVITY);
          if (steps !== 0) {
            dragAccumulator -= steps * DRAG_SENSITIVITY;
            applySliderDelta(target.panelId, target.path, target.control, effectiveStep, steps);
          }
        }
        return;
      }

      // Move interaction (no click needed, just key held + mouse movement)
      const moveTarget = resolveActiveTarget('move');
      if (moveTarget) {
        if (lastMouseX === null) {
          lastMouseX = e.clientX;
          return;
        }

        const deltaX = e.clientX - lastMouseX;
        lastMouseX = e.clientX;
        dragAccumulator += deltaX;

        const effectiveStep = getEffectiveStep(moveTarget.control, moveTarget.shortcut);
        const steps = Math.trunc(dragAccumulator / DRAG_SENSITIVITY);
        if (steps !== 0) {
          dragAccumulator -= steps * DRAG_SENSITIVITY;
          applySliderDelta(moveTarget.panelId, moveTarget.path, moveTarget.control, effectiveStep, steps);
        }
      }
    };

    const handleWindowBlur = () => {
      activeKeys.clear();
      isDragging = false;
      lastMouseX = null;
      dragAccumulator = 0;
      activePanelId.value = null;
      activePath.value = null;
    };

    onMounted(() => {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('blur', handleWindowBlur);
    });

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('blur', handleWindowBlur);
    });

    return () => slots.default?.();
  },
});
