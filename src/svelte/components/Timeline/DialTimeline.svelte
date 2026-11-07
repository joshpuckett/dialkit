<script lang="ts">
  import { isDevDefault } from 'dialkit/timeline';
  import type { DialTheme } from '../DialRoot.svelte';
  import TimelineDock from './TimelineDock.svelte';

  let { productionEnabled = isDevDefault, ...props } = $props<{
    theme?: DialTheme;
    defaultVisible?: boolean;
    visible?: boolean;
    onVisibilityChange?: (visible: boolean) => void;
    defaultOpen?: boolean;
    productionEnabled?: boolean;
  }>();
</script>

<!-- A separate component, so with the gate off nothing subscribes or registers a dock. -->
{#if productionEnabled}
  <TimelineDock {...props} />
{/if}
