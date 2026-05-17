export declare const SHORTCUT_CTX: unique symbol;
export interface ShortcutContextValue {
    activePanelId: string | null;
    activePath: string | null;
}
import type { Snippet } from 'svelte';
type $$ComponentProps = {
    children?: Snippet;
};
declare const ShortcutListener: import("svelte").Component<$$ComponentProps, {}, "">;
type ShortcutListener = ReturnType<typeof ShortcutListener>;
export default ShortcutListener;
//# sourceMappingURL=ShortcutListener.svelte.d.ts.map