import { useState, useRef, useEffect, useCallback, useId, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { DialStore } from '../store/DialStore';
import type { ControlMeta } from '../store/DialStore';
import { handleMidiEscape, MIDI_CONTROLLER_DESCRIPTION, midiConnectionView, midiInputDisplayName } from '../midi';
import type { MidiController, MidiMappingOwner } from '../midi';
import { ICON_CHECK, ICON_TRASH } from '../icons';

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

export function MidiMenu({ controller, ownerToken: providedOwnerToken }: MidiMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const standaloneOwnerToken = useRef<MidiMappingOwner>({}).current;
  const ownerToken = providedOwnerToken ?? standaloneOwnerToken;
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [portalTheme, setPortalTheme] = useState<string>();

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const view = midiConnectionView(snapshot);
  const isMapping = snapshot.mapping !== null;
  const isLearningHere = snapshot.learning !== null;
  const instanceId = useId();
  const dropdownId = `dialkit-midi-${instanceId}`;
  const titleId = `${dropdownId}-title`;
  const mappings = snapshot.bindings;
  const activeInputName = view.activeInputLabel;

  const open = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setPortalTheme(triggerRef.current?.closest<HTMLElement>('.dialkit-root[data-theme]')?.dataset.theme);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const closeAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);
  const requestAccess = useCallback(async () => {
    await controller.connect();
  }, [controller]);
  const enterMapMode = useCallback(() => {
    if (!controller.getSnapshot().activeInputId) return;
    controller.startMapping(undefined, ownerToken);
    closeAndRestoreFocus();
  }, [closeAndRestoreFocus, controller, ownerToken]);
  const toggle = useCallback(() => {
    if (isMapping) {
      controller.stopMapping();
    } else if (isOpen) close();
    else open();
  }, [close, controller, isMapping, isOpen, open]);

  // Outside-click closes the menu. Mapping mode persists so the sliders behind it
  // stay interactive while the user maps them.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const firstControl = dropdownRef.current?.querySelector<HTMLElement>(
        '.dialkit-midi-device-radio:checked, .dialkit-midi-device-radio, button:not(:disabled)'
      );
      (firstControl ?? dropdownRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Escape settles a pending learn first, then leaves mapping mode.
  useEffect(() => {
    if (!isOpen && !isMapping && !isLearningHere) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      handleMidiEscape(e, controller, null, isOpen, closeAndRestoreFocus);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeAndRestoreFocus, controller, isOpen, isMapping, isLearningHere]);

  // Settle anything this panel still owns when it unmounts (never disconnects).
  useEffect(() => () => {
    if (!providedOwnerToken) controller.stopMapping(ownerToken);
  }, [controller, ownerToken, providedOwnerToken]);

  return (
    <>
      <motion.button
        ref={triggerRef}
        className={isMapping ? 'dialkit-midi-trigger dialkit-midi-done' : 'dialkit-midi-trigger'}
        data-active={String(isOpen || isMapping)}
        data-connected={String(Boolean(activeInputName) && !isMapping)}
        onClick={toggle}
        title={isMapping ? 'Finish MIDI mapping' : activeInputName ? `${activeInputName} connected` : 'MIDI controllers'}
        aria-label={isMapping ? 'Finish MIDI mapping' : activeInputName ? `${activeInputName} connected — MIDI controllers` : 'MIDI controllers'}
        aria-haspopup={isMapping ? undefined : 'dialog'}
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
      >
        {isMapping ? (
          <span>Done</span>
        ) : activeInputName ? (
          <span className="dialkit-midi-trigger-status" data-state="connected">
            <span className="dialkit-midi-trigger-status-dot" aria-hidden="true" />
            <span className="dialkit-midi-trigger-status-label">{activeInputName}</span>
          </span>
        ) : (
          <span className="dialkit-midi-trigger-status" data-state="disconnected">
            <span className="dialkit-midi-trigger-status-dot" aria-hidden="true" />
            <span className="dialkit-midi-trigger-status-label">No controller</span>
          </span>
        )}
      </motion.button>

      {isOpen && createPortal(
        <motion.div
          ref={dropdownRef}
          id={dropdownId}
          className="dialkit-root dialkit-midi-dropdown"
          data-theme={portalTheme}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
        >
          <div id={titleId} className="dialkit-midi-title">Controllers</div>

          <div className="dialkit-midi-status">
            <span className="dialkit-midi-status-label">{MIDI_CONTROLLER_DESCRIPTION}</span>
          </div>

          {snapshot.inputs.length > 0 && (
            <div className="dialkit-midi-devices" role="radiogroup" aria-label="MIDI controllers">
              {snapshot.inputs.map((input) => {
                const active = input.id === snapshot.activeInputId;
                return (
                  <label
                    key={input.id}
                    className="dialkit-midi-device"
                    data-active={String(active)}
                  >
                    <input
                      className="dialkit-midi-device-radio"
                      type="radio"
                      name={`${dropdownId}-controller`}
                      value={input.id}
                      checked={active}
                      onChange={() => controller.selectInput(input.id)}
                    />
                    <span className="dialkit-midi-device-dot" aria-hidden="true" />
                    <span className="dialkit-midi-device-name">
                      {midiInputDisplayName(input) ?? 'MIDI controller'}
                    </span>
                    {active && (
                      <svg className="dialkit-midi-device-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={ICON_CHECK} />
                      </svg>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {view.action && (
            <button className="dialkit-button dialkit-midi-cta" onClick={() => { void requestAccess(); }}>
              <span>{view.actionLabel}</span>
            </button>
          )}

          {snapshot.status === 'connected' && snapshot.inputs.length > 0 && (
            <button
              className="dialkit-button dialkit-midi-cta"
              disabled={!snapshot.activeInputId}
              onClick={enterMapMode}
            >
              Map parameters
            </button>
          )}

          {mappings.length > 0 && (
            <div className="dialkit-midi-list">
              {mappings.map((binding) => (
                <div key={binding.id} className="dialkit-midi-item">
                  <span className="dialkit-midi-name">
                    {(() => {
                      const panel = DialStore.getPanel(binding.panelId);
                      const label = panel ? findControlLabel(panel.controls, binding.path) : binding.path;
                      return panel ? `${panel.name} · ${label}` : label;
                    })()}
                  </span>
                  <span className="dialkit-midi-cc">CC {binding.cc}</span>
                  <button
                    className="dialkit-midi-delete"
                    onClick={() => controller.unbindTarget(binding.panelId, binding.path)}
                    title="Remove mapping"
                    aria-label="Remove mapping"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {ICON_TRASH.map((d, i) => (<path key={i} d={d} />))}
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="dialkit-midi-hint">
            {view.connected
              ? snapshot.activeInputId
                ? 'Active controller selected.'
                : 'Select a controller to continue.'
              : 'Allow access to detect MIDI controllers.'}
          </div>
        </motion.div>,
        document.body
      )}
    </>
  );
}
