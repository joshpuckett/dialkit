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
  import { mountShortcutListener, subscribeShortcut } from '../../shortcut-listener';

  let { children } = $props<{ children?: Snippet }>();

  let activePanelId = $state<string | null>(null);
  let activePath = $state<string | null>(null);

  const ctx: ShortcutContextValue = {
    get activePanelId() { return activePanelId; },
    get activePath() { return activePath; },
  };

  setContext(SHORTCUT_CTX, ctx);

  // Every root shares one window listener, so two roots never apply a shortcut twice.
  $effect(() => {
    const listener = mountShortcutListener();
    const unsubscribe = subscribeShortcut((target) => {
      activePanelId = target?.panelId ?? null;
      activePath = target?.path ?? null;
    });
    return () => {
      unsubscribe();
      listener.destroy();
    };
  });
</script>

{#if children}{@render children()}{/if}
