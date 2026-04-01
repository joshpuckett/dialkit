import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { DialStore, loadPosition, savePosition } from '../../store/DialStore';
import type { PanelConfig, DialPosition } from '../../store/DialStore';
import { Panel } from './Panel';

export type { DialPosition };
export type DialMode = 'popover' | 'inline';

interface DialRootProps {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
  positionPicker?: boolean;
}

export function DialRoot(props: DialRootProps) {
  const [panels, setPanels] = createSignal<PanelConfig[]>([]);
  const [mounted, setMounted] = createSignal(false);
  const inline = () => (props.mode ?? 'popover') === 'inline';
  const showPicker = () => (props.positionPicker ?? false) && !inline();
  const [currentPosition, setCurrentPosition] = createSignal<DialPosition>(
    showPicker() ? loadPosition(props.position ?? 'top-right') : (props.position ?? 'top-right')
  );

  const growDirection = () => currentPosition().startsWith('bottom') ? 'up' as const : 'down' as const;

  const handlePositionChange = (pos: DialPosition) => {
    setCurrentPosition(pos);
    savePosition(pos);
  };

  onMount(() => {
    setMounted(true);
    setPanels(DialStore.getPanels());
    const unsub = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });
    onCleanup(unsub);
  });

  const content = () => (
    <div class="dialkit-root" data-mode={props.mode ?? 'popover'}>
      <div
        class="dialkit-panel"
        data-position={inline() ? undefined : currentPosition()}
        data-mode={props.mode ?? 'popover'}
      >
        <For each={panels()}>
          {(panel) => (
            <Panel
              panel={panel}
              defaultOpen={inline() || (props.defaultOpen ?? true)}
              inline={inline()}
              growDirection={!inline() ? growDirection() : undefined}
              currentPosition={showPicker() ? currentPosition() : undefined}
              onPositionChange={showPicker() ? handlePositionChange : undefined}
            />
          )}
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
