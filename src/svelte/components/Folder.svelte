<script lang="ts">
  import { activateOnKey } from '../../control-keyboard';
  import { COLLAPSED_PANEL_SIZE, PANEL_WIDTH } from '../../panel-drag';

  import { createPanelSectionTransition, measurePanelHeight, observePanelHeader } from '../../panel-size';

  import { Spring } from 'svelte/motion';
  import { untrack } from 'svelte';
  import { folderTransition } from './transitions';

  import type { Snippet } from 'svelte';
  import { ICON_CLOSE, ICON_PANEL, ICON_CHEVRON } from '../../icons';

  let {
    title,
    defaultOpen = true,
    open,
    isRoot = false,
    inline = false,
    onOpenChange,
    toolbar,
    panelHeightOffset = 0,
    children,
  } = $props<{
    title: string;
    defaultOpen?: boolean;
    open?: boolean;
    isRoot?: boolean;
    inline?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    toolbar?: Snippet;
    panelHeightOffset?: number;
    children?: Snippet;
  }>();

  const initiallyOpen = untrack(() => open ?? defaultOpen);
  let localOpen = $state(initiallyOpen);
  const isOpen = $derived(open ?? localOpen);
  const isCollapsed = $derived(!isOpen);
  let contentHeight = $state<number | undefined>(undefined);
  let hasInitializedRootSize = $state(!isRoot || !initiallyOpen);

  let contentRef: HTMLDivElement | undefined;
  let panelRef: HTMLDivElement | undefined;
  let sectionRef = $state<HTMLDivElement>();
  let sectionTransition = $state<ReturnType<typeof createPanelSectionTransition>>();

  $effect(() => {
    if (!sectionRef || !toolbar || isRoot) return;
    const transition = createPanelSectionTransition(sectionRef, untrack(() => isOpen));
    sectionTransition = transition;
    return () => { transition.destroy(); sectionTransition = undefined; };
  });
  $effect(() => { sectionTransition?.setOpen(isOpen); });
  let windowHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 800);

  $effect(() => {
    if (!isRoot) return;
    const onResize = () => { windowHeight = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  const chevronRotation = new Spring(initiallyOpen ? 180 : 0, { stiffness: 0.2, damping: 0.6 });
  const panelWidth = new Spring(initiallyOpen ? PANEL_WIDTH : COLLAPSED_PANEL_SIZE, { stiffness: 0.2, damping: 0.62 });
  const panelHeight = new Spring(initiallyOpen ? 220 : COLLAPSED_PANEL_SIZE, { stiffness: 0.2, damping: 0.62 });
  const panelRadius = new Spring(initiallyOpen ? 14 : COLLAPSED_PANEL_SIZE / 2, { stiffness: 0.2, damping: 0.62 });
  const panelScale = new Spring(1, { stiffness: 0.25, damping: 0.7 });

  $effect(() => {
    if (!isRoot || !contentRef || typeof ResizeObserver === 'undefined') return;
    const stopHeader = observePanelHeader(contentRef);

    const ro = new ResizeObserver(() => {
      if (!isOpen) return;
      const next = contentRef ? measurePanelHeight(contentRef) : 0;
      if (!next) return;
      contentHeight = next;
    });

    ro.observe(contentRef);

    if (measurePanelHeight(contentRef) > 0) {
      contentHeight = measurePanelHeight(contentRef);
    }

    return () => {
      ro.disconnect();
      stopHeader();
    };
  });

  $effect(() => {
    if (isRoot) return;
    chevronRotation.set(isOpen ? 180 : 0);
  });

  $effect(() => {
    if (!isRoot) return;

    const measured = contentHeight ?? panelRef?.getBoundingClientRect().height ?? COLLAPSED_PANEL_SIZE;
    const nextHeight = isOpen ? Math.min(measured + panelHeightOffset, windowHeight - 32) : COLLAPSED_PANEL_SIZE;
    const springOptions = !hasInitializedRootSize && isOpen ? { instant: true } : undefined;

    panelWidth.set(isOpen ? PANEL_WIDTH : COLLAPSED_PANEL_SIZE, springOptions);
    // Child folders already animate their height; the open shell should follow
    // that size directly instead of trailing it with a second spring.
    const followContent = isOpen && untrack(() => panelWidth.current === PANEL_WIDTH);
    panelHeight.set(nextHeight, followContent ? { instant: true } : springOptions);
    panelRadius.set(isOpen ? 14 : COLLAPSED_PANEL_SIZE / 2, springOptions);

    if (isOpen || !initiallyOpen) {
      hasInitializedRootSize = true;
    }
  });

  const handleToggle = () => {
    if (inline && isRoot) return;
    const next = !isOpen;
    localOpen = next;
    onOpenChange?.(next);
  };

  const handleCollapsedTapStart = () => {
    if (isOpen) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    panelScale.set(0.9);
  };

  const handleCollapsedTapEnd = () => {
    if (isOpen) return;
    panelScale.set(1);
  };

  const panelHeightStyle = $derived(!hasInitializedRootSize && isOpen ? 'auto' : `${panelHeight.current}px`);
  const panelStyle = $derived(
    `width:${panelWidth.current}px;height:${panelHeightStyle};max-height:${Math.max(windowHeight - 32, COLLAPSED_PANEL_SIZE)}px;border-radius:${panelRadius.current}px;` +
      `box-shadow:${isOpen ? 'var(--dial-shadow)' : 'var(--dial-shadow-collapsed)'};` +
      `cursor:${isOpen ? '' : 'pointer'};overflow:${isOpen ? 'hidden auto' : 'hidden'};` +
      `transform:scale(${panelScale.current});`
  );
</script>

{#if isRoot && inline}
  <div class="dialkit-panel-inner dialkit-panel-inline">
    <div bind:this={contentRef} class="dialkit-folder dialkit-folder-root" data-open={String(isOpen)}>
      <div class="dialkit-folder-header dialkit-panel-header" onclick={(e) => { e.stopPropagation(); handleToggle(); }}>
        <div class="dialkit-folder-header-top">
          <div class="dialkit-folder-title-row">
            <span class="dialkit-folder-title dialkit-folder-title-root">{title}</span>
          </div>
        </div>

        {#if toolbar}
          <div class="dialkit-panel-toolbar" onclick={(e) => e.stopPropagation()}>
            {@render toolbar()}
          </div>
        {/if}
      </div>

      {#if isOpen}
      <div class="dialkit-folder-content">
        <div class="dialkit-folder-inner">
          {#if children}{@render children()}{/if}
        </div>
      </div>
      {/if}
    </div>
  </div>
{:else if isRoot}
  <div
    bind:this={panelRef}
    class="dialkit-panel-inner"
    data-collapsed={String(isCollapsed)}
    style={panelStyle}
    onpointerdown={handleCollapsedTapStart}
    onpointerup={handleCollapsedTapEnd}
    onpointercancel={handleCollapsedTapEnd}
    onpointerleave={handleCollapsedTapEnd}
    onclick={() => { if (!isOpen) handleToggle(); }}
  >
    <div bind:this={contentRef} class="dialkit-folder dialkit-folder-root" data-open={String(isOpen)}>
      <div class="dialkit-folder-header dialkit-panel-header" onclick={(e) => { e.stopPropagation(); handleToggle(); }}>
        <div class="dialkit-folder-header-top" role="button" tabindex="0" aria-label={title} aria-expanded={isOpen} onkeydown={(e) => activateOnKey(e, handleToggle)}>
          {#if isOpen}
            <div class="dialkit-folder-title-row">
              <span class="dialkit-folder-title dialkit-folder-title-root">{title}</span>
            </div>
          {/if}

          <svg class="dialkit-panel-icon" viewBox={isOpen ? "0 0 24 24" : "0 0 16 16"} fill="none">
            {#if isOpen}
              <path d={ICON_CLOSE} stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            {:else}
            <path
              opacity="0.5"
              d={ICON_PANEL.path}
              fill="currentColor"
            />
            <circle cx={ICON_PANEL.circles[0].cx} cy={ICON_PANEL.circles[0].cy} r={ICON_PANEL.circles[0].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            <circle cx={ICON_PANEL.circles[1].cx} cy={ICON_PANEL.circles[1].cy} r={ICON_PANEL.circles[1].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            <circle cx={ICON_PANEL.circles[2].cx} cy={ICON_PANEL.circles[2].cy} r={ICON_PANEL.circles[2].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            {/if}
          </svg>
        </div>

        {#if isOpen && toolbar}
          <div class="dialkit-panel-toolbar" onclick={(e) => e.stopPropagation()}>
            {@render toolbar()}
          </div>
        {/if}
      </div>

      {#if isOpen}
        <div class="dialkit-folder-content">
          <div class="dialkit-folder-inner">
            {#if children}{@render children()}{/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div bind:this={sectionRef} class:dialkit-folder-section={!!toolbar} class="dialkit-folder" data-open={String(isOpen)}>
    <div class="dialkit-folder-header" onclick={handleToggle}>
      <div class="dialkit-folder-header-top" role="button" tabindex="0" aria-label={title} aria-expanded={isOpen} onkeydown={(e) => activateOnKey(e, handleToggle)}>
        <div class="dialkit-folder-title-row">
          <span class="dialkit-folder-title">{title}</span>
        </div>

        <svg
          class="dialkit-folder-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style:transform={`rotate(${chevronRotation.current}deg)`}
        >
          <path d={ICON_CHEVRON} />
        </svg>
      </div>
      {#if toolbar}
        <div class="dialkit-panel-section-toolbar-clip">
          <div class="dialkit-panel-section-toolbar" onclick={(e) => e.stopPropagation()}>{@render toolbar()}</div>
        </div>
      {/if}
    </div>

    {#if toolbar}
      <div class="dialkit-folder-content">
        <div class="dialkit-folder-inner">
          {#if children}{@render children()}{/if}
        </div>
      </div>
    {:else if isOpen}
      <div class="dialkit-folder-content" transition:folderTransition>
        <div class="dialkit-folder-inner">
          {#if children}{@render children()}{/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
