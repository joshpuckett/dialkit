import { Show } from 'solid-js';
import { midiTargetBadge } from '../../midi';
import type { MidiBadgeState, MidiController, MidiControllerSnapshot, MidiMappingOwner } from '../../midi';

interface MidiBadgeProps {
  controller: MidiController;
  panelId: string;
  path: string;
  /** Current controller snapshot, or null when no controller is active. */
  snapshot: MidiControllerSnapshot | null;
  ownerToken?: MidiMappingOwner;
}

const badgeText = (state: MidiBadgeState, cc: number | null): string =>
  state === 'select' ? 'Map' : state === 'listening' ? 'Move control' : state === 'warning' ? 'Use MIDI CC' : '';

const badgeTitle: Record<MidiBadgeState, string> = {
  select: 'Map this control to MIDI',
  listening: 'Move the hardware control you want to assign — Esc to cancel',
  warning: 'Use a compatible hardware control that sends MIDI CC',
  bound: 'MIDI mapped — click to re-map',
};

/**
 * The MIDI mapping badge shown on a numeric control. Derived from the shared
 * `midiTargetBadge` view helper so every framework adapter stays identical.
 * Renders nothing when no badge applies.
 */
export function MidiBadge(props: MidiBadgeProps) {
  const badge = () => {
    const snapshot = props.snapshot;
    return snapshot ? midiTargetBadge(snapshot, props.panelId, props.path) : null;
  };

  const stop = (e: Event) => e.stopPropagation();
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    const current = badge();
    if (!current) return;
    if (current.state === 'listening') {
      props.controller.cancelLearn();
      return;
    }
    if (current.state === 'bound' && (!props.controller.getSnapshot().mapping || props.ownerToken)) {
      props.controller.startMapping(undefined, props.ownerToken);
    }
    const inputId = props.controller.getSnapshot().activeInputId ?? undefined;
    props.controller.learn({ panelId: props.panelId, path: props.path }, { inputId }).catch(() => undefined);
  };

  return (
    <Show when={badge()}>
      {(current) => (
        <button
          type="button"
          class="dialkit-midi-pill"
          data-state={current().state}
          data-active={String(current().state === 'bound' && (() => {
            const snap = props.snapshot;
            const binding = props.controller.getBindingForTarget(props.panelId, props.path);
            if (!snap || snap.status !== 'connected') return false;
            return binding?.inputId
              ? snap.inputs.some((input) => input.id === binding.inputId)
              : snap.inputs.length > 0;
          })())}
          title={badgeTitle[current().state]}
          aria-label={badgeTitle[current().state]}
          onPointerDown={stop}
          onMouseDown={stop}
          onClick={onClick}
        >
          <Show when={current().state !== 'bound'} fallback={<span class="dialkit-midi-live-dot" />}>
            {badgeText(current().state, current().cc)}
          </Show>
        </button>
      )}
    </Show>
  );
}
