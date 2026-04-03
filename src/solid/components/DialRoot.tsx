import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { Panel } from './Panel';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  theme?: DialTheme;
}

export function DialRoot(props: DialRootProps) {
  const [panels, setPanels] = createSignal<PanelConfig[]>([]);
  const [mounted, setMounted] = createSignal(false);
  const [systemDark, setSystemDark] = createSignal(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );
  const inline = () => (props.mode ?? 'popover') === 'inline';
  const resolvedTheme = () => {
    const t = props.theme;
    if (!t) return undefined;
    if (t === 'system') return systemDark() ? 'dark' : 'light';
    return t;
  };

  onMount(() => {
    setMounted(true);
    setPanels(DialStore.getPanels());
    const unsub = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);

    onCleanup(() => {
      unsub();
      mq.removeEventListener('change', handler);
    });
  });

  const content = () => (
    <div class="dialkit-root" data-mode={props.mode ?? 'popover'} data-theme={resolvedTheme()}>
      <div class="dialkit-panel" data-position={inline() ? undefined : (props.position ?? 'top-right')} data-mode={props.mode ?? 'popover'}>
        <For each={panels()}>
          {(panel) => <Panel panel={panel} defaultOpen={inline() || (props.defaultOpen ?? true)} inline={inline()} />}
        </For>
      </div>
    </div>
  );

  return (
    <Show when={mounted() && typeof window !== 'undefined' && panels().length > 0}>
      <Show when={!inline()} fallback={content()}>
        <Portal mount={document.body}>
          {content()}
        </Portal>
      </Show>
    </Show>
  );
}
