// Main hook
export { useDialKit, useDialKitController } from './hooks/useDialKit';
export type { DialKitController, UseDialOptions } from './hooks/useDialKit';

// Root component (user mounts once)
export { DialRoot } from './components/DialRoot';
export type { DialPosition, DialMode, DialTheme } from './components/DialRoot';

// Timeline (prototype)
export { useDialTimeline } from './hooks/useDialTimeline';
export type {
  TimelineClipConfig,
  TimelineClipCss,
  TimelineClipLoop,
  TimelineConfig,
  TimelineClipValues,
  TimelineGroupConfig,
  TimelineGroupValues,
  TimelinePropConfig,
  TimelinePropStepConfig,
  TimelineStepConfig,
  TimelineStepValues,
  DialTimelineValues,
  UseDialTimelineOptions,
} from './hooks/useDialTimeline';
export { DialTimeline } from './components/Timeline/DialTimeline';
export type { DialTimelineProps } from './components/Timeline/DialTimeline';
export { formatClock } from './timeline-core';
export { TimelineStore } from './store/TimelineStore';
export type {
  TimelineMeta,
  TimelineClipMeta,
  TimelineClipTrackMeta,
  TimelineTransport,
} from './store/TimelineStore';

// Individual components (for advanced usage)
export { ControlRenderer } from './components/ControlRenderer';
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
export { ShortcutsMenu } from './components/ShortcutsMenu';
export { MidiMenu } from './components/MidiMenu';

// Store (for advanced usage)
export { DialStore } from './store/DialStore';
export type {
  SpringConfig,
  EasingConfig,
  TransitionConfig,
  ActionConfig,
  SelectConfig,
  ColorConfig,
  TextConfig,
  DialKitPersistOptions,
  ShortcutConfig,
  ShortcutMode,
  ShortcutInteraction,
  Preset,
  DialValue,
  DialConfig,
  DialKitValueUpdates,
  ResolvedValues,
  ControlMeta,
  PanelConfig,
} from './store/DialStore';

// Framework-neutral Web MIDI mapping
export {
  createMidiController,
  getSharedMidiController,
  midiConnectionView,
  midiInputDisplayName,
  midiTargetBadge,
  MidiLearnCancelledError,
  scaleMidiValue,
} from './midi';
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
} from './midi';
