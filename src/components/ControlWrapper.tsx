import { memo, useSyncExternalStore } from 'react';
import { DialStore, ControlMeta, DialValue } from '../store/DialStore';

interface ControlWrapperProps {
    panelId: string;
    control: ControlMeta;
    renderControl: (control: ControlMeta, value: DialValue | undefined) => React.ReactNode;
}

export const ControlWrapper = memo(function ControlWrapper({ panelId, control, renderControl }: ControlWrapperProps) {
    const value = useSyncExternalStore(
        (cb) => DialStore.subscribePath(panelId, control.path, cb),
        () => DialStore.getValueSnapshot(panelId, control.path),
        () => DialStore.getValueSnapshot(panelId, control.path)
    );

    return renderControl(control, value);
});
