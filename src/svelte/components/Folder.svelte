<script lang="ts">
  import { Spring } from 'svelte/motion';
  import { slide } from 'svelte/transition';

  import type { Snippet } from 'svelte';
  import { ICON_PANEL, ICON_CHEVRON } from '../../icons';

  let {
    title,
    defaultOpen = true,
    isRoot = false,
    inline = false,
    onOpenChange,
    toolbar,
    children,
  } = $props<{
    title: string;
    defaultOpen?: boolean;
    isRoot?: boolean;
    inline?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    toolbar?: Snippet;
    children?: Snippet;
  }>();

  let isOpen = $state(defaultOpen);
  let isCollapsed = $state(!defaultOpen);
  let contentHeight = $state<number | undefined>(undefined);

  let contentRef: HTMLDivElement | undefined;
  let panelRef: HTMLDivElement | undefined;
  let windowHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 800);

  $effect(() => {
    if (!isRoot) return;
    const onResize = () => { windowHeight = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  const chevronRotation = new Spring(defaultOpen ? 0 : 180, { stiffness: 0.2, damping: 0.6 });
  const panelWidth = new Spring(defaultOpen ? 280 : 42, { stiffness: 0.2, damping: 0.62 });
  const panelHeight = new Spring(defaultOpen ? 220 : 42, { stiffness: 0.2, damping: 0.62 });
  const panelRadius = new Spring(defaultOpen ? 14 : 21, { stiffness: 0.2, damping: 0.62 });
  const panelScale = new Spring(1, { stiffness: 0.25, damping: 0.7 });

  $effect(() => {
    if (!isRoot || !contentRef || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      if (!isOpen) return;
      const next = contentRef?.offsetHeight;
      if (!next) return;
      contentHeight = next;
    });

    ro.observe(contentRef);

    if (contentRef.offsetHeight > 0) {
      contentHeight = contentRef.offsetHeight;
    }

    return () => {
      ro.disconnect();
    };
  });

  $effect(() => {
    if (isRoot) return;
    chevronRotation.set(isOpen ? 0 : 180);
  });

  $effect(() => {
    if (!isRoot) return;

    const measured = contentHeight ?? panelRef?.getBoundingClientRect().height ?? 42;
    const nextHeight = isOpen ? Math.min(measured + 10, windowHeight - 32) : 42;

    panelWidth.set(isOpen ? 280 : 42);
    panelHeight.set(nextHeight);
    panelRadius.set(isOpen ? 14 : 21);
  });

  const handleToggle = () => {
    if (inline && isRoot) return;
    const next = !isOpen;
    isOpen = next;
    isCollapsed = !next;
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

  const panelStyle = $derived(
    `width:${panelWidth.current}px;height:${panelHeight.current}px;border-radius:${panelRadius.current}px;` +
      `box-shadow:${isOpen ? 'var(--dial-shadow)' : 'var(--dial-shadow-collapsed)'};` +
      `cursor:${isOpen ? '' : 'pointer'};overflow:${isOpen ? 'hidden auto' : 'hidden'};` +
      `transform:scale(${panelScale.current});`
  );
</script>

{#if isRoot && inline}
  <div class="dialkit-panel-inner dialkit-panel-inline">
    <div bind:this={contentRef} class="dialkit-folder dialkit-folder-root">
      <div class="dialkit-folder-header dialkit-panel-header" onclick={(e) => { e.stopPropagation(); handleToggle(); }}>
        <div class="dialkit-folder-header-top">
          <div class="dialkit-folder-title-row">
            <span class="dialkit-folder-title dialkit-folder-title-root">{title}</span>
          </div>
        </div>

        <div class="dialkit-panel-toolbar" onclick={(e) => e.stopPropagation()}>
          {#if toolbar}{@render toolbar()}{/if}
        </div>
      </div>

      <div class="dialkit-folder-content">
        <div class="dialkit-folder-inner">
          {#if children}{@render children()}{/if}
        </div>
      </div>
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
    <div bind:this={contentRef} class="dialkit-folder dialkit-folder-root">
      <div class="dialkit-folder-header dialkit-panel-header" onclick={(e) => { e.stopPropagation(); handleToggle(); }}>
        <div class="dialkit-folder-header-top">
          {#if isOpen}
            <div class="dialkit-folder-title-row">
              <span class="dialkit-folder-title dialkit-folder-title-root">{title}</span>
            </div>
          {/if}

          <svg class="dialkit-panel-icon" viewBox="0 0 16 16" fill="none">
            <path
              opacity="0.5"
              d={ICON_PANEL.path}
              fill="currentColor"
            />
            <circle cx={ICON_PANEL.circles[0].cx} cy={ICON_PANEL.circles[0].cy} r={ICON_PANEL.circles[0].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            <circle cx={ICON_PANEL.circles[1].cx} cy={ICON_PANEL.circles[1].cy} r={ICON_PANEL.circles[1].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            <circle cx={ICON_PANEL.circles[2].cx} cy={ICON_PANEL.circles[2].cy} r={ICON_PANEL.circles[2].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
          </svg>
        </div>

        {#if isOpen}
          <div class="dialkit-panel-toolbar" onclick={(e) => e.stopPropagation()}>
            {#if toolbar}{@render toolbar()}{/if}
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
  <div class="dialkit-folder">
    <div class="dialkit-folder-header" onclick={handleToggle}>
      <div class="dialkit-folder-header-top">
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
    </div>

    {#if isOpen}
      <div class="dialkit-folder-content" style="clip-path: inset(0 -20px);" transition:slide={{ duration: 220 }}>
        <div class="dialkit-folder-inner">
          {#if children}{@render children()}{/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
