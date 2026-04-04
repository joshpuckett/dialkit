import { useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DialStore, ControlMeta, PanelConfig, SpringConfig, TransitionConfig } from '../store/DialStore';
import { ICON_CLIPBOARD, ICON_CHECK, ICON_ADD_PRESET } from '../icons';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { Toggle } from './Toggle';
import { SpringControl } from './SpringControl';
import { TransitionControl } from './TransitionControl';
import { TextControl } from './TextControl';
import { SelectControl } from './SelectControl';
import { ColorControl } from './ColorControl';
import { PresetManager } from './PresetManager';

interface PanelProps {
  panel: PanelConfig;
  defaultOpen?: boolean;
  inline?: boolean;
}

export function Panel({ panel, defaultOpen = true, inline = false }: PanelProps) {
  const [copied, setCopied] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(defaultOpen);

  // Subscribe to panel value changes
  const values = useSyncExternalStore(
    (cb) => DialStore.subscribe(panel.id, cb),
    () => DialStore.getValues(panel.id),
    () => DialStore.getValues(panel.id)
  );

  const presets = DialStore.getPresets(panel.id);
  const activePresetId = DialStore.getActivePresetId(panel.id);

  const handleAddPreset = () => {
    const nextNum = presets.length + 2;
    DialStore.savePreset(panel.id, `Version ${nextNum}`);
  };

  const handleCopy = () => {
    const jsonStr = JSON.stringify(values, null, 2);

    const instruction = `Update the useDialKit configuration for "${panel.name}" with these values:

\`\`\`json
${jsonStr}
\`\`\`

Apply these values as the new defaults in the useDialKit call.`;

    navigator.clipboard.writeText(instruction);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderControl = (control: ControlMeta) => {
    const value = values[control.path];

    switch (control.type) {
      case 'slider':
        return (
          <Slider
            key={control.path}
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
            key={control.path}
            label={control.label}
            checked={value as boolean}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'spring':
        return (
          <SpringControl
            key={control.path}
            panelId={panel.id}
            path={control.path}
            label={control.label}
            spring={value as SpringConfig}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'transition':
        return (
          <TransitionControl
            key={control.path}
            panelId={panel.id}
            path={control.path}
            label={control.label}
            value={value as TransitionConfig}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'folder':
        return (
          <Folder key={control.path} title={control.label} defaultOpen={control.defaultOpen ?? true}>
            {control.children?.map(renderControl)}
          </Folder>
        );

      case 'text':
        return (
          <TextControl
            key={control.path}
            label={control.label}
            value={value as string}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
            placeholder={control.placeholder}
          />
        );

      case 'select':
        return (
          <SelectControl
            key={control.path}
            label={control.label}
            value={value as string}
            options={control.options ?? []}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'color':
        return (
          <ColorControl
            key={control.path}
            label={control.label}
            value={value as string}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'action':
        return (
          <button
            key={control.path}
            className="dialkit-button"
            onClick={() => DialStore.triggerAction(panel.id, control.path)}
          >
            {control.label}
          </button>
        );

      default:
        return null;
    }
  };

  const renderControls = () => {
    return panel.controls.map(renderControl);
  };

  const iconTransition = { type: 'spring' as const, visualDuration: 0.4, bounce: 0.1 };

  const toolbar = (
    <>
      <motion.button
        className="dialkit-toolbar-add"
        onClick={handleAddPreset}
        title="Add preset"
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {ICON_ADD_PRESET.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      </motion.button>

      <PresetManager
        panelId={panel.id}
        presets={presets}
        activePresetId={activePresetId}
        onAdd={handleAddPreset}
      />

      <motion.button
        className="dialkit-toolbar-copy"
        onClick={handleCopy}
        title="Copy parameters"
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
      >
        <span className="dialkit-toolbar-copy-icon-wrap">
          <AnimatePresence initial={false} mode="popLayout">
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
                <path d={ICON_CHECK} />
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
                <path d={ICON_CLIPBOARD.board} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d={ICON_CLIPBOARD.sparkle} fill="currentColor"/>
                <path d={ICON_CLIPBOARD.body} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
        Copy
      </motion.button>
    </>
  );

  return (
    <div className="dialkit-panel-wrapper">
      <Folder title={panel.name} defaultOpen={defaultOpen} isRoot={true} inline={inline} onOpenChange={setIsPanelOpen} toolbar={toolbar}>
        {renderControls()}
      </Folder>
    </div>
  );
}
