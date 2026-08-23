import { SpringConfig, EasingConfig, TransitionConfig, DialStore } from '../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { SpringVisualization } from './SpringVisualization';
import { EasingVisualization } from './EasingVisualization';
import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

interface TransitionControlProps {
  panelId: string;
  path: string;
  label: string;
  value: TransitionConfig;
  onChange: (value: TransitionConfig) => void;
  /** Hide duration sliders when something else owns the duration (e.g. a timeline clip bar). */
  hideDuration?: boolean;
  /** Route duration edits through an external owner while keeping this control's layout. */
  durationControl?: {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  };
  midiSlot?: (path: string) => ReactNode;
}

type CurveMode = 'easing' | 'simple' | 'advanced';

export function TransitionControl({
  panelId,
  path,
  label,
  value,
  onChange,
  hideDuration = false,
  durationControl,
  midiSlot,
}: TransitionControlProps) {
  const subscribe = useCallback(
    (callback: () => void) => DialStore.subscribe(panelId, callback),
    [panelId]
  );
  const getSnapshot = useCallback(
    () => DialStore.getTransitionMode(panelId, path),
    [panelId, path]
  );
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isEasing = mode === 'easing';
  const isSimpleSpring = mode === 'simple';

  // Cache per-mode values so switching back restores previous edits
  const cache = useRef<{
    easing: EasingConfig;
    simple: SpringConfig;
    advanced: SpringConfig;
  }>({
    easing: value.type === 'easing' ? value : { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] },
    simple: value.type === 'spring' && value.visualDuration !== undefined ? value : { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
    advanced: value.type === 'spring' && value.stiffness !== undefined ? value : { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
  });

  // Keep cache up to date with current edits
  if (isEasing && value.type === 'easing') {
    cache.current.easing = value;
  } else if (isSimpleSpring && value.type === 'spring') {
    cache.current.simple = value;
  } else if (mode === 'advanced' && value.type === 'spring') {
    cache.current.advanced = value;
  }

  const spring: SpringConfig = value.type === 'spring' ? value : cache.current.simple;
  const easing: EasingConfig = value.type === 'easing' ? value : cache.current.easing;

  const handleModeChange = (newMode: CurveMode) => {
    DialStore.updateTransitionMode(panelId, path, newMode);

    if (newMode === 'easing') {
      onChange(cache.current.easing);
    } else if (newMode === 'simple') {
      onChange(cache.current.simple);
    } else {
      onChange(cache.current.advanced);
    }
  };

  const handleSpringUpdate = (key: keyof SpringConfig, val: number) => {
    if (isSimpleSpring) {
      const { stiffness, damping, mass, ...rest } = spring;
      onChange({ ...rest, [key]: val });
    } else {
      const { visualDuration, bounce, ...rest } = spring;
      onChange({ ...rest, [key]: val });
    }
  };

  const updateEase = (index: number, val: number) => {
    const newEase = [...easing.ease] as [number, number, number, number];
    newEase[index] = val;
    onChange({ ...easing, ease: newEase });
  };

  const durationSlider = !hideDuration && (isEasing || isSimpleSpring) ? (
    <Slider
      label="Duration"
      value={durationControl?.value ?? (isEasing ? easing.duration : spring.visualDuration ?? 0.3)}
      onChange={durationControl?.onChange ?? ((next) => {
        if (isEasing) onChange({ ...easing, duration: next });
        else handleSpringUpdate('visualDuration', next);
      })}
      min={durationControl?.min ?? 0.1}
      max={durationControl?.max ?? (isEasing ? 2 : 1)}
      step={durationControl?.step ?? 0.05}
      unit="s"
      midiSlot={midiSlot?.(`${path}.duration`)}
    />
  ) : null;

  return (
    <Folder title={label} defaultOpen={true}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isEasing ? (
          <EasingVisualization easing={easing} />
        ) : (
          <SpringVisualization spring={spring} isSimpleMode={isSimpleSpring} />
        )}

        <div className="dialkit-labeled-control">
          <span className="dialkit-labeled-control-label">Type</span>
          <SegmentedControl
            options={[
              { value: 'easing' as const, label: 'Easing' },
              { value: 'simple' as const, label: 'Time' },
              { value: 'advanced' as const, label: 'Physics' },
            ]}
            value={mode}
            onChange={handleModeChange}
          />
        </div>

        {isEasing ? (
          <>
            <Slider label="x1" value={easing.ease[0]} onChange={(v) => updateEase(0, v)} min={0} max={1} step={0.01} midiSlot={midiSlot?.(`${path}.x1`)} />
            <Slider label="y1" value={easing.ease[1]} onChange={(v) => updateEase(1, v)} min={-1} max={2} step={0.01} midiSlot={midiSlot?.(`${path}.y1`)} />
            <Slider label="x2" value={easing.ease[2]} onChange={(v) => updateEase(2, v)} min={0} max={1} step={0.01} midiSlot={midiSlot?.(`${path}.x2`)} />
            <Slider label="y2" value={easing.ease[3]} onChange={(v) => updateEase(3, v)} min={-1} max={2} step={0.01} midiSlot={midiSlot?.(`${path}.y2`)} />
            <EaseTextInput ease={easing.ease} onChange={(newEase) => onChange({ ...easing, ease: newEase })} />
          </>
        ) : isSimpleSpring ? (
          <Slider label="Bounce" value={spring.bounce ?? 0.2} onChange={(v) => handleSpringUpdate('bounce', v)} min={0} max={1} step={0.05} midiSlot={midiSlot?.(`${path}.bounce`)} />
        ) : (
          <>
            <Slider label="Stiffness" value={spring.stiffness ?? 400} onChange={(v) => handleSpringUpdate('stiffness', v)} min={1} max={1000} step={10} midiSlot={midiSlot?.(`${path}.stiffness`)} />
            <Slider label="Damping" value={spring.damping ?? 17} onChange={(v) => handleSpringUpdate('damping', v)} min={1} max={100} step={1} midiSlot={midiSlot?.(`${path}.damping`)} />
            <Slider label="Mass" value={spring.mass ?? 1} onChange={(v) => handleSpringUpdate('mass', v)} min={0.1} max={10} step={0.1} midiSlot={midiSlot?.(`${path}.mass`)} />
          </>
        )}
        {durationSlider}
      </div>
    </Folder>
  );
}

function formatEase(ease: [number, number, number, number]): string {
  return ease.map(v => parseFloat(v.toFixed(2))).join(', ');
}

function parseEase(str: string): [number, number, number, number] | null {
  const parts = str.split(',').map(s => parseFloat(s.trim()));
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    return parts as [number, number, number, number];
  }
  return null;
}

function EaseTextInput({ ease, onChange }: { ease: [number, number, number, number]; onChange: (ease: [number, number, number, number]) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const handleFocus = () => {
    setDraft(formatEase(ease));
    setEditing(true);
  };

  const handleBlur = () => {
    const parsed = parseEase(draft);
    if (parsed) onChange(parsed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="dialkit-labeled-control">
      <span className="dialkit-labeled-control-label">Ease</span>
      <input
        type="text"
        className="dialkit-text-input"
        value={editing ? draft : formatEase(ease)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />
    </div>
  );
}
