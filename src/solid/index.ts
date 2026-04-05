// Core API
export { createDialKit } from './createDialKit';
export type { CreateDialOptions } from './createDialKit';

// Root component
export { DialRoot } from './components/DialRoot';
export type { DialPosition, DialMode } from './components/DialRoot';

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
  ActionConfig,
  SelectConfig,
  ColorConfig,
  TextConfig,
  ShortcutConfig,
  Preset,
  DialValue,
  DialConfig,
  ResolvedValues,
  ControlMeta,
  PanelConfig,
} from '../store/DialStore';
