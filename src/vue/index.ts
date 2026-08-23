export { useDialKit, useDialKitController } from './useDialKit';
export type { DialKitController, UseDialOptions } from './useDialKit';
export { useDialTimeline } from './useDialTimeline';
export type { UseDialTimelineOptions } from './useDialTimeline';
export type {
  DialTimelineValues,
  TimelineClipConfig,
  TimelineClipCss,
  TimelineClipLoop,
  TimelineClipValues,
  TimelineConfig,
  TimelineGroupConfig,
  TimelineGroupValues,
  TimelinePropConfig,
  TimelinePropStepConfig,
  TimelineStepConfig,
  TimelineStepValues,
} from '../timeline';
export { vDialKit } from './directives/dialkit';
export type { DialKitDirectiveOptions, DialKitDirectiveValue } from './directives/dialkit';

export { DialRoot } from './components/DialRoot';
export type { DialPosition, DialMode, DialTheme } from './components/DialRoot';
export { DialTimeline } from './components/Timeline/DialTimeline';

export { ShortcutListener, useShortcutContext, ShortcutKey } from './components/ShortcutListener';
export type { ShortcutState } from './components/ShortcutListener';
export { ShortcutsMenu } from './components/ShortcutsMenu';
export { MidiMenu } from './components/MidiMenu';

export { Slider } from './components/Slider';
export { Toggle } from './components/Toggle';
export { Folder } from './components/Folder';
export { ButtonGroup } from './components/ButtonGroup';
export { SpringControl } from './components/SpringControl';
export { SpringVisualization } from './components/SpringVisualization';
export { TransitionControl } from './components/TransitionControl';
export { EasingVisualization } from './components/EasingVisualization';
export { TextControl } from './components/TextControl';
export { SelectControl } from './components/SelectControl';
export { ColorControl } from './components/ColorControl';
export { PresetManager } from './components/PresetManager';
export { ControlRenderer } from './components/ControlRenderer';

export { DialStore } from '../store/DialStore';
export type {
  SpringConfig,
  EasingConfig,
  TransitionConfig,
  ActionConfig,
  SelectConfig,
  ColorConfig,
  TextConfig,
  Preset,
  DialValue,
  DialConfig,
  DialKitPersistOptions,
  DialKitValueUpdates,
  ResolvedValues,
  ControlMeta,
  PanelConfig,
  ShortcutConfig,
} from '../store/DialStore';

// Framework-neutral Web MIDI mapping
export {
  createMidiController,
  getSharedMidiController,
  midiConnectionView,
  midiInputDisplayName,
  midiTargetBadge,
  MidiLearnCancelledError,
  scaleMidiValue,
} from '../midi';
export type {
  MidiAccessLike,
  MidiBadgeState,
  MidiBinding,
  MidiBindingOptions,
  MidiConnectionAction,
  MidiController,
  MidiControllerOptions,
  MidiControllerSnapshot,
  MidiInputInfo,
  MidiInputLike,
  MidiLearnSource,
  MidiLearnOptions,
  MidiLearnWarning,
  MidiMappingOwner,
  MidiMappingState,
  MidiMessageEventLike,
  MidiStatus,
} from '../midi';
