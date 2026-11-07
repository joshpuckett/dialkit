<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { ControlMeta, DialValue } from 'dialkit/store';
  import {
    TIMELINE_MIN_CLIP_DURATION,
    clamp,
    formatStepLabel,
    timelinePopoverDisplayValues,
  } from 'dialkit/timeline';
  import type { TimelineClipMeta } from 'dialkit/timeline';
  import { isFloatingControlTarget, type AnchorRect } from '../../../dropdown-position';
  import { findControl } from '../../../shortcut-utils';
  import Portal from '../../Portal.svelte';
  import ControlRenderer from '../ControlRenderer.svelte';
  import type { DialTheme } from '../DialRoot.svelte';

  const POPOVER_WIDTH = 280;

  export type PopoverState = {
    clip: TimelineClipMeta;
    stepKey?: string;
    anchor: AnchorRect;
  };

  let { panelId, popover, values, theme, onClose, onDismiss } = $props<{
    panelId: string;
    popover: PopoverState;
    values: Record<string, DialValue>;
    theme: DialTheme;
    onClose: () => void;
    onDismiss: () => void;
  }>();

  let element = $state<HTMLDivElement>();
  let closeButton = $state<HTMLButtonElement>();
  let naturalHeight = $state(0);
  const measured = $derived(naturalHeight > 0);
  let viewport = $state(readViewport());

  // The anchor moves on every scroll; these only change with the target.
  const clip = $derived(popover.clip);
  const stepKey = $derived(popover.stepKey);

  const presentation = $derived.by(() => {
    let controls: ControlMeta[];
    let title: string;
    if (stepKey) {
      controls = getClipControls(panelId, `${clip.key}.${stepKey}`);
      if (stepKey === clip.stepKeys?.[0]) {
        const from = getControlAt(panelId, `${clip.key}.from`);
        if (from) {
          const index = controls.findIndex((control) => control.path === `${clip.key}.${stepKey}.to`);
          controls = index >= 0
            ? [...controls.slice(0, index), from, ...controls.slice(index)]
            : [...controls, from];
        }
      }
      title = `${clip.label} · ${formatStepLabel(stepKey)}`;
    } else {
      controls = getClipControls(panelId, clip.key, clipPopoverExclusions(clip));
      title = clip.label;
    }
    const target = stepKey ? `${clip.key}.${stepKey}` : clip.key;
    const durationMeta = getControlAt(panelId, `${target}.duration`);
    const durationValue = durationMeta ? values[durationMeta.path] : undefined;
    const transitionDuration = durationMeta?.type === 'slider' && typeof durationValue === 'number'
      ? {
          value: durationValue,
          onChange: (next: number) => DialStore.updateValue(panelId, durationMeta.path, next),
          min: Math.max(TIMELINE_MIN_CLIP_DURATION, durationMeta.min ?? 0),
          max: durationMeta.max,
          step: durationMeta.step,
        }
      : undefined;
    return {
      controls,
      title,
      transitionDuration,
      displayValues: timelinePopoverDisplayValues(values, clip.key, clip.stepKeys, stepKey),
    };
  });

  const position = $derived.by(() => {
    const right = viewport.offsetLeft + viewport.width;
    const bottom = viewport.offsetTop + viewport.height;
    const width = Math.min(POPOVER_WIDTH, Math.max(220, viewport.width - 24));
    const left = clamp(
      popover.anchor.left + popover.anchor.width / 2 - width / 2,
      viewport.offsetLeft + 12,
      Math.max(viewport.offsetLeft + 12, right - width - 12)
    );
    const above = Math.max(0, popover.anchor.top - viewport.offsetTop - 22);
    const below = Math.max(0, bottom - popover.anchor.bottom - 22);
    const placeAbove = naturalHeight === 0
      ? above >= below
      : naturalHeight <= above || (naturalHeight > below && above >= below);
    const availableHeight = placeAbove ? above : below;
    const renderedHeight = Math.min(naturalHeight || availableHeight, availableHeight);
    const rawTop = placeAbove ? popover.anchor.top - 10 - renderedHeight : popover.anchor.bottom + 10;
    return {
      left,
      top: clamp(rawTop, viewport.offsetTop + 12, Math.max(viewport.offsetTop + 12, bottom - renderedHeight - 12)),
      width,
      availableHeight,
      placeAbove,
    };
  });

  // Focus moves in once it has a height: until then it's hidden, and can't take focus.
  $effect(() => {
    clip.key;
    stepKey;
    if (measured) closeButton?.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!element) return;
    clip.key;
    stepKey;
    const measure = () => {
      if (element) naturalHeight = element.scrollHeight + 2;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element.querySelector('.dialkit-timeline-popover-body') ?? element);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    const updateViewport = () => { viewport = readViewport(); };
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (element?.contains(target) || isFloatingControlTarget(target)) return;
      // Let clip clicks handle their own toggle/switch
      if (target.closest?.('.dialkit-timeline-clip') || target.closest?.('.dialkit-timeline-label')) return;
      onClose();
    };
    // Svelte delegates its own keydown handlers to the document, so stopping one
    // can't stop a listener there. The window hears the key after them.
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onDismiss();
    };
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', keydown);
    };
  });

  function readViewport() {
    if (typeof window === 'undefined') return { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0 };
    return {
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
      offsetLeft: window.visualViewport?.offsetLeft ?? 0,
      offsetTop: window.visualViewport?.offsetTop ?? 0,
    };
  }

  function clipPopoverExclusions(target: TimelineClipMeta) {
    return new Set([...(target.stepKeys ?? []), ...(target.tracks?.map((track) => track.prop) ?? [])]);
  }

  function getClipControls(panel: string, path: string, exclusions?: Set<string>): ControlMeta[] {
    const currentPanel = DialStore.getPanel(panel);
    const folder = currentPanel ? findControl(currentPanel.controls, path) : null;
    if (!folder?.children) return [];
    return folder.children.filter((control) => {
      const key = control.path.slice(path.length + 1);
      return key !== 'at' && key !== 'duration' && !exclusions?.has(key);
    });
  }

  function getControlAt(panel: string, path: string): ControlMeta | null {
    const currentPanel = DialStore.getPanel(panel);
    return currentPanel ? findControl(currentPanel.controls, path) : null;
  }
</script>

{#if presentation.controls.length > 0}
  <Portal target="body">
    <div class="dialkit-root" data-theme={theme}>
      <div
        bind:this={element}
        class="dialkit-timeline-popover"
        data-placement={position.placeAbove ? 'above' : 'below'}
        style:left={`${position.left}px`}
        style:top={`${position.top}px`}
        style:width={`${position.width}px`}
        style:max-height={`${position.availableHeight}px`}
        style:visibility={naturalHeight > 0 ? 'visible' : 'hidden'}
        role="dialog"
        aria-label={`Edit ${presentation.title}`}
      >
        <div class="dialkit-timeline-popover-header">
          <span class="dialkit-timeline-popover-title">{presentation.title}</span>
          <button bind:this={closeButton} class="dialkit-timeline-popover-close" onclick={onDismiss} title="Close editor" aria-label="Close editor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div class="dialkit-timeline-popover-body">
          {#each presentation.controls as control (control.path)}
            <ControlRenderer
              {panelId}
              {control}
              values={presentation.displayValues}
              transitionDuration={presentation.transitionDuration}
            />
          {/each}
        </div>
      </div>
    </div>
  </Portal>
{/if}
