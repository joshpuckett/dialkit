interface MonitorControlProps {
    label: string;
    value: string | number | boolean | undefined;
}

export function MonitorControl({ label, value }: MonitorControlProps) {
    const displayValue = value === undefined ? '–' : String(value);

    return (
        <div className="dialkit-monitor-control">
            <span className="dialkit-monitor-label">{label}</span>
            <span className="dialkit-monitor-value">{displayValue}</span>
        </div>
    );
}
