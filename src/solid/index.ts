// Core API
export { createDialKit, createDialKitController } from './createDialKit';
export type { CreateDialOptions, DialKitController } from './createDialKit';

// Timeline
export { createDialTimeline } from './createDialTimeline';
export type { CreateDialTimelineOptions } from './createDialTimeline';
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

// Root component
export { DialRoot } from './components/DialRoot';
export type { DialPosition, DialMode, DialTheme } from './components/DialRoot';
export { DialTimeline } from './components/Timeline/DialTimeline';
export type { DialTimelineProps } from './components/Timeline/DialTimeline';

// Component exports
export { Slider } from './components/Slider';
export { Toggle } from './components/Toggle';
export { Folder } from './components/Folder';
export { RootPanel } from './components/RootPanel';
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
export { MidiMenu } from './components/MidiMenu';

// Store exports
export { DialStore } from '../store/DialStore';
export type {
  SpringConfig,
  EasingConfig,
  TransitionConfig,
  ActionConfig,
  SelectConfig,
  ColorConfig,
  TextConfig,
  ShortcutConfig,
  Preset,
  DialValue,
  DialConfig,
  DialKitPersistOptions,
  DialKitValueUpdates,
  ResolvedValues,
  ControlMeta,
  PanelConfig,
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
