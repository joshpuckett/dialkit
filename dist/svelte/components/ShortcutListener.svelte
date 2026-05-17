<script lang="ts" module>
  export const SHORTCUT_CTX = Symbol('dialkit-shortcut');

  export interface ShortcutContextValue {
    activePanelId: string | null;
    activePath: string | null;
  }
</script>

<script lang="ts">
  import { setContext } from 'svelte';
  import { DialStore } from 'dialkit/store';
  import type { Snippet } from 'svelte';
  import {
    getEffectiveStep,
    applySliderDelta,
    findControl,
    DRAG_SENSITIVITY,
    isInputFocused,
    getActiveModifier,
  } from '../../shortcut-utils';

  let { children } = $props<{ children?: Snippet }>();

  let activePanelId = $state<string | null>(null);
  let activePath = $state<string | null>(null);

  const ctx: ShortcutContextValue = {
    get activePanelId() { return activePanelId; },
    get activePath() { return activePath; },
  };

  setContext(SHORTCUT_CTX, ctx);

  // --- mutable refs ---

  let activeKeys = new Set<string>();
  let isDragging = false;
  let lastMouseX: number | null = null;
  let dragAccumulator = 0;

  function resolveActiveTarget(interaction: string) {
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
  }

  // --- event handlers ---

  function handleKeyDown(e: KeyboardEvent) {
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
      activePanelId = target.panelId;
      activePath = target.path;

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
  }

  function handleKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    activeKeys.delete(key);

    // Reset drag state when key is released
    isDragging = false;
    lastMouseX = null;
    dragAccumulator = 0;

    if (activeKeys.size === 0) {
      activePanelId = null;
      activePath = null;
    } else {
      let found = false;
      for (const remainingKey of activeKeys) {
        const modifier = getActiveModifier(e);
        const target = DialStore.resolveShortcutTarget(remainingKey, modifier);
        if (target) {
          activePanelId = target.panelId;
          activePath = target.path;
          found = true;
          break;
        }
      }
      if (!found) {
        activePanelId = null;
        activePath = null;
      }
    }
  }

  function handleWheel(e: WheelEvent) {
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
  }

  function handleMouseDown(e: MouseEvent) {
    if (isInputFocused()) return;
    if (activeKeys.size === 0) return;

    const target = resolveActiveTarget('drag');
    if (target) {
      isDragging = true;
      lastMouseX = e.clientX;
      dragAccumulator = 0;
      e.preventDefault();
    }
  }

  function handleMouseUp() {
    isDragging = false;
    lastMouseX = null;
    dragAccumulator = 0;
  }

  function handleMouseMove(e: MouseEvent) {
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
  }

  function handleWindowBlur() {
    activeKeys.clear();
    isDragging = false;
    lastMouseX = null;
    dragAccumulator = 0;
    activePanelId = null;
    activePath = null;
  }

  $effect(() => {
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
  });
</script>

{#if children}{@render children()}{/if}
