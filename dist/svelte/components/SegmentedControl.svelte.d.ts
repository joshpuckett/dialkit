export interface SegmentedControlOption<T extends string = string> {
    value: T;
    label: string;
}
type $$ComponentProps = {
    options: SegmentedControlOption[];
    value: string;
    onChange: (value: string) => void;
};
declare const SegmentedControl: import("svelte").Component<$$ComponentProps, {}, "">;
type SegmentedControl = ReturnType<typeof SegmentedControl>;
export default SegmentedControl;
//# sourceMappingURL=SegmentedControl.svelte.d.ts.map