<script lang="ts" module>
  export const SHORTCUT_CTX = Symbol('dialkit-shortcut');

  export interface ShortcutContextValue {
    activePanelId: string | null;
    activePath: string | null;
  }
</script>

<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import { mountShortcutListener, subscribeShortcut } from '../../shortcut-utils';

  let { children } = $props<{ children?: Snippet }>();

  let activePanelId = $state<string | null>(null);
  let activePath = $state<string | null>(null);

  const ctx: ShortcutContextValue = {
    get activePanelId() { return activePanelId; },
    get activePath() { return activePath; },
  };

  setContext(SHORTCUT_CTX, ctx);

  $effect(() => {
    const listener = mountShortcutListener();
    const stop = subscribeShortcut((target) => {
      activePanelId = target?.panelId ?? null;
      activePath = target?.path ?? null;
    });
    return () => {
      stop();
      listener.destroy();
    };
  });
</script>

{#if children}{@render children()}{/if}
