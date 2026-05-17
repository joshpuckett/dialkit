export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';
export type DialTheme = 'light' | 'dark' | 'system';
type $$ComponentProps = {
    position?: DialPosition;
    defaultOpen?: boolean;
    mode?: DialMode;
    theme?: DialTheme;
    productionEnabled?: boolean;
};
declare const DialRoot: import("svelte").Component<$$ComponentProps, {}, "">;
type DialRoot = ReturnType<typeof DialRoot>;
export default DialRoot;
//# sourceMappingURL=DialRoot.svelte.d.ts.map