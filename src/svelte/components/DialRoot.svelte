<script lang="ts">
  import { DialStore, loadPosition, savePosition } from 'dialkit/store';
  import type { PanelConfig, DialPosition } from 'dialkit/store';
  import { themeCSS } from '../theme-css';
  import Portal from '../Portal.svelte';
  import Panel from './Panel.svelte';

  export type DialMode = 'popover' | 'inline';

  let { position = 'top-right', defaultOpen = true, mode = 'popover', positionPicker = false } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    positionPicker?: boolean;
  }>();

  const inline = $derived(mode === 'inline');
  const showPicker = $derived(positionPicker && !inline);

  let panels = $state<PanelConfig[]>([]);
  let mounted = $state(false);

  let currentPosition = $state<DialPosition>(positionPicker && mode !== 'inline' ? loadPosition(position) : position);

  const growDirection = $derived(currentPosition.startsWith('bottom') ? 'up' as const : 'down' as const);

  function handlePositionChange(pos: DialPosition) {
    currentPosition = pos;
    savePosition(pos);
  }

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
    <div class="dialkit-root" data-mode={mode}>
      <div
        class="dialkit-panel"
        data-mode={mode}
        data-position={inline ? undefined : currentPosition}
      >
        {#each panels as panel (panel.id)}
          <Panel
            {panel}
            defaultOpen={inline || defaultOpen}
            {inline}
            growDirection={!inline ? growDirection : undefined}
            currentPosition={showPicker ? currentPosition : undefined}
            onPositionChange={showPicker ? handlePositionChange : undefined}
          />
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
