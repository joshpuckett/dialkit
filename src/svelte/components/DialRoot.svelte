<script lang="ts">
  import { DialStore, isDevEnvironment } from 'dialkit/store';
  import type { PanelConfig } from 'dialkit/store';
  import { themeCSS } from '../theme-css';
  import Portal from '../Portal.svelte';
  import Panel from './Panel.svelte';

  export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  export type DialMode = 'popover' | 'inline';

  let { position = 'top-right', defaultOpen = true, mode = 'popover', enabled = isDevEnvironment() } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    /** Controls whether DialKit renders. Defaults to true in development, false in production. */
    enabled?: boolean;
  }>();

  const inline = $derived(mode === 'inline');

  let panels = $state<PanelConfig[]>([]);
  let mounted = $state(false);

  $effect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const id = 'dialkit-theme';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = themeCSS;
      document.head.appendChild(style);
    }
  });

  // Sync enabled state to the store
  $effect(() => {
    DialStore.setEnabled(enabled);
  });

  $effect(() => {
    if (!enabled || typeof window === 'undefined') return;

    mounted = true;
    panels = DialStore.getPanels();

    const unsub = DialStore.subscribeGlobal(() => {
      panels = DialStore.getPanels();
    });

    return unsub;
  });
</script>

{#if enabled && mounted && panels.length > 0}
  {#snippet content()}
    <div class="dialkit-root" data-mode={mode}>
      <div class="dialkit-panel" data-mode={mode} data-position={inline ? undefined : position}>
        {#each panels as panel (panel.id)}
          <Panel {panel} defaultOpen={inline || defaultOpen} {inline} />
        {/each}
      </div>
    </div>
  {/snippet}

  {#if inline}
    {@render content()}
  {:else}
    <Portal target="body">
      {@render content()}
    </Portal>
  {/if}
{/if}
