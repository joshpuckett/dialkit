import * as vue from 'vue';
import { ComputedRef, ObjectDirective, InjectionKey, Ref, PropType, h } from 'vue';

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
declare function useDialKit<T extends DialConfig>(name: string, config: T, options?: UseDialOptions): ComputedRef<ResolvedValues<T>>;

type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
type DialMode = 'popover' | 'inline';
type DialTheme = 'light' | 'dark' | 'system';
declare const DialRoot: vue.DefineComponent<vue.ExtractPropTypes<{
    position: {
        type: () => DialPosition;
        default: string;
    };
    defaultOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    mode: {
        type: () => DialMode;
        default: string;
    };
    theme: {
        type: () => DialTheme;
        default: string;
    };
    productionEnabled: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}> | null, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    position: {
        type: () => DialPosition;
        default: string;
    };
    defaultOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    mode: {
        type: () => DialMode;
        default: string;
    };
    theme: {
        type: () => DialTheme;
        default: string;
    };
    productionEnabled: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{}>, {
    mode: DialMode;
    defaultOpen: boolean;
    position: DialPosition;
    theme: DialTheme;
    productionEnabled: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

interface DialKitDirectiveOptions {
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
}
type DialKitDirectiveValue = DialMode | DialKitDirectiveOptions | undefined;
declare const vDialKit: ObjectDirective<HTMLElement, DialKitDirectiveValue>;

interface ShortcutState {
    activePanelId: Ref<string | null>;
    activePath: Ref<string | null>;
}
declare const ShortcutKey: InjectionKey<ShortcutState>;
declare function useShortcutContext(): ShortcutState;
declare const ShortcutListener: vue.DefineComponent<{}, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>[] | undefined, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<{}> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const ShortcutsMenu: vue.DefineComponent<vue.ExtractPropTypes<{
    panelId: {
        type: PropType<string>;
        required: true;
    };
}>, () => (vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}> | null)[] | null, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    panelId: {
        type: PropType<string>;
        required: true;
    };
}>> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const Slider: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: NumberConstructor;
        required: true;
    };
    min: {
        type: NumberConstructor;
        required: false;
    };
    max: {
        type: NumberConstructor;
        required: false;
    };
    step: {
        type: NumberConstructor;
        required: false;
    };
    unit: {
        type: StringConstructor;
        required: false;
    };
    shortcut: {
        type: PropType<ShortcutConfig>;
        default: undefined;
    };
    shortcutActive: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "change"[], "change", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: NumberConstructor;
        required: true;
    };
    min: {
        type: NumberConstructor;
        required: false;
    };
    max: {
        type: NumberConstructor;
        required: false;
    };
    step: {
        type: NumberConstructor;
        required: false;
    };
    unit: {
        type: StringConstructor;
        required: false;
    };
    shortcut: {
        type: PropType<ShortcutConfig>;
        default: undefined;
    };
    shortcutActive: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
}>, {
    shortcut: ShortcutConfig;
    shortcutActive: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const Toggle: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    checked: {
        type: BooleanConstructor;
        required: true;
    };
    shortcut: {
        type: PropType<ShortcutConfig>;
        default: undefined;
    };
    shortcutActive: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "change"[], "change", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    checked: {
        type: BooleanConstructor;
        required: true;
    };
    shortcut: {
        type: PropType<ShortcutConfig>;
        default: undefined;
    };
    shortcutActive: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
}>, {
    shortcut: ShortcutConfig;
    shortcutActive: boolean;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const Folder: vue.DefineComponent<vue.ExtractPropTypes<{
    title: {
        type: StringConstructor;
        required: true;
    };
    defaultOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    isRoot: {
        type: BooleanConstructor;
        default: boolean;
    };
    inline: {
        type: BooleanConstructor;
        default: boolean;
    };
    toolbar: {
        type: PropType<(() => ReturnType<typeof h>) | null>;
        required: false;
        default: null;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "openChange"[], "openChange", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    title: {
        type: StringConstructor;
        required: true;
    };
    defaultOpen: {
        type: BooleanConstructor;
        default: boolean;
    };
    isRoot: {
        type: BooleanConstructor;
        default: boolean;
    };
    inline: {
        type: BooleanConstructor;
        default: boolean;
    };
    toolbar: {
        type: PropType<(() => ReturnType<typeof h>) | null>;
        required: false;
        default: null;
    };
}>> & Readonly<{
    onOpenChange?: ((...args: any[]) => any) | undefined;
}>, {
    defaultOpen: boolean;
    isRoot: boolean;
    inline: boolean;
    toolbar: (() => ReturnType<typeof h>) | null;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

type ButtonGroupButton = {
    label: string;
    onClick: () => void;
};
declare const ButtonGroup: vue.DefineComponent<vue.ExtractPropTypes<{
    buttons: {
        type: PropType<ButtonGroupButton[]>;
        required: true;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    buttons: {
        type: PropType<ButtonGroupButton[]>;
        required: true;
    };
}>> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const SpringControl: vue.DefineComponent<vue.ExtractPropTypes<{
    panelId: {
        type: StringConstructor;
        required: true;
    };
    path: {
        type: StringConstructor;
        required: true;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    spring: {
        type: PropType<SpringConfig>;
        required: true;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "change"[], "change", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    panelId: {
        type: StringConstructor;
        required: true;
    };
    path: {
        type: StringConstructor;
        required: true;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    spring: {
        type: PropType<SpringConfig>;
        required: true;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const SpringVisualization: vue.DefineComponent<vue.ExtractPropTypes<{
    spring: {
        type: PropType<SpringConfig>;
        required: true;
    };
    isSimpleMode: {
        type: BooleanConstructor;
        required: true;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    spring: {
        type: PropType<SpringConfig>;
        required: true;
    };
    isSimpleMode: {
        type: BooleanConstructor;
        required: true;
    };
}>> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const TransitionControl: vue.DefineComponent<vue.ExtractPropTypes<{
    panelId: {
        type: StringConstructor;
        required: true;
    };
    path: {
        type: StringConstructor;
        required: true;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: PropType<TransitionConfig>;
        required: true;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "change"[], "change", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    panelId: {
        type: StringConstructor;
        required: true;
    };
    path: {
        type: StringConstructor;
        required: true;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: PropType<TransitionConfig>;
        required: true;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const EasingVisualization: vue.DefineComponent<vue.ExtractPropTypes<{
    easing: {
        type: PropType<EasingConfig>;
        required: true;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    easing: {
        type: PropType<EasingConfig>;
        required: true;
    };
}>> & Readonly<{}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const TextControl: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: StringConstructor;
        required: true;
    };
    placeholder: {
        type: StringConstructor;
        required: false;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "change"[], "change", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: StringConstructor;
        required: true;
    };
    placeholder: {
        type: StringConstructor;
        required: false;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

type SelectOption = string | {
    value: string;
    label: string;
};
declare const SelectControl: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: StringConstructor;
        required: true;
    };
    options: {
        type: PropType<SelectOption[]>;
        required: true;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "change"[], "change", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: StringConstructor;
        required: true;
    };
    options: {
        type: PropType<SelectOption[]>;
        required: true;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const ColorControl: vue.DefineComponent<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: StringConstructor;
        required: true;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, "change"[], "change", vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    value: {
        type: StringConstructor;
        required: true;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
}>, {}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

declare const PresetManager: vue.DefineComponent<vue.ExtractPropTypes<{
    panelId: {
        type: StringConstructor;
        required: true;
    };
    presets: {
        type: PropType<Preset[]>;
        required: true;
    };
    activePresetId: {
        type: PropType<string | null>;
        required: false;
        default: null;
    };
}>, () => vue.VNode<vue.RendererNode, vue.RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, {}, string, vue.PublicProps, Readonly<vue.ExtractPropTypes<{
    panelId: {
        type: StringConstructor;
        required: true;
    };
    presets: {
        type: PropType<Preset[]>;
        required: true;
    };
    activePresetId: {
        type: PropType<string | null>;
        required: false;
        default: null;
    };
}>> & Readonly<{}>, {
    activePresetId: string | null;
}, {}, {}, {}, string, vue.ComponentProvideOptions, true, {}, any>;

export { type ActionConfig, ButtonGroup, type ColorConfig, ColorControl, type ControlMeta, type ControlWithVisibility, type DialConfig, type DialKitDirectiveOptions, type DialKitDirectiveValue, type DialMode, type DialPosition, DialRoot, DialStore, type DialTheme, type DialValue, type EasingConfig, EasingVisualization, Folder, type PanelConfig, type Preset, PresetManager, type ResolvedValues, type SelectConfig, SelectControl, type ShortcutConfig, ShortcutKey, ShortcutListener, type ShortcutState, ShortcutsMenu, Slider, type SpringConfig, SpringControl, SpringVisualization, type TextConfig, TextControl, Toggle, type TransitionConfig, TransitionControl, type UseDialOptions, type VisibleWhen, type VisibleWhenValue, unwrapVisibility, useDialKit, useShortcutContext, vDialKit, withVisibility };
