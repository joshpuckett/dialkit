import { useState, useCallback, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DialStore, ControlMeta, DialValue, PanelConfig, SpringConfig } from '../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { Toggle } from './Toggle';
import { SpringControl } from './SpringControl';
import { TextControl } from './TextControl';
import { SelectControl } from './SelectControl';
import { ColorControl } from './ColorControl';
import { MonitorControl } from './MonitorControl';
import { ControlWrapper } from './ControlWrapper';
import { PresetManager } from './PresetManager';

interface PanelProps {
  panel: PanelConfig;
}

export function Panel({ panel }: PanelProps) {
  const [copied, setCopied] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Subscribe to preset changes only — not value changes
  const presetSnapshot = useSyncExternalStore(
    (cb) => DialStore.subscribePresets(panel.id, cb),
    () => DialStore.getPresetSnapshot(panel.id),
    () => DialStore.getPresetSnapshot(panel.id)
  );
  const presets = presetSnapshot.presets;
  const activePresetId = presetSnapshot.activeId;

  const handleAddPreset = () => {
    const nextNum = presets.length + 2;
    DialStore.savePreset(panel.id, `Version ${nextNum}`);
  };

  const handleCopy = () => {
    // Read values lazily at click time — no subscription needed
    const currentValues = DialStore.getValues(panel.id);
    const jsonStr = JSON.stringify(currentValues, null, 2);

    const instruction = `Update the useDialKit configuration for "${panel.name}" with these values:

\`\`\`json
${jsonStr}
\`\`\`

Apply these values as the new defaults in the useDialKit call.`;

    navigator.clipboard.writeText(instruction);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderControl = useCallback((control: ControlMeta, value: DialValue | undefined) => {
    switch (control.type) {
      case 'slider':
        return (
          <Slider
            label={control.label}
            value={value as number}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
            min={control.min}
            max={control.max}
            step={control.step}
          />
        );

      case 'toggle':
        return (
          <Toggle
            label={control.label}
            checked={value as boolean}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'spring':
        return (
          <SpringControl
            panelId={panel.id}
            path={control.path}
            label={control.label}
            spring={value as SpringConfig}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'folder':
        return (
          <Folder key={control.path} title={control.label}>
            {control.children?.map(child => (
              <ControlWrapper
                key={child.path}
                panelId={panel.id}
                control={child}
                renderControl={renderControl}
              />
            ))}
          </Folder>
        );

      case 'text':
        return (
          <TextControl
            label={control.label}
            value={value as string}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
            placeholder={control.placeholder}
          />
        );

      case 'select':
        return (
          <SelectControl
            label={control.label}
            value={value as string}
            options={control.options ?? []}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'color':
        return (
          <ColorControl
            label={control.label}
            value={value as string}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'monitor':
        return (
          <MonitorControl
            label={control.label}
            value={value as string | number | boolean | undefined}
          />
        );

      default:
        return null;
    }
  }, [panel.id]);

  // Group consecutive actions together
  const renderControls = () => {
    const result: React.ReactNode[] = [];
    let i = 0;

    while (i < panel.controls.length) {
      const control = panel.controls[i];

      if (control.type === 'action') {
        result.push(
          <button
            key={control.path}
            className="dialkit-button"
            onClick={() => DialStore.triggerAction(panel.id, control.path)}
          >
            {control.label}
          </button>
        );
      } else if (control.type === 'folder') {
        result.push(renderControl(control, undefined));
      } else {
        result.push(
          <ControlWrapper
            key={control.path}
            panelId={panel.id}
            control={control}
            renderControl={renderControl}
          />
        );
      }

      i++;
    }

    return result;
  };

  const iconTransition = { type: 'spring' as const, visualDuration: 0.4, bounce: 0.1 };

  const toolbar = (
    <>
      <button
        className="dialkit-toolbar-add"
        onClick={handleAddPreset}
        title="Add preset"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6H20" />
          <path d="M4 12H10" />
          <path d="M15 15L21 15" />
          <path d="M18 12V18" />
          <path d="M4 18H10" />
        </svg>
      </button>

      <PresetManager
        panelId={panel.id}
        presets={presets}
        activePresetId={activePresetId}
        onAdd={handleAddPreset}
      />

      <button
        className="dialkit-toolbar-copy"
        onClick={handleCopy}
        title="Copy parameters"
      >
        <span className="dialkit-toolbar-copy-icon-wrap">
          <AnimatePresence mode="popLayout">
            {copied ? (
              <motion.svg
                key="check"
                className="dialkit-toolbar-copy-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ scale: 0.5, opacity: 0, filter: 'blur(4px)' }}
                animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                exit={{ scale: 0.5, opacity: 0, filter: 'blur(4px)' }}
                transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.2 }}
              >
                <path d="M5 12.75L10 19L19 5" />
              </motion.svg>
            ) : (
              <motion.svg
                key="clipboard"
                className="dialkit-toolbar-copy-icon"
                viewBox="0 0 24 24"
                fill="none"
                initial={{ scale: 0.5, opacity: 0, filter: 'blur(4px)' }}
                animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                exit={{ scale: 0.5, opacity: 0, filter: 'blur(4px)' }}
                transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.2 }}
              >
                <path d="M8 6C8 4.34315 9.34315 3 11 3H13C14.6569 3 16 4.34315 16 6V7H8V6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M19.2405 16.1852L18.5436 14.3733C18.4571 14.1484 18.241 14 18 14C17.759 14 17.5429 14.1484 17.4564 14.3733L16.7595 16.1852C16.658 16.4493 16.4493 16.658 16.1852 16.7595L14.3733 17.4564C14.1484 17.5429 14 17.759 14 18C14 18.241 14.1484 18.4571 14.3733 18.5436L16.1852 19.2405C16.4493 19.342 16.658 19.5507 16.7595 19.8148L17.4564 21.6267C17.5429 21.8516 17.759 22 18 22C18.241 22 18.4571 21.8516 18.5436 21.6267L19.2405 19.8148C19.342 19.5507 19.5507 19.342 19.8148 19.2405L21.6267 18.5436C21.8516 18.4571 22 18.241 22 18C22 17.759 21.8516 17.5429 21.6267 17.4564L19.8148 16.7595C19.5507 16.658 19.342 16.4493 19.2405 16.1852Z" fill="currentColor" />
                <path d="M16 5H17C18.6569 5 20 6.34315 20 8V11M8 5H7C5.34315 5 4 6.34315 4 8V18C4 19.6569 5.34315 21 7 21H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
        Copy
      </button>
    </>
  );

  return (
    <div className="dialkit-panel-wrapper">
      <Folder title={panel.name} defaultOpen={true} isRoot={true} onOpenChange={setIsPanelOpen} toolbar={toolbar}>
        {renderControls()}
      </Folder>
    </div>
  );
}
