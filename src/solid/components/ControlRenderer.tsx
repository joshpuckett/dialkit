import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { DialStore } from '../../store/DialStore';
import type {
  ControlMeta,
  DialValue,
  SpringConfig,
  TransitionConfig,
} from '../../store/DialStore';
import type { MidiController, MidiControllerSnapshot, MidiMappingOwner } from '../../midi';
import { useShortcutContext } from './ShortcutListener';
import { ColorControl } from './ColorControl';
import { Folder } from './Folder';
import { MidiBadge } from './MidiBadge';
import { SelectControl } from './SelectControl';
import { Slider } from './Slider';
import { SpringControl } from './SpringControl';
import { TextControl } from './TextControl';
import { Toggle } from './Toggle';
import { TransitionControl, type TransitionDurationControl } from './TransitionControl';

interface ControlRendererProps {
  panelId: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
  /** Optional MIDI controller — when present, numeric controls gain mapping badges. */
  midi?: MidiController;
  midiOwner?: MidiMappingOwner;
  transitionDuration?: TransitionDurationControl;
}

export function ControlRenderer(props: ControlRendererProps) {
  const shortcut = useShortcutContext();
  const [midiSnapshot, setMidiSnapshot] = createSignal<MidiControllerSnapshot | null>(
    props.midi?.getSnapshot() ?? null
  );
  createEffect(() => {
    const controller = props.midi;
    if (!controller) {
      setMidiSnapshot(null);
      return;
    }
    setMidiSnapshot(controller.getSnapshot());
    const unsubscribe = controller.subscribe(() => setMidiSnapshot(controller.getSnapshot()));
    onCleanup(unsubscribe);
  });

  const renderMidiBadge = (path: string) => props.midi?.canMapTarget(props.panelId, path) ? (
    <MidiBadge
      controller={props.midi}
      panelId={props.panelId}
      path={path}
      snapshot={midiSnapshot()}
      ownerToken={props.midiOwner}
    />
  ) : undefined;

  const renderControl = (control: ControlMeta) => {
    const value = () => props.values[control.path];
    switch (control.type) {
      case 'slider':
        return (
          <Slider
            label={control.label}
            value={value() as number}
            onChange={(next) => DialStore.updateValue(props.panelId, control.path, next)}
            min={control.min}
            max={control.max}
            step={control.step}
            shortcut={control.shortcut}
            shortcutActive={shortcut().activePanelId === props.panelId && shortcut().activePath === control.path}
            midiSlot={renderMidiBadge(control.path)}
          />
        );
      case 'toggle':
        return (
          <Toggle
            label={control.label}
            checked={value() as boolean}
            onChange={(next) => DialStore.updateValue(props.panelId, control.path, next)}
            shortcut={control.shortcut}
            shortcutActive={shortcut().activePanelId === props.panelId && shortcut().activePath === control.path}
            midiSlot={renderMidiBadge(control.path)}
          />
        );
      case 'spring':
        return (
          <SpringControl
            panelId={props.panelId}
            path={control.path}
            label={control.label}
            spring={value() as SpringConfig}
            onChange={(next) => DialStore.updateValue(props.panelId, control.path, next)}
            midiSlot={renderMidiBadge}
          />
        );
      case 'transition':
        return (
          <TransitionControl
            panelId={props.panelId}
            path={control.path}
            label={control.label}
            value={value() as TransitionConfig}
            onChange={(next) => DialStore.updateValue(props.panelId, control.path, next)}
            durationControl={props.transitionDuration}
            midiSlot={renderMidiBadge}
          />
        );
      case 'folder':
        return (
          <Folder title={control.label} defaultOpen={control.defaultOpen ?? true}>
            <For each={control.children ?? []}>{renderControl}</For>
          </Folder>
        );
      case 'text':
        return (
          <TextControl
            label={control.label}
            value={value() as string}
            onChange={(next) => DialStore.updateValue(props.panelId, control.path, next)}
            placeholder={control.placeholder}
          />
        );
      case 'select':
        return (
          <SelectControl
            label={control.label}
            value={value() as string}
            options={control.options ?? []}
            onChange={(next) => DialStore.updateValue(props.panelId, control.path, next)}
            midiSlot={(control.options?.length ?? 0) > 1 ? renderMidiBadge(control.path) : undefined}
          />
        );
      case 'color':
        return (
          <ColorControl
            label={control.label}
            value={value() as string}
            onChange={(next) => DialStore.updateValue(props.panelId, control.path, next)}
          />
        );
      case 'action': {
        const midiSlot = renderMidiBadge(control.path);
        return (
          <div class="dialkit-midi-action-target">
            <button
              type="button"
              class="dialkit-button dialkit-midi-action-control"
              onClick={() => DialStore.triggerAction(props.panelId, control.path)}
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

  return <For each={props.controls}>{renderControl}</For>;
}
