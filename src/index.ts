// Main hook
export { useDialKit } from './hooks/useDialKit';
export type { UseDialOptions, UseDialResult } from './hooks/useDialKit';

// Root component (user mounts once)
export { DialRoot } from './components/DialRoot';
export type { DialPosition } from './components/DialRoot';

// Individual components (for advanced usage)
export { Slider } from './components/Slider';
export { Toggle } from './components/Toggle';
export { Folder } from './components/Folder';
export { ButtonGroup } from './components/ButtonGroup';
export { SpringControl } from './components/SpringControl';
export { SpringVisualization } from './components/SpringVisualization';
export { TextControl } from './components/TextControl';
export { SelectControl } from './components/SelectControl';
export { ColorControl } from './components/ColorControl';
export { MonitorControl } from './components/MonitorControl';
export { PresetManager } from './components/PresetManager';

// Store (for advanced usage)
export { DialStore } from './store/DialStore';
export type {
  SpringConfig,
  ActionConfig,
  SelectConfig,
  ColorConfig,
  TextConfig,
  MonitorConfig,
  Preset,
  DialValue,
  DialConfig,
  ResolvedValues,
  ControlMeta,
  PanelConfig,
} from './store/DialStore';
