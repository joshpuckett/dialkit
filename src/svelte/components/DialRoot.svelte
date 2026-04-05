<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { PanelConfig } from 'dialkit/store';
  import { themeCSS } from '../theme-css';
  import Portal from '../Portal.svelte';
  import Panel from './Panel.svelte';
  import ShortcutListener from './ShortcutListener.svelte';

  export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  export type DialMode = 'popover' | 'inline';
  export type DialTheme = 'light' | 'dark' | 'system';

  declare const process: { env?: { NODE_ENV?: string } } | undefined;

  const isDevDefault = typeof process !== 'undefined' && process?.env?.NODE_ENV
    ? process.env.NODE_ENV !== 'production'
    : typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE
      ? (import.meta as any).env.MODE !== 'production'
      : true;

  let { position = 'top-right', defaultOpen = true, mode = 'popover', theme = 'system' as DialTheme, productionEnabled = isDevDefault } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
    productionEnabled?: boolean;
  }>();

  const inline = $derived(mode === 'inline');

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

{#if productionEnabled && mounted && panels.length > 0}
  {#snippet content()}
    <ShortcutListener>
      <div class="dialkit-root" data-mode={mode} data-theme={theme}>
        <div class="dialkit-panel" data-mode={mode} data-position={inline ? undefined : position}>
          {#each panels as panel (panel.id)}
            <Panel {panel} defaultOpen={inline || defaultOpen} {inline} />
          {/each}
        </div>
      </div>
    </ShortcutListener>
  {/snippet}

  {#if inline}
    {@render content()}
  {:else}
    <Portal target="body">
      {@render content()}
    </Portal>
  {/if}
{/if}
