<script lang="ts">
  import type { Snippet } from 'svelte';

  let { target = 'body', children } = $props<{ target?: string | HTMLElement | null; children?: Snippet }>();

  let portalEl: HTMLDivElement | undefined;

  const resolveTarget = (): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    if (!target) return document.body;
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  };

  $effect(() => {
    if (!portalEl) return;
    const root = resolveTarget();
    if (!root) return;

    root.appendChild(portalEl);

    return () => {
      portalEl?.remove();
    };
  });
</script>

<div bind:this={portalEl} style="display: contents;">
  {#if children}{@render children()}{/if}
</div>
