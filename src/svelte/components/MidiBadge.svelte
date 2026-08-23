<script lang="ts">
  import { midiTargetBadge } from 'dialkit/midi';
  import type { MidiController, MidiControllerSnapshot, MidiBadgeState, MidiMappingOwner } from 'dialkit/midi';

  let { controller, panelId, path, ownerToken } = $props<{
    controller: MidiController;
    panelId: string;
    path: string;
    ownerToken?: MidiMappingOwner;
  }>();

  let snapshot = $state<MidiControllerSnapshot>(controller.getSnapshot());

  $effect(() => {
    snapshot = controller.getSnapshot();
    const unsub = controller.subscribe(() => {
      snapshot = controller.getSnapshot();
    });
    return unsub;
  });

  const badge = $derived(
    controller.canMapTarget(panelId, path)
      ? midiTargetBadge(snapshot, panelId, path)
      : null
  );

  const badgeText = (state: MidiBadgeState, cc: number | null): string => {
    switch (state) {
      case 'select': return 'Map';
      case 'listening': return 'Move control';
      case 'warning': return 'Use MIDI CC';
      case 'bound': return '';
    }
  };

  const badgeTitle: Record<MidiBadgeState, string> = {
    select: 'Map this control to MIDI',
    listening: 'Move the hardware control you want to assign — Esc to cancel',
    warning: 'Use a compatible hardware control that sends MIDI CC',
    bound: 'MIDI mapped — click to re-map',
  };

  const stop = (e: Event) => e.stopPropagation();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!badge) return;
    if (badge.state === 'listening') {
      controller.cancelLearn();
      return;
    }
    if (badge.state === 'bound' && (!controller.getSnapshot().mapping || ownerToken)) {
      controller.startMapping(undefined, ownerToken);
    }
    const inputId = controller.getSnapshot().activeInputId ?? undefined;
    controller.learn({ panelId, path }, { inputId }).catch(() => undefined);
  };
</script>

{#if badge}
  <button
    type="button"
    class="dialkit-midi-pill"
    data-state={badge.state}
    data-active={String(badge.state === 'bound' && snapshot.status === 'connected' && (() => {
      const binding = controller.getBindingForTarget(panelId, path);
      return binding?.inputId
        ? snapshot.inputs.some((input) => input.id === binding.inputId)
        : snapshot.inputs.length > 0;
    })())}
    title={badgeTitle[badge.state]}
    aria-label={badgeTitle[badge.state]}
    onpointerdown={stop}
    onmousedown={stop}
    onclick={handleClick}
  >
    {#if badge.state === 'bound'}
      <span class="dialkit-midi-live-dot"></span>
    {:else}
      {badgeText(badge.state, badge.cc)}
    {/if}
  </button>
{/if}
