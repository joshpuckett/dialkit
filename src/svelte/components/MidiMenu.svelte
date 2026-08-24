<script lang="ts">
  import { Spring } from 'svelte/motion';
  import { tick } from 'svelte';
  import { DialStore } from 'dialkit/store';
  import type { ControlMeta } from 'dialkit/store';
  import { handleMidiEscape, MIDI_CONTROLLER_DESCRIPTION, midiConnectionView, midiInputDisplayName } from 'dialkit/midi';
  import type { MidiController, MidiControllerSnapshot, MidiMappingOwner } from 'dialkit/midi';
  import { ICON_CHECK, ICON_TRASH } from '../../icons';
  import Portal from '../Portal.svelte';

  let { controller, ownerToken: providedOwnerToken } = $props<{
    controller: MidiController;
    ownerToken?: MidiMappingOwner;
  }>();
  const instanceId = $props.id();
  const dropdownId = `dialkit-midi-${instanceId}`;
  const titleId = `${dropdownId}-title`;
  const standaloneOwnerToken: MidiMappingOwner = {};
  const ownerToken = $derived(providedOwnerToken ?? standaloneOwnerToken);

  let isOpen = $state(false);
  let triggerEl: HTMLButtonElement | undefined;
  let dropdownEl: HTMLDivElement | undefined;
  let pos = $state({ top: 0, right: 0 });
  let portalTheme = $state<string | undefined>();

  const triggerScale = new Spring(1, { stiffness: 0.25, damping: 0.7 });

  let snapshot = $state<MidiControllerSnapshot>(controller.getSnapshot());

  $effect(() => {
    const activeController = controller;
    snapshot = activeController.getSnapshot();
    const unsub = activeController.subscribe(() => {
      snapshot = activeController.getSnapshot();
    });
    return () => {
      unsub();
      if (!providedOwnerToken) activeController.stopMapping(ownerToken);
    };
  });

  const view = $derived(midiConnectionView(snapshot));
  const isMapping = $derived(snapshot.mapping !== null);
  const isLearningHere = $derived(snapshot.learning !== null);
  const mappings = $derived(snapshot.bindings);
  const activeInputName = $derived(view.activeInputLabel);

  function findControlLabel(controls: ControlMeta[], path: string): string {
    for (const control of controls) {
      if (control.path === path) return control.label;
      if ((control.type === 'spring' || control.type === 'transition') && path.startsWith(`${control.path}.`)) {
        const leaf = path.slice(control.path.length + 1);
        return `${control.label} · ${leaf.charAt(0).toUpperCase()}${leaf.slice(1)}`;
      }
      if (control.children) {
        const found = findControlLabel(control.children, path);
        if (found) return found;
      }
    }
    return path;
  }

  function open() {
    const rect = triggerEl?.getBoundingClientRect();
    if (rect) {
      pos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
    }
    portalTheme = triggerEl?.closest<HTMLElement>('.dialkit-root[data-theme]')?.dataset.theme;
    isOpen = true;
    void tick().then(() => {
      const firstControl = dropdownEl?.querySelector<HTMLElement>(
        '.dialkit-midi-device-radio:checked, .dialkit-midi-device-radio, button:not(:disabled)'
      );
      (firstControl ?? dropdownEl)?.focus();
    });
  }

  function close() {
    isOpen = false;
  }

  function closeAndRestoreFocus() {
    close();
    void tick().then(() => triggerEl?.focus());
  }

  function toggle() {
    if (isMapping) {
      controller.stopMapping();
    } else if (isOpen) close();
    else {
      open();
      const current = controller.getSnapshot();
      if (current.status === 'idle' || current.status === 'denied' || current.status === 'error' || current.error) {
        void requestAccess();
      }
    }
  }

  const requestAccess = async () => {
    await controller.connect();
  };

  const enterMapMode = () => {
    if (!controller.getSnapshot().activeInputId) return;
    controller.startMapping(undefined, ownerToken);
    closeAndRestoreFocus();
  };

  // Outside-click closes the menu. Mapping mode persists so the sliders behind it
  // stay interactive while the user maps them.
  $effect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerEl?.contains(target) || dropdownEl?.contains(target)) return;
      close();
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });

  // Escape settles a pending learn first, then leaves mapping mode.
  $effect(() => {
    if (!isOpen && !isMapping && !isLearningHere) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      handleMidiEscape(e, controller, null, isOpen, closeAndRestoreFocus);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

</script>

<button
  bind:this={triggerEl}
  class={isMapping ? 'dialkit-midi-trigger dialkit-midi-done' : 'dialkit-midi-trigger'}
  data-active={String(isOpen || isMapping)}
  data-connected={String(Boolean(activeInputName) && !isMapping)}
  onclick={(event) => { event.stopPropagation(); toggle(); }}
  onpointerdown={() => triggerScale.set(0.9)}
  onpointerup={() => triggerScale.set(1)}
  onpointercancel={() => triggerScale.set(1)}
  onpointerleave={() => triggerScale.set(1)}
  title={isMapping ? 'Finish MIDI mapping' : activeInputName ? `${activeInputName} connected` : 'MIDI controllers'}
  aria-label={isMapping ? 'Finish MIDI mapping' : activeInputName ? `${activeInputName} connected — MIDI controllers` : 'MIDI controllers'}
  aria-haspopup={isMapping ? undefined : 'dialog'}
  aria-expanded={isOpen}
  aria-controls={dropdownId}
  style:transform={`scale(${triggerScale.current})`}
>
  {#if isMapping}
    <span>Done</span>
  {:else if activeInputName}
    <span class="dialkit-midi-trigger-status" data-state="connected">
      <span class="dialkit-midi-trigger-status-dot" aria-hidden="true"></span>
      <span class="dialkit-midi-trigger-status-label">{activeInputName}</span>
    </span>
  {:else}
    <span class="dialkit-midi-trigger-status" data-state="disconnected">
      <span class="dialkit-midi-trigger-status-dot" aria-hidden="true"></span>
      <span class="dialkit-midi-trigger-status-label">No controller</span>
    </span>
  {/if}
</button>

<Portal target="body">
  {#if isOpen}
    <div
      bind:this={dropdownEl}
      id={dropdownId}
      class="dialkit-root dialkit-midi-dropdown"
      data-theme={portalTheme}
      role="dialog"
      aria-labelledby={titleId}
      tabindex="-1"
      style:position="fixed"
      style:top="{pos.top}px"
      style:right="{pos.right}px"
    >
      <div id={titleId} class="dialkit-midi-title">Controllers</div>

      <div class="dialkit-midi-status">
        <span class="dialkit-midi-status-label">{MIDI_CONTROLLER_DESCRIPTION}</span>
      </div>

      {#if snapshot.inputs.length > 0}
        <div class="dialkit-midi-devices" role="radiogroup" aria-label="MIDI controllers">
          {#each snapshot.inputs as input (input.id)}
            <label
              class="dialkit-midi-device"
              data-active={String(input.id === snapshot.activeInputId)}
            >
              <input
                class="dialkit-midi-device-radio"
                type="radio"
                name={`${dropdownId}-controller`}
                value={input.id}
                checked={input.id === snapshot.activeInputId}
                onchange={() => controller.selectInput(input.id)}
              />
              <span class="dialkit-midi-device-dot" aria-hidden="true"></span>
              <span class="dialkit-midi-device-name">{midiInputDisplayName(input) ?? 'MIDI controller'}</span>
              {#if input.id === snapshot.activeInputId}
                <svg class="dialkit-midi-device-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d={ICON_CHECK} />
                </svg>
              {/if}
            </label>
          {/each}
        </div>
      {/if}

      {#if view.action}
        <button class="dialkit-button dialkit-midi-cta" onclick={() => { void requestAccess(); }}>
          <span>{view.actionLabel}</span>
        </button>
      {/if}

      {#if snapshot.status === 'connected' && snapshot.inputs.length > 0}
        <button
          class="dialkit-button dialkit-midi-cta"
          disabled={!snapshot.activeInputId}
          onclick={enterMapMode}
        >
          Map parameters
        </button>
      {/if}

      {#if mappings.length > 0}
        <div class="dialkit-midi-list">
          {#each mappings as binding (binding.id)}
            <div class="dialkit-midi-item">
              <span class="dialkit-midi-name">{(() => {
                const panel = DialStore.getPanel(binding.panelId);
                const control = panel ? findControlLabel(panel.controls, binding.path) : binding.path;
                return panel ? `${panel.name} · ${control}` : control;
              })()}</span>
              <span class="dialkit-midi-cc">CC {binding.cc}</span>
              <button
                class="dialkit-midi-delete"
                onclick={() => controller.unbindTarget(binding.panelId, binding.path)}
                title="Remove mapping"
                aria-label="Remove mapping"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  {#each ICON_TRASH as d}
                    <path {d} />
                  {/each}
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="dialkit-midi-hint">
        {view.connected
          ? snapshot.activeInputId ? 'Active controller selected.' : 'Select a controller to continue.'
          : 'Allow access to detect MIDI controllers.'}
      </div>
    </div>
  {/if}
</Portal>
