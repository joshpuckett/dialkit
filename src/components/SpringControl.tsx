import { SpringConfig, DialStore, isPhysicsSpring, SPRING_DEFAULTS } from '../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { SpringVisualization } from './SpringVisualization';
import { useCallback, useRef, useSyncExternalStore } from 'react';

interface SpringControlProps {
  panelId: string;
  path: string;
  label: string;
  spring: SpringConfig;
  onChange: (spring: SpringConfig) => void;
}

export function SpringControl({ panelId, path, label, spring, onChange }: SpringControlProps) {
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
    simple: !isPhysicsSpring(spring) ? spring : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: isPhysicsSpring(spring) ? spring : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  });

  if (isSimpleMode) {
    cache.current.simple = spring;
  } else {
    cache.current.advanced = spring;
  }

  const handleModeChange = (newMode: 'simple' | 'advanced') => {
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
              value={spring.visualDuration ?? SPRING_DEFAULTS.visualDuration}
              onChange={(v) => handleUpdate('visualDuration', v)}
              min={0.1}
              max={1}
              step={0.05}
              unit="s"
            />
            <Slider
              label="Bounce"
              value={spring.bounce ?? SPRING_DEFAULTS.bounce}
              onChange={(v) => handleUpdate('bounce', v)}
              min={0}
              max={1}
              step={0.05}
            />
          </>
        ) : (
          <>
            <Slider
              label="Stiffness"
              value={spring.stiffness ?? SPRING_DEFAULTS.stiffness}
              onChange={(v) => handleUpdate('stiffness', v)}
              min={1}
              max={1000}
              step={10}
            />
            <Slider
              label="Damping"
              value={spring.damping ?? SPRING_DEFAULTS.damping}
              onChange={(v) => handleUpdate('damping', v)}
              min={1}
              max={100}
              step={1}
            />
            <Slider
              label="Mass"
              value={spring.mass ?? SPRING_DEFAULTS.mass}
              onChange={(v) => handleUpdate('mass', v)}
              min={0.1}
              max={10}
              step={0.1}
            />
          </>
        )}
      </div>
    </Folder>
  );
}
