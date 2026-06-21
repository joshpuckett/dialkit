// Core API
export { createDialKit, createDialKitController } from './createDialKit';
export type { CreateDialOptions, DialKitController } from './createDialKit';

// Root component
export { DialRoot } from './components/DialRoot';
export type { DialPosition, DialMode, DialTheme } from './components/DialRoot';

// Component exports
export { Slider } from './components/Slider';
export { Toggle } from './components/Toggle';
export { Folder } from './components/Folder';
export { ButtonGroup } from './components/ButtonGroup';
export { SpringControl } from './components/SpringControl';
export { SpringVisualization } from './components/SpringVisualization';
export { TextControl } from './components/TextControl';
export { SelectControl } from './components/SelectControl';
export { ColorControl } from './components/ColorControl';
export { PresetManager } from './components/PresetManager';

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
