import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { DialStore, isDevEnvironment } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { Panel } from './Panel';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  /** Controls whether DialKit renders. Defaults to true in development, false in production. */
  enabled?: boolean;
}

export function DialRoot(props: DialRootProps) {
  const [panels, setPanels] = createSignal<PanelConfig[]>([]);
  const [mounted, setMounted] = createSignal(false);
  const inline = () => (props.mode ?? 'popover') === 'inline';
  const enabled = () => props.enabled ?? isDevEnvironment();

  // Sync enabled state to the store
  createEffect(() => {
    DialStore.setEnabled(enabled());
  });

  // Subscribe to global panel changes (skip when disabled)
  createEffect(() => {
    if (!enabled()) return;
    setMounted(true);
    setPanels(DialStore.getPanels());
    const unsub = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });
    onCleanup(unsub);
  });

  const content = () => (
    <div class="dialkit-root" data-mode={props.mode ?? 'popover'}>
      <div class="dialkit-panel" data-position={inline() ? undefined : (props.position ?? 'top-right')} data-mode={props.mode ?? 'popover'}>
        <For each={panels()}>
          {(panel) => <Panel panel={panel} defaultOpen={inline() || (props.defaultOpen ?? true)} inline={inline()} />}
        </For>
      </div>
    </div>
  );

  return (
    <Show when={enabled() && mounted() && typeof window !== 'undefined' && panels().length > 0}>
      <Show when={!inline()} fallback={content()}>
        <Portal mount={document.body}>
          {content()}
        </Portal>
      </Show>
    </Show>
  );
}
