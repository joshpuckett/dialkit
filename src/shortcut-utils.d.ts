import type { ControlMeta, ShortcutConfig } from './store/DialStore';
export declare function decimalsForStep(step: number): number;
export declare function roundValue(val: number, step: number): number;
export declare function getEffectiveStep(control: ControlMeta, shortcut: ShortcutConfig): number;
export declare function applySliderDelta(panelId: string, path: string, control: ControlMeta, effectiveStep: number, direction: number): void;
export declare function snapToDecile(rawValue: number, min: number, max: number): number;
export declare function isInputFocused(): boolean;
export declare function getActiveModifier(e: KeyboardEvent | WheelEvent | MouseEvent): 'alt' | 'shift' | 'meta' | undefined;
export declare function findControl(controls: ControlMeta[], path: string): ControlMeta | null;
export declare const DRAG_SENSITIVITY = 4;
export declare function formatInteractionLabel(interaction: string): string;
export declare function formatSliderShortcut(sc: ShortcutConfig): string;
export declare function formatToggleShortcut(sc: ShortcutConfig): string;
//# sourceMappingURL=shortcut-utils.d.ts.map