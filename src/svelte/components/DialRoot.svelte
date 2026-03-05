<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { PanelConfig } from 'dialkit/store';
  import { themeCSS } from '../theme-css';
  import Portal from '../Portal.svelte';
  import Panel from './Panel.svelte';

  export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

  let { position = 'top-right', defaultOpen = true } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
  }>();

  let panels = $state<PanelConfig[]>([]);
  let mounted = $state(false);

  $effect(() => {
    if (typeof document === 'undefined') return;
    const id = 'dialkit-theme';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = themeCSS;
      document.head.appendChild(style);
    }
  });

  $effect(() => {
    if (typeof window === 'undefined') return;

    mounted = true;
    panels = DialStore.getPanels();

    const unsub = DialStore.subscribeGlobal(() => {
      panels = DialStore.getPanels();
    });

    return unsub;
  });
</script>

{#if mounted && panels.length > 0}
  <Portal target="body">
    <div class="dialkit-root">
      <div class="dialkit-panel" data-position={position}>
        {#each panels as panel (panel.id)}
          <Panel {panel} {defaultOpen} />
        {/each}
      </div>
    </div>
  </Portal>
{/if}
