type SelectOption = string | {
    value: string;
    label: string;
};
type $$ComponentProps = {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
};
declare const SelectControl: import("svelte").Component<$$ComponentProps, {}, "">;
type SelectControl = ReturnType<typeof SelectControl>;
export default SelectControl;
//# sourceMappingURL=SelectControl.svelte.d.ts.map