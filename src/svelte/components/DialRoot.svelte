<script lang="ts">
  import { DialStore } from 'dialkit/store';
  import type { PanelConfig } from 'dialkit/store';
  import { themeCSS } from '../theme-css';
  import Portal from '../Portal.svelte';
  import Panel from './Panel.svelte';

  export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  export type DialMode = 'popover' | 'inline';
  export type DialTheme = 'light' | 'dark' | 'system';

  let { position = 'top-right', defaultOpen = true, mode = 'popover', theme = undefined } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
  }>();

  const inline = $derived(mode === 'inline');

  let panels = $state<PanelConfig[]>([]);
  let mounted = $state(false);
  let systemDark = $state(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  $effect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => { systemDark = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  const resolvedTheme = $derived(
    !theme ? undefined : theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  );

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
  {#snippet content()}
    <div class="dialkit-root" data-mode={mode} data-theme={resolvedTheme}>
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
