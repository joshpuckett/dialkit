import { createSignal, onMount, onCleanup } from 'solid-js';
import { DialStore } from '../../store/DialStore';
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
  const [mode, setMode] = createSignal<'simple' | 'advanced'>(
    DialStore.getSpringMode(props.panelId, props.path)
  );

  // Subscribe to store changes for mode
  onMount(() => {
    const unsub = DialStore.subscribe(props.panelId, () => {
      setMode(DialStore.getSpringMode(props.panelId, props.path));
    });
    onCleanup(unsub);
  });

  const isSimpleMode = () => mode() === 'simple';

  const cache: {
    simple: SpringConfig;
    advanced: SpringConfig;
  } = {
    simple: props.spring.visualDuration !== undefined ? props.spring : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: props.spring.stiffness !== undefined ? props.spring : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  };

  const handleModeChange = (newMode: 'simple' | 'advanced') => {
    // Save current mode's values before switching
    if (isSimpleMode()) {
      cache.simple = props.spring;
    } else {
      cache.advanced = props.spring;
    }

    DialStore.updateSpringMode(props.panelId, props.path, newMode);

    if (newMode === 'simple') {
      props.onChange(cache.simple);
    } else {
      props.onChange(cache.advanced);
    }
  };

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
              value={props.spring.visualDuration ?? 0.3}
              onChange={(v) => handleUpdate('visualDuration', v)}
              min={0.1}
              max={1}
              step={0.05}
              unit="s"
            />
            <Slider
              label="Bounce"
              value={props.spring.bounce ?? 0.2}
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
              value={props.spring.stiffness ?? 400}
              onChange={(v) => handleUpdate('stiffness', v)}
              min={1}
              max={1000}
              step={10}
            />
            <Slider
              label="Damping"
              value={props.spring.damping ?? 17}
              onChange={(v) => handleUpdate('damping', v)}
              min={1}
              max={100}
              step={1}
            />
            <Slider
              label="Mass"
              value={props.spring.mass ?? 1}
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
