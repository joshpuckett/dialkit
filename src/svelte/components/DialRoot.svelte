<script lang="ts">
  import type { DialVersions } from '../../version-gallery';
  import DialRootContent from './DialRootContent.svelte';

  export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  export type DialMode = 'popover' | 'inline';
  export type DialTheme = 'light' | 'dark' | 'system';

  const nodeEnv = (globalThis as typeof globalThis & { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  const viteMode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
  const isDevDefault = nodeEnv
    ? nodeEnv !== 'production'
    : viteMode
      ? viteMode !== 'production'
      : true;

  let { productionEnabled = isDevDefault, ...props } = $props<{
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
    productionEnabled?: boolean;
    /** How saved versions appear: captured thumbnails (default), or a menu. */
    versions?: DialVersions;
    onOpenChange?: (open: boolean) => void;
  }>();
</script>

<!-- A separate component, so with the gate off nothing subscribes or injects. -->
{#if productionEnabled}
  <DialRootContent {...props} />
{/if}
