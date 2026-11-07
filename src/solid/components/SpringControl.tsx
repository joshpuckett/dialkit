import { createEffect, createMemo } from 'solid-js';
import { isPhysicsSpring, SPRING_DEFAULTS } from '../../store/DialStore';
import type { SpringConfig } from '../../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { SpringVisualization } from './SpringVisualization';

interface SpringControlProps {
  panelId: string;
  path: string;
  label: string;
  spring: SpringConfig;
  onChange: (spring: SpringConfig) => void;
}

export function SpringControl(props: SpringControlProps) {
  // Read from the value: a store subscription can fire before the prop updates.
  const mode = createMemo<'simple' | 'advanced'>(() => (isPhysicsSpring(props.spring) ? 'advanced' : 'simple'));

  const isSimpleMode = () => mode() === 'simple';

  // Cache per-mode values so switching back restores previous edits
  const cache: {
    simple: SpringConfig;
    advanced: SpringConfig;
  } = {
    simple: props.spring.visualDuration !== undefined ? props.spring : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: props.spring.stiffness !== undefined ? props.spring : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  };

  createEffect(() => {
    const spring = props.spring;
    if (isPhysicsSpring(spring)) cache.advanced = spring;
    else cache.simple = spring;
  });

  const handleModeChange = (newMode: 'simple' | 'advanced') => props.onChange(cache[newMode]);

  const handleUpdate = (key: keyof SpringConfig, value: number) => {
    if (isSimpleMode()) {
      const { stiffness, damping, mass, ...rest } = props.spring;
      props.onChange({ ...rest, [key]: value });
    } else {
      const { visualDuration, bounce, ...rest } = props.spring;
      props.onChange({ ...rest, [key]: value });
    }
  };

  return (
    <Folder title={props.label} defaultOpen={true}>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <SpringVisualization spring={props.spring} isSimpleMode={isSimpleMode()} />

        <div class="dialkit-labeled-control">
          <span class="dialkit-labeled-control-label">Type</span>
          <SegmentedControl
            options={[
              { value: 'simple' as const, label: 'Time' },
              { value: 'advanced' as const, label: 'Physics' },
            ]}
            value={mode()}
            onChange={handleModeChange}
          />
        </div>

        {isSimpleMode() ? (
          <>
            <Slider
              label="Duration"
              value={props.spring.visualDuration ?? SPRING_DEFAULTS.visualDuration}
              onChange={(v) => handleUpdate('visualDuration', v)}
              min={0.1}
              max={1}
              step={0.05}
              unit="s"
            />
            <Slider
              label="Bounce"
              value={props.spring.bounce ?? SPRING_DEFAULTS.bounce}
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
              value={props.spring.stiffness ?? SPRING_DEFAULTS.stiffness}
              onChange={(v) => handleUpdate('stiffness', v)}
              min={1}
              max={1000}
              step={10}
            />
            <Slider
              label="Damping"
              value={props.spring.damping ?? SPRING_DEFAULTS.damping}
              onChange={(v) => handleUpdate('damping', v)}
              min={1}
              max={100}
              step={1}
            />
            <Slider
              label="Mass"
              value={props.spring.mass ?? SPRING_DEFAULTS.mass}
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
