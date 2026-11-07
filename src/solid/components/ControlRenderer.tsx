import { createMemo, For } from 'solid-js';
import { DialStore } from '../../store/DialStore';
import type {
  ControlMeta,
  DialValue,
  TransitionConfig,
} from '../../store/DialStore';
import { useShortcutContext } from './ShortcutListener';
import { ColorControl } from './ColorControl';
import { ImageControl } from './ImageControl';
import { DialPad } from './DialPad';
import type { DialPadValue } from '../../dial-pad';
import { Folder } from './Folder';
import { SelectControl } from './SelectControl';
import { Slider } from './Slider';
import { TextControl } from './TextControl';
import { Toggle } from './Toggle';
import { TransitionControl, type TransitionDurationControl } from './TransitionControl';

interface ControlRendererProps {
  panelId: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
  transitionDuration?: TransitionDurationControl;
}

const controlKey = (control: ControlMeta) => `${control.type}:${control.path}`;

export function ControlRenderer(props: ControlRendererProps) {
  const shortcut = useShortcutContext();

  // Keyed by path and type, not identity: DialStore.updatePanel replaces every
  // ControlMeta, and controls keep their state through a config change.
  const renderControls = (controls: () => ControlMeta[]) => {
    const keys = createMemo(() => controls().map(controlKey));
    return (
      <For each={keys()}>
        {(key) => renderControl(() => controls().find((control) => controlKey(control) === key)!)}
      </For>
    );
  };

  const renderControl = (control: () => ControlMeta) => {
    const { path, type } = control();
    // updatePanel notifies with the new values before it publishes the new control
    // list, and Solid flushes between the two, so a removed control can read nothing.
    let lastValue = props.values[path];
    const value = () => (lastValue = props.values[path] ?? lastValue);
    const shortcutActive = () => shortcut().activePanelId === props.panelId && shortcut().activePath === path;
    const update = (next: DialValue) => DialStore.updateValue(props.panelId, path, next);
    switch (type) {
      case 'slider':
        return (
          <Slider
            label={control().label}
            value={value() as number}
            onChange={update}
            min={control().min}
            max={control().max}
            step={control().step}
            shortcut={control().shortcut}
            shortcutActive={shortcutActive()}
          />
        );
      case 'toggle':
        return (
          <Toggle
            label={control().label}
            checked={value() as boolean}
            onChange={update}
            shortcut={control().shortcut}
            shortcutActive={shortcutActive()}
          />
        );
      case 'transition':
        return (
          <TransitionControl
            panelId={props.panelId}
            path={path}
            label={control().label}
            value={value() as TransitionConfig}
            onChange={update}
            durationControl={props.transitionDuration}
          />
        );
      case 'folder':
        return (
          <Folder title={control().label} defaultOpen={control().defaultOpen ?? true}>
            {renderControls(() => control().children ?? [])}
          </Folder>
        );
      case 'text':
        return (
          <TextControl
            label={control().label}
            value={value() as string}
            onChange={update}
            placeholder={control().placeholder}
          />
        );
      case 'select':
        return (
          <SelectControl
            label={control().label}
            value={value() as string}
            options={control().options ?? []}
            onChange={update}
          />
        );
      case 'color':
        return (
          <ColorControl
            label={control().label}
            value={value() as string}
            onChange={update}
          />
        );
      case 'image':
        return (
          <ImageControl
            options={control().options}
            label={control().label}
            value={value() as string}
            onChange={update}
          />
        );
      case 'pad':
        return (
          <DialPad
            label={control().label}
            value={value() as DialPadValue}
            x={control().pad?.x}
            y={control().pad?.y}
            labels={control().pad?.labels}
            onChange={update}
          />
        );
      case 'action':
        return (
          <button class="dialkit-button" onClick={() => DialStore.triggerAction(props.panelId, path)}>
            {control().label}
          </button>
        );
      default:
        return null;
    }
  };

  return <>{renderControls(() => props.controls)}</>;
}
