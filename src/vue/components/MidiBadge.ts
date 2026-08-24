import { defineComponent, h, onMounted, onUnmounted, shallowRef, watch, type PropType } from 'vue';
import { midiTargetBadge } from '../../midi';
import type { MidiBadgeState, MidiController, MidiMappingOwner } from '../../midi';

const badgeText: Record<MidiBadgeState, (cc: number | null) => string> = {
  select: () => 'Map',
  listening: () => 'Move control',
  warning: () => 'Use MIDI CC',
  bound: () => '',
};

const badgeTitle: Record<MidiBadgeState, string> = {
  select: 'Map this control to MIDI',
  listening: 'Move the hardware control you want to assign — Esc to cancel',
  warning: 'Use a compatible hardware control that sends MIDI CC',
  bound: 'MIDI mapped — click to re-map',
};

/**
 * The mapping badge on a numeric control. Self-subscribing so it can be dropped
 * into any slider without threading the MIDI snapshot down the tree. Renders the
 * pill button, or nothing when no badge applies.
 */
export const MidiBadge = defineComponent({
  name: 'DialKitMidiBadge',
  props: {
    controller: { type: Object as PropType<MidiController>, required: true },
    panelId: { type: String, required: true },
    path: { type: String, required: true },
    ownerToken: { type: Object as PropType<MidiMappingOwner>, required: false, default: undefined },
  },
  setup(props) {
    const snapshot = shallowRef(props.controller.getSnapshot());
    let unsub: (() => void) | undefined;

    let stopControllerWatch: (() => void) | undefined;
    onMounted(() => {
      stopControllerWatch = watch(() => props.controller, (controller) => {
        unsub?.();
        snapshot.value = controller.getSnapshot();
        unsub = controller.subscribe(() => {
          snapshot.value = controller.getSnapshot();
        });
      }, { immediate: true });
    });

    onUnmounted(() => {
      stopControllerWatch?.();
      unsub?.();
    });

    const stop = (event: Event) => event.stopPropagation();

    const onClick = (event: MouseEvent) => {
      event.stopPropagation();
      const badge = midiTargetBadge(snapshot.value, props.panelId, props.path);
      if (!badge) return;
      if (badge.state === 'listening') {
        props.controller.cancelLearn();
        return;
      }
      if (badge.state === 'bound' && (!props.controller.getSnapshot().mapping || props.ownerToken)) {
        props.controller.startMapping(undefined, props.ownerToken);
      }
      const inputId = props.controller.getSnapshot().activeInputId ?? undefined;
      props.controller.learn({ panelId: props.panelId, path: props.path }, { inputId }).catch(() => undefined);
    };

    return () => {
      const badge = midiTargetBadge(snapshot.value, props.panelId, props.path);
      if (!badge) return null;
      return h('button', {
        type: 'button',
        class: 'dialkit-midi-pill',
        'data-state': badge.state,
        'data-active': String(badge.state === 'bound' && (() => {
          const binding = props.controller.getBindingForTarget(props.panelId, props.path);
          if (snapshot.value.status !== 'connected') return false;
          return binding?.inputId
            ? snapshot.value.inputs.some((input) => input.id === binding.inputId)
            : snapshot.value.inputs.length > 0;
        })()),
        title: badgeTitle[badge.state],
        'aria-label': badgeTitle[badge.state],
        onPointerdown: stop,
        onMousedown: stop,
        onClick,
      }, badge.state === 'bound'
        ? h('span', { class: 'dialkit-midi-live-dot' })
        : badgeText[badge.state](badge.cc));
    };
  },
});
