import { useContext, useSyncExternalStore } from 'react';
import { DialStore, ControlMeta, DialValue, SpringConfig, TransitionConfig } from '../store/DialStore';
import { midiTargetBadge } from '../midi';
import type { MidiController, MidiBadgeState, MidiControllerSnapshot, MidiMappingOwner } from '../midi';
import { ShortcutContext } from './ShortcutListener';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { Toggle } from './Toggle';
import { SpringControl } from './SpringControl';
import { TransitionControl } from './TransitionControl';
import { TextControl } from './TextControl';
import { SelectControl } from './SelectControl';
import { ColorControl } from './ColorControl';

interface ControlRendererProps {
  panelId: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
  /** Optional MIDI controller — when present, compatible controls gain mapping badges. */
  midi?: MidiController;
  /** Stable owner for mapping sessions initiated by badges in this root. */
  midiOwner?: MidiMappingOwner;
  /** Optional timeline-owned duration rendered inside the transition editor. */
  transitionDuration?: {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  };
}

const NOOP_SUBSCRIBE = () => () => undefined;
const NULL_SNAPSHOT = (): MidiControllerSnapshot | null => null;

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

function MidiBadge({
  controller,
  panelId,
  path,
  state,
  cc,
  active,
  ownerToken,
}: {
  controller: MidiController;
  panelId: string;
  path: string;
  state: MidiBadgeState;
  cc: number | null;
  active: boolean;
  ownerToken?: MidiMappingOwner;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'listening') {
      controller.cancelLearn();
      return;
    }
    if (state === 'bound' && (!controller.getSnapshot().mapping || ownerToken)) {
      controller.startMapping(undefined, ownerToken);
    }
    const inputId = controller.getSnapshot().activeInputId ?? undefined;
    controller.learn({ panelId, path }, { inputId }).catch(() => undefined);
  };
  return (
    <button
      type="button"
      className="dialkit-midi-pill"
      data-state={state}
      data-active={String(active)}
      title={badgeTitle[state]}
      aria-label={badgeTitle[state]}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={onClick}
    >
      {state === 'bound' ? <span className="dialkit-midi-live-dot" /> : badgeText[state](cc)}
    </button>
  );
}

// Renders a ControlMeta tree with the standard DialKit controls.
// Shared by the panel and the timeline clip popover.
export function ControlRenderer({ panelId, controls, values, midi, midiOwner, transitionDuration }: ControlRendererProps) {
  const shortcutCtx = useContext(ShortcutContext);
  const midiSnapshot = useSyncExternalStore(
    midi ? midi.subscribe : NOOP_SUBSCRIBE,
    midi ? midi.getSnapshot : NULL_SNAPSHOT,
    midi ? midi.getSnapshot : NULL_SNAPSHOT,
  );

  const renderMidiBadge = (path: string) => {
    if (!midi || !midiSnapshot || !midi.canMapTarget(panelId, path)) return undefined;
    const badge = midiTargetBadge(midiSnapshot, panelId, path);
    if (!badge) return undefined;
    const binding = midi.getBindingForTarget(panelId, path);
    const bindingIsLive = binding?.inputId
      ? midiSnapshot.inputs.some((input) => input.id === binding.inputId)
      : midiSnapshot.inputs.length > 0;
    return (
      <MidiBadge
        controller={midi}
        panelId={panelId}
        path={path}
        state={badge.state}
        cc={badge.cc}
        active={badge.state === 'bound' && midiSnapshot.status === 'connected' && bindingIsLive}
        ownerToken={midiOwner}
      />
    );
  };

  const renderControl = (control: ControlMeta) => {
    const value = values[control.path];

    switch (control.type) {
      case 'slider':
        return (
          <Slider
            key={control.path}
            label={control.label}
            value={value as number}
            onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
            min={control.min}
            max={control.max}
            step={control.step}
            shortcut={control.shortcut}
            shortcutActive={shortcutCtx.activePanelId === panelId && shortcutCtx.activePath === control.path}
            midiSlot={renderMidiBadge(control.path)}
          />
        );

      case 'toggle':
        return (
          <Toggle
            key={control.path}
            label={control.label}
            checked={value as boolean}
            onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
            shortcut={control.shortcut}
            shortcutActive={shortcutCtx.activePanelId === panelId && shortcutCtx.activePath === control.path}
            midiSlot={renderMidiBadge(control.path)}
          />
        );

      case 'spring':
        return (
          <SpringControl
            key={control.path}
            panelId={panelId}
            path={control.path}
            label={control.label}
            spring={value as SpringConfig}
            onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
            midiSlot={renderMidiBadge}
          />
        );

      case 'transition':
        return (
          <TransitionControl
            key={control.path}
            panelId={panelId}
            path={control.path}
            label={control.label}
            value={value as TransitionConfig}
            onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
            durationControl={transitionDuration}
            midiSlot={renderMidiBadge}
          />
        );

      case 'folder':
        return (
          <Folder key={control.path} title={control.label} defaultOpen={control.defaultOpen ?? true}>
            {control.children?.map(renderControl)}
          </Folder>
        );

      case 'text':
        return (
          <TextControl
            key={control.path}
            label={control.label}
            value={value as string}
            onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
            placeholder={control.placeholder}
          />
        );

      case 'select':
        return (
          <SelectControl
            key={control.path}
            label={control.label}
            value={value as string}
            options={control.options ?? []}
            onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
            midiSlot={(control.options?.length ?? 0) > 1 ? renderMidiBadge(control.path) : undefined}
          />
        );

      case 'color':
        return (
          <ColorControl
            key={control.path}
            label={control.label}
            value={value as string}
            onChange={(v) => DialStore.updateValue(panelId, control.path, v)}
          />
        );

      case 'action': {
        const midiSlot = renderMidiBadge(control.path);
        return (
          <div key={control.path} className="dialkit-midi-action-target">
            <button
              type="button"
              className="dialkit-button dialkit-midi-action-control"
              onClick={() => DialStore.triggerAction(panelId, control.path)}
            >
              {control.label}
            </button>
            {midiSlot}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return <>{controls.map(renderControl)}</>;
}
