import { SpringConfig, DialStore } from '../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { SpringVisualization } from './SpringVisualization';
import { useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react';

interface SpringControlProps {
  panelId: string;
  path: string;
  label: string;
  spring: SpringConfig;
  onChange: (spring: SpringConfig) => void;
  midiSlot?: (path: string) => ReactNode;
}

export function SpringControl({ panelId, path, label, spring, onChange, midiSlot }: SpringControlProps) {
  const subscribe = useCallback(
    (callback: () => void) => DialStore.subscribe(panelId, callback),
    [panelId]
  );
  const getSnapshot = useCallback(
    () => DialStore.getSpringMode(panelId, path),
    [panelId, path]
  );
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isSimpleMode = mode === 'simple';

  // Cache per-mode values so switching back restores previous edits
  const cache = useRef<{
    simple: SpringConfig;
    advanced: SpringConfig;
  }>({
    simple: spring.visualDuration !== undefined ? spring : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: spring.stiffness !== undefined ? spring : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  });

  if (isSimpleMode) {
    cache.current.simple = spring;
  } else {
    cache.current.advanced = spring;
  }

  const handleModeChange = (newMode: 'simple' | 'advanced') => {
    DialStore.updateSpringMode(panelId, path, newMode);

    if (newMode === 'simple') {
      onChange(cache.current.simple);
    } else {
      onChange(cache.current.advanced);
    }
  };

  const handleUpdate = (key: keyof SpringConfig, value: number) => {
    // When updating in simple mode, ensure physics props are removed
    if (isSimpleMode) {
      const { stiffness, damping, mass, ...rest } = spring;
      onChange({ ...rest, [key]: value });
    } else {
      // When updating in physics mode, ensure time-based props are removed
      const { visualDuration, bounce, ...rest } = spring;
      onChange({ ...rest, [key]: value });
    }
  };

  return (
    <Folder title={label} defaultOpen={true}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SpringVisualization spring={spring} isSimpleMode={isSimpleMode} />

        <div className="dialkit-labeled-control">
          <span className="dialkit-labeled-control-label">Type</span>
          <SegmentedControl
            options={[
              { value: 'simple' as const, label: 'Time' },
              { value: 'advanced' as const, label: 'Physics' },
            ]}
            value={mode}
            onChange={handleModeChange}
          />
        </div>

        {isSimpleMode ? (
          <>
            <Slider
              label="Duration"
              value={spring.visualDuration ?? 0.3}
              onChange={(v) => handleUpdate('visualDuration', v)}
              min={0.1}
              max={1}
              step={0.05}
              unit="s"
              midiSlot={midiSlot?.(`${path}.duration`)}
            />
            <Slider
              label="Bounce"
              value={spring.bounce ?? 0.2}
              onChange={(v) => handleUpdate('bounce', v)}
              min={0}
              max={1}
              step={0.05}
              midiSlot={midiSlot?.(`${path}.bounce`)}
            />
          </>
        ) : (
          <>
            <Slider
              label="Stiffness"
              value={spring.stiffness ?? 400}
              onChange={(v) => handleUpdate('stiffness', v)}
              min={1}
              max={1000}
              step={10}
              midiSlot={midiSlot?.(`${path}.stiffness`)}
            />
            <Slider
              label="Damping"
              value={spring.damping ?? 17}
              onChange={(v) => handleUpdate('damping', v)}
              min={1}
              max={100}
              step={1}
              midiSlot={midiSlot?.(`${path}.damping`)}
            />
            <Slider
              label="Mass"
              value={spring.mass ?? 1}
              onChange={(v) => handleUpdate('mass', v)}
              min={0.1}
              max={10}
              step={0.1}
              midiSlot={midiSlot?.(`${path}.mass`)}
            />
          </>
        )}
      </div>
    </Folder>
  );
}
