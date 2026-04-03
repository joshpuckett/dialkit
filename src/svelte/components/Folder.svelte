<script lang="ts">
  import { Spring } from 'svelte/motion';
  import { slide } from 'svelte/transition';

  import type { Snippet } from 'svelte';

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
    const nextHeight = isOpen ? measured + 24 : 42;

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
      `box-shadow:${isOpen ? 'var(--dial-panel-shadow-open)' : 'var(--dial-panel-shadow-collapsed)'};` +
      `cursor:${isOpen ? '' : 'pointer'};overflow:${isOpen ? '' : 'hidden'};` +
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
              d="M6.84766 11.75C6.78583 11.9899 6.75 12.2408 6.75 12.5C6.75 12.7592 6.78583 13.0101 6.84766 13.25H2C1.58579 13.25 1.25 12.9142 1.25 12.5C1.25 12.0858 1.58579 11.75 2 11.75H6.84766ZM14 11.75C14.4142 11.75 14.75 12.0858 14.75 12.5C14.75 12.9142 14.4142 13.25 14 13.25H12.6523C12.7142 13.0101 12.75 12.7592 12.75 12.5C12.75 12.2408 12.7142 11.9899 12.6523 11.75H14ZM3.09766 7.25C3.03583 7.48994 3 7.74075 3 8C3 8.25925 3.03583 8.51006 3.09766 8.75H2C1.58579 8.75 1.25 8.41421 1.25 8C1.25 7.58579 1.58579 7.25 2 7.25H3.09766ZM14 7.25C14.4142 7.25 14.75 7.58579 14.75 8C14.75 8.41421 14.4142 8.75 14 8.75H8.90234C8.96417 8.51006 9 8.25925 9 8C9 7.74075 8.96417 7.48994 8.90234 7.25H14ZM7.59766 2.75C7.53583 2.98994 7.5 3.24075 7.5 3.5C7.5 3.75925 7.53583 4.01006 7.59766 4.25H2C1.58579 4.25 1.25 3.91421 1.25 3.5C1.25 3.08579 1.58579 2.75 2 2.75H7.59766ZM14 2.75C14.4142 2.75 14.75 3.08579 14.75 3.5C14.75 3.91421 14.4142 4.25 14 4.25H13.4023C13.4642 4.01006 13.5 3.75925 13.5 3.5C13.5 3.24075 13.4642 2.98994 13.4023 2.75H14Z"
              fill="currentColor"
            />
            <circle cx="6" cy="8" r="0.998596" fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            <circle cx="10.4999" cy="3.5" r="0.998657" fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            <circle cx="9.75015" cy="12.5" r="0.997986" fill="currentColor" stroke="currentColor" stroke-width="1.25" />
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
          <path d="M6 9.5L12 15.5L18 9.5" />
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
