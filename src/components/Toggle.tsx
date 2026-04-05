import { SegmentedControl } from './SegmentedControl';
import type { ShortcutConfig } from '../store/DialStore';
import { formatToggleShortcut } from '../shortcut-utils';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  shortcut?: ShortcutConfig;
  shortcutActive?: boolean;
}

export function Toggle({ label, checked, onChange, shortcut, shortcutActive }: ToggleProps) {
  return (
    <div className="dialkit-labeled-control">
      <span className="dialkit-labeled-control-label">
        {label}
        {shortcut && (
          <span className={`dialkit-shortcut-pill${shortcutActive ? ' dialkit-shortcut-pill-active' : ''}`}>
            {formatToggleShortcut(shortcut)}
          </span>
        )}
      </span>
      <SegmentedControl
        options={[
          { value: 'off' as const, label: 'Off' },
          { value: 'on' as const, label: 'On' },
        ]}
        value={checked ? 'on' : 'off'}
        onChange={(val) => onChange(val === 'on')}
      />
    </div>
  );
}
