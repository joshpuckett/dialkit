import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';

type SpringConfig = {
    type: 'spring';
    stiffness?: number;
    damping?: number;
    mass?: number;
    visualDuration?: number;
    bounce?: number;
};
type EasingConfig = {
    type: 'easing';
    duration: number;
    ease: [number, number, number, number];
};
type TransitionConfig = SpringConfig | EasingConfig;
type ActionConfig = {
    type: 'action';
    label?: string;
};
type SelectConfig = {
    type: 'select';
    options: (string | {
        value: string;
        label: string;
    })[];
    default?: string;
};
type ColorConfig = {
    type: 'color';
    default?: string;
};
type TextConfig = {
    type: 'text';
    default?: string;
    placeholder?: string;
};
type DialValue = number | boolean | string | SpringConfig | EasingConfig | ActionConfig | SelectConfig | ColorConfig | TextConfig;
type VisibleWhenValue = string | boolean | number;
/**
 * Rule for conditional control visibility. Exactly one of `is` or `not`
 * should be provided — if both are set, only `is` is evaluated.
 */
type VisibleWhen = {
    /**
     * Flat store path of another control in the same panel to watch.
     * Must be the full dot-delimited path as it appears in panel.values
     * (e.g. `"debug.showStats"` for a nested control, not a relative path).
     */
    field: string;
} & ({
    is: VisibleWhenValue | VisibleWhenValue[];
    not?: never;
} | {
    not: VisibleWhenValue | VisibleWhenValue[];
    is?: never;
} | {
    is?: undefined;
    not?: undefined;
});
/**
 * Wraps a control with a visibility rule. The control is only added to the
 * panel's rendered tree when its rule passes. Re-evaluated on every value
 * change. Use the {@link withVisibility} helper instead of building this by hand.
 */
type ControlWithVisibility<T = DialValue | [number, number, number, number?] | DialConfig> = {
    value: T;
    visibleWhen: VisibleWhen;
};
/**
 * Tag any DialKit control with a conditional visibility rule. The control is
 * only shown when `rule` passes against the current panel values.
 *
 * @example
 * const config = {
 *   layoutMode: { type: 'select', options: ['grid', 'sphere'] },
 *   radius: withVisibility([1, 0, 10], { field: 'layoutMode', is: 'sphere' }),
 * };
 */
declare function withVisibility<T extends DialValue | [number, number, number, number?] | DialConfig>(control: T, rule: VisibleWhen): ControlWithVisibility<T>;
/** The union of all value shapes that can appear in a DialConfig entry. */
type DialConfigValue = DialValue | [number, number, number, number?] | DialConfig;
/**
 * Detect and unwrap a `{ value, visibleWhen }` wrapper produced by
 * {@link withVisibility}. Returns the inner value if wrapped, or the
 * original value if not.
 *
 * Exported for use by framework hooks (React, Solid, Svelte, Vue) so
 * they can strip the wrapper when building resolved values without
 * duplicating the detection logic.
 */
declare function unwrapVisibility(raw: unknown): DialConfigValue;
type DialConfig = {
    [key: string]: DialValue | [number, number, number, number?] | DialConfig | ControlWithVisibility;
};
type ResolvedValues<T extends DialConfig> = {
    [K in keyof T]: T[K] extends [number, number, number, number?] ? number : T[K] extends SpringConfig ? TransitionConfig : T[K] extends EasingConfig ? TransitionConfig : T[K] extends SelectConfig ? string : T[K] extends ColorConfig ? string : T[K] extends TextConfig ? string : T[K] extends DialConfig ? ResolvedValues<T[K]> : T[K];
};
type ShortcutMode = 'fine' | 'normal' | 'coarse';
type ShortcutInteraction = 'scroll' | 'drag' | 'move' | 'scroll-only';
type ShortcutConfig = {
    key?: string;
    modifier?: 'alt' | 'shift' | 'meta';
    mode?: ShortcutMode;
    interaction?: ShortcutInteraction;
};
type ControlMeta = {
    type: 'slider' | 'toggle' | 'spring' | 'transition' | 'folder' | 'action' | 'select' | 'color' | 'text';
    path: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    children?: ControlMeta[];
    defaultOpen?: boolean;
    options?: (string | {
        value: string;
        label: string;
    })[];
    placeholder?: string;
    shortcut?: ShortcutConfig;
    /** Conditional visibility rule attached via {@link withVisibility}. */
    visibleWhen?: VisibleWhen;
};
type PanelConfig = {
    id: string;
    name: string;
    controls: ControlMeta[];
    values: Record<string, DialValue>;
    shortcuts: Record<string, ShortcutConfig>;
};
type Listener = () => void;
type ActionListener = (action: string) => void;
type Preset = {
    id: string;
    name: string;
    values: Record<string, DialValue>;
};
declare class DialStoreClass {
    private panels;
    private listeners;
    private globalListeners;
    private snapshots;
    private actionListeners;
    private presets;
    private activePreset;
    private baseValues;
    /**
     * Full (unfiltered) control tree per panel. `panels[id].controls` holds the
     * tree with conditional-visibility controls already filtered out, which is
     * what the UI renders. We keep the unfiltered tree here so visibility can
     * flip back when a dependent value changes.
     */
    private allControls;
    registerPanel(id: string, name: string, config: DialConfig, shortcuts?: Record<string, ShortcutConfig>): void;
    updatePanel(id: string, name: string, config: DialConfig, shortcuts?: Record<string, ShortcutConfig>): void;
    unregisterPanel(id: string): void;
    updateValue(panelId: string, path: string, value: DialValue): void;
    updateSpringMode(panelId: string, path: string, mode: 'simple' | 'advanced'): void;
    getSpringMode(panelId: string, path: string): 'simple' | 'advanced';
    updateTransitionMode(panelId: string, path: string, mode: 'easing' | 'simple' | 'advanced'): void;
    getTransitionMode(panelId: string, path: string): 'easing' | 'simple' | 'advanced';
    getValue(panelId: string, path: string): DialValue | undefined;
    getValues(panelId: string): Record<string, DialValue>;
    getPanels(): PanelConfig[];
    getPanel(id: string): PanelConfig | undefined;
    subscribe(panelId: string, listener: Listener): () => void;
    subscribeGlobal(listener: Listener): () => void;
    subscribeActions(panelId: string, listener: ActionListener): () => void;
    triggerAction(panelId: string, path: string): void;
    savePreset(panelId: string, name: string): string;
    loadPreset(panelId: string, presetId: string): void;
    deletePreset(panelId: string, presetId: string): void;
    getPresets(panelId: string): Preset[];
    getActivePresetId(panelId: string): string | null;
    clearActivePreset(panelId: string): void;
    resolveShortcutTarget(key: string, modifier?: 'alt' | 'shift' | 'meta'): {
        panelId: string;
        path: string;
        control: ControlMeta;
    } | null;
    resolveScrollOnlyTargets(): Array<{
        panelId: string;
        path: string;
        control: ControlMeta;
        shortcut: ShortcutConfig;
    }>;
    private findControlByPath;
    private notify;
    private notifyGlobal;
    private initTransitionModes;
    private parseConfig;
    private flattenValues;
    private isSpringConfig;
    private isEasingConfig;
    private isActionConfig;
    private isSelectConfig;
    private isColorConfig;
    private isTextConfig;
    private isHexColor;
    private formatLabel;
    private inferRange;
    private inferStep;
    private normalizePreservedValue;
    private roundToStep;
    private stepPrecision;
    private mapControlsByPath;
    /**
     * Detects and unwraps a `{ value, visibleWhen }` wrapper produced by
     * {@link withVisibility}. Returns the inner control plus the rule (or
     * `undefined` for `visibleWhen` if the input was not a wrapper).
     */
    private unwrapVisibilityWithRule;
    /** Evaluate a visibility rule against a flat value map. */
    private isVisible;
    /**
     * Recursively filter a control tree by evaluating each control's
     * `visibleWhen` against the current values. Folders that become empty
     * after filtering their children are pruned.
     *
     * KNOWN LIMITATION — folder collapsed state across hide/show cycles:
     * Folder open/closed state lives in `Folder`'s local `useState`, not in
     * the store. When a folder's `visibleWhen` fails, its DOM node unmounts
     * and that local state is lost. Re-showing the folder mounts a fresh
     * instance with `defaultOpen`, so a user-collapsed folder will re-open
     * after a visibility cycle. Sibling visibility changes do NOT trigger
     * this (motion.div keys are stable by path), only the wrapped folder
     * itself hiding. This is a pre-existing architectural constraint of
     * DialKit's folder state model, not introduced by this feature — any
     * mechanism that unmounts a folder would behave the same. Lifting
     * folder state into the store is a possible follow-up.
     */
    private filterByVisibility;
    /**
     * Cheap structural comparison used to decide whether visibility flipped
     * after an updateValue. We only care about the set of visible paths —
     * labels/options/etc can't change between snapshots of the same tree.
     */
    private sameControlPaths;
}
declare const DialStore: DialStoreClass;

interface UseDialOptions {
    onAction?: (action: string) => void;
    shortcuts?: Record<string, ShortcutConfig>;
}
declare function useDialKit<T extends DialConfig>(name: string, config: T, options?: UseDialOptions): ResolvedValues<T>;

type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
type DialMode = 'popover' | 'inline';
type DialTheme = 'light' | 'dark' | 'system';
type FolderMode = 'independent' | 'accordion';
interface DialRootProps {
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
    productionEnabled?: boolean;
    /**
     * First-level folder behavior. `'independent'` (default) keeps each top-level
     * folder open state isolated. `'accordion'` allows only one top-level folder
     * open at a time. Nested folders are unaffected.
     */
    folderMode?: FolderMode;
}
declare function DialRoot({ position, defaultOpen, mode, theme, productionEnabled, folderMode }: DialRootProps): react_jsx_runtime.JSX.Element | null;

interface SliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    shortcut?: ShortcutConfig;
    shortcutActive?: boolean;
}
declare function Slider({ label, value, onChange, min, max, step, unit, shortcut, shortcutActive, }: SliderProps): react_jsx_runtime.JSX.Element;

interface ToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    shortcut?: ShortcutConfig;
    shortcutActive?: boolean;
}
declare function Toggle({ label, checked, onChange, shortcut, shortcutActive }: ToggleProps): react_jsx_runtime.JSX.Element;

interface FolderProps {
    title: string;
    children: ReactNode;
    defaultOpen?: boolean;
    isRoot?: boolean;
    inline?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    toolbar?: ReactNode;
    /**
     * Controlled open state. When provided, the folder derives its open state
     * from this prop instead of internal state, and `onToggle` is called on
     * header clicks instead of mutating local state. Used by `Panel` to drive
     * accordion behavior across first-level folders. Omit for the default
     * uncontrolled behavior.
     */
    open?: boolean;
    /** Toggle handler for controlled mode. Receives the requested next state. */
    onToggle?: (next: boolean) => void;
}
declare function Folder({ title, children, defaultOpen, isRoot, inline, onOpenChange, toolbar, open, onToggle }: FolderProps): react_jsx_runtime.JSX.Element;

interface ButtonGroupProps {
    buttons: Array<{
        label: string;
        onClick: () => void;
    }>;
}
declare function ButtonGroup({ buttons }: ButtonGroupProps): react_jsx_runtime.JSX.Element;

interface SpringControlProps {
    panelId: string;
    path: string;
    label: string;
    spring: SpringConfig;
    onChange: (spring: SpringConfig) => void;
}
declare function SpringControl({ panelId, path, label, spring, onChange }: SpringControlProps): react_jsx_runtime.JSX.Element;

interface SpringVisualizationProps {
    spring: SpringConfig;
    isSimpleMode: boolean;
}
declare function SpringVisualization({ spring, isSimpleMode }: SpringVisualizationProps): react_jsx_runtime.JSX.Element;

interface TransitionControlProps {
    panelId: string;
    path: string;
    label: string;
    value: TransitionConfig;
    onChange: (value: TransitionConfig) => void;
}
declare function TransitionControl({ panelId, path, label, value, onChange }: TransitionControlProps): react_jsx_runtime.JSX.Element;

interface EasingVisualizationProps {
    easing: EasingConfig;
}
declare function EasingVisualization({ easing }: EasingVisualizationProps): react_jsx_runtime.JSX.Element;

interface TextControlProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}
declare function TextControl({ label, value, onChange, placeholder }: TextControlProps): react_jsx_runtime.JSX.Element;

type SelectOption = string | {
    value: string;
    label: string;
};
interface SelectControlProps {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
}
declare function SelectControl({ label, value, options, onChange }: SelectControlProps): react_jsx_runtime.JSX.Element;

interface ColorControlProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
}
declare function ColorControl({ label, value, onChange }: ColorControlProps): react_jsx_runtime.JSX.Element;

interface PresetManagerProps {
    panelId: string;
    presets: Preset[];
    activePresetId: string | null;
    onAdd: () => void;
}
declare function PresetManager({ panelId, presets, activePresetId, onAdd }: PresetManagerProps): react_jsx_runtime.JSX.Element;

interface ShortcutsMenuProps {
    panelId: string;
}
declare function ShortcutsMenu({ panelId }: ShortcutsMenuProps): react_jsx_runtime.JSX.Element | null;

export { type ActionConfig, ButtonGroup, type ColorConfig, ColorControl, type ControlMeta, type ControlWithVisibility, type DialConfig, type DialMode, type DialPosition, DialRoot, DialStore, type DialTheme, type DialValue, type EasingConfig, EasingVisualization, Folder, type FolderMode, type PanelConfig, type Preset, PresetManager, type ResolvedValues, type SelectConfig, SelectControl, type ShortcutConfig, type ShortcutInteraction, type ShortcutMode, ShortcutsMenu, Slider, type SpringConfig, SpringControl, SpringVisualization, type TextConfig, TextControl, Toggle, type TransitionConfig, TransitionControl, type UseDialOptions, type VisibleWhen, type VisibleWhenValue, unwrapVisibility, useDialKit, withVisibility };
