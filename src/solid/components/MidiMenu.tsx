import { createSignal, createEffect, createUniqueId, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { DialStore } from '../../store/DialStore';
import type { ControlMeta } from '../../store/DialStore';
import { handleMidiEscape, MIDI_CONTROLLER_DESCRIPTION, midiConnectionView, midiInputDisplayName } from '../../midi';
import type { MidiController, MidiMappingOwner } from '../../midi';
import { ICON_CHECK, ICON_TRASH } from '../../icons';
import { createDropdownDismiss, createDropdownPresence, type AnimationHandle } from '../primitives';

interface MidiMenuProps {
  controller: MidiController;
  ownerToken?: MidiMappingOwner;
}

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

export function MidiMenu(props: MidiMenuProps) {
  const [pos, setPos] = createSignal({ top: 0, right: 0 });
  const [portalTheme, setPortalTheme] = createSignal<string>();

  let triggerRef!: HTMLButtonElement;
  let triggerTapAnim: AnimationHandle | null = null;
  const standaloneOwnerToken: MidiMappingOwner = {};
  const ownerToken = props.ownerToken ?? standaloneOwnerToken;

  const tapTransition = { type: 'spring' as const, visualDuration: 0.15, bounce: 0.3 };

  const [snapshot, setSnapshot] = createSignal(props.controller.getSnapshot());
  createEffect(() => {
    const controller = props.controller;
    setSnapshot(controller.getSnapshot());
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()));
    onCleanup(() => {
      unsubscribe();
      if (!props.ownerToken) controller.stopMapping(ownerToken);
    });
  });

  const view = () => midiConnectionView(snapshot());
  const isMapping = () => snapshot().mapping !== null;
  const isLearningHere = () => snapshot().learning !== null;
  const instanceId = createUniqueId();
  const dropdownId = () => `dialkit-midi-${instanceId}`;
  const titleId = () => `${dropdownId()}-title`;
  const mappings = () => snapshot().bindings;
  const activeInputName = () => view().activeInputLabel;

  const dropdown = createDropdownPresence((el, done) =>
    animate(
      el,
      { opacity: 0, y: 4, scale: 0.97 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: done }
    )
  );

  const open = () => {
    const rect = triggerRef?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setPortalTheme(triggerRef?.closest<HTMLElement>('.dialkit-root[data-theme]')?.dataset.theme);
    dropdown.open();
  };

  const requestAccess = async () => {
    await props.controller.connect();
  };

  const enterMapMode = () => {
    if (!props.controller.getSnapshot().activeInputId) return;
    props.controller.startMapping(undefined, ownerToken);
    closeAndRestoreFocus();
  };

  const closeAndRestoreFocus = () => {
    dropdown.close();
    queueMicrotask(() => triggerRef?.focus());
  };

  const toggle = () => {
    if (isMapping()) {
      props.controller.stopMapping();
    } else if (dropdown.isOpen()) dropdown.close();
    else {
      open();
      const current = props.controller.getSnapshot();
      if (current.status === 'idle' || current.status === 'denied' || current.status === 'error' || current.error) {
        void requestAccess();
      }
    }
  };

  // Outside-click closes the menu. Mapping mode persists so the sliders behind it
  // stay interactive while the user maps them.
  createDropdownDismiss({
    isOpen: dropdown.isOpen,
    contains: (target) => triggerRef?.contains(target) || dropdown.contains(target),
    onDismiss: dropdown.close,
  });

  createEffect(() => {
    if (!dropdown.isOpen()) return;
    queueMicrotask(() => {
      const dialog = document.getElementById(dropdownId());
      const firstControl = dialog?.querySelector<HTMLElement>(
        '.dialkit-midi-device-radio:checked, .dialkit-midi-device-radio, button:not(:disabled)'
      );
      (firstControl ?? dialog)?.focus();
    });
  });

  // Escape settles a pending learn first, then leaves mapping mode.
  createEffect(() => {
    if (!dropdown.isOpen() && !isMapping() && !isLearningHere()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      handleMidiEscape(e, props.controller, null, dropdown.isOpen(), closeAndRestoreFocus);
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  onCleanup(() => triggerTapAnim?.stop());

  const tapTo = (scale: number) => {
    triggerTapAnim?.stop();
    triggerTapAnim = animate(triggerRef, { scale }, tapTransition);
  };

  return (
    <>
      <button
        ref={triggerRef}
        class={`dialkit-midi-trigger${isMapping() ? ' dialkit-midi-done' : ''}`}
        data-active={String(dropdown.isOpen() || isMapping())}
        data-connected={String(Boolean(activeInputName()) && !isMapping())}
        onClick={toggle}
        onPointerDown={() => tapTo(0.9)}
        onPointerUp={() => tapTo(1)}
        onPointerCancel={() => tapTo(1)}
        onPointerLeave={() => tapTo(1)}
        title={isMapping() ? 'Finish MIDI mapping' : activeInputName() ? `${activeInputName()} connected` : 'MIDI controllers'}
        aria-label={isMapping() ? 'Finish MIDI mapping' : activeInputName() ? `${activeInputName()} connected — MIDI controllers` : 'MIDI controllers'}
        aria-haspopup={isMapping() ? undefined : 'dialog'}
        aria-expanded={dropdown.isOpen()}
        aria-controls={dropdownId()}
      >
        <Show when={!isMapping()} fallback={<span>Done</span>}>
          <Show when={activeInputName()} fallback={
            <span class="dialkit-midi-trigger-status" data-state="disconnected">
              <span class="dialkit-midi-trigger-status-dot" aria-hidden="true" />
              <span class="dialkit-midi-trigger-status-label">No controller</span>
            </span>
          }>
            {(name) => (
              <span class="dialkit-midi-trigger-status" data-state="connected">
                <span class="dialkit-midi-trigger-status-dot" aria-hidden="true" />
                <span class="dialkit-midi-trigger-status-label">{name()}</span>
              </span>
            )}
          </Show>
        </Show>
      </button>

      <Show when={dropdown.mounted()}>
        <Portal mount={document.body}>
          <div
            ref={(el) => {
              dropdown.setRef(el);
              animate(
                el,
                { opacity: [0, 1], y: [4, 0], scale: [0.97, 1] },
                { type: 'spring', visualDuration: 0.15, bounce: 0 }
              );
            }}
            class="dialkit-root dialkit-midi-dropdown"
            id={dropdownId()}
            data-theme={portalTheme()}
            role="dialog"
            aria-labelledby={titleId()}
            tabIndex={-1}
            style={{
              position: 'fixed',
              top: `${pos().top}px`,
              right: `${pos().right}px`,
            }}
          >
            <div id={titleId()} class="dialkit-midi-title">Controllers</div>

            <div class="dialkit-midi-status">
              <span class="dialkit-midi-status-label">{MIDI_CONTROLLER_DESCRIPTION}</span>
            </div>

            <Show when={snapshot().inputs.length > 0}>
              <div class="dialkit-midi-devices" role="radiogroup" aria-label="MIDI controllers">
                <For each={snapshot().inputs}>
                  {(input) => {
                    const active = () => input.id === snapshot().activeInputId;
                    return (
                      <label
                        class="dialkit-midi-device"
                        data-active={String(active())}
                      >
                        <input
                          class="dialkit-midi-device-radio"
                          type="radio"
                          name={`${dropdownId()}-controller`}
                          value={input.id}
                          checked={active()}
                          onChange={() => props.controller.selectInput(input.id)}
                        />
                        <span class="dialkit-midi-device-dot" aria-hidden="true" />
                        <span class="dialkit-midi-device-name">{midiInputDisplayName(input) ?? 'MIDI controller'}</span>
                        <Show when={active()}>
                          <svg class="dialkit-midi-device-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d={ICON_CHECK} />
                          </svg>
                        </Show>
                      </label>
                    );
                  }}
                </For>
              </div>
            </Show>

            <Show when={view().action}>
              <button class="dialkit-button dialkit-midi-cta" onClick={() => { void requestAccess(); }}>
                <span>{view().actionLabel}</span>
              </button>
            </Show>

            <Show when={snapshot().status === 'connected' && snapshot().inputs.length > 0}>
              <button class="dialkit-button dialkit-midi-cta" disabled={!snapshot().activeInputId} onClick={enterMapMode}>
                Map parameters
              </button>
            </Show>

            <Show when={mappings().length > 0}>
              <div class="dialkit-midi-list">
                <For each={mappings()}>
                  {(binding) => {
                    const label = () => {
                      const current = DialStore.getPanel(binding.panelId);
                      const control = current ? findControlLabel(current.controls, binding.path) : binding.path;
                      return current ? `${current.name} · ${control}` : control;
                    };
                    return (
                      <div class="dialkit-midi-item">
                        <span class="dialkit-midi-name">{label()}</span>
                        <span class="dialkit-midi-cc">CC {binding.cc}</span>
                        <button
                          class="dialkit-midi-delete"
                          onClick={() => props.controller.unbindTarget(binding.panelId, binding.path)}
                          title="Remove mapping"
                          aria-label="Remove mapping"
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <For each={ICON_TRASH}>
                              {(d) => <path d={d} />}
                            </For>
                          </svg>
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>

            <div class="dialkit-midi-hint">
              {view().connected
                ? snapshot().activeInputId ? 'Active controller selected.' : 'Select a controller to continue.'
                : 'Allow access to detect MIDI controllers.'}
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
}
