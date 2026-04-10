import { useState, useContext, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DialStore, ControlMeta, PanelConfig, SpringConfig, TransitionConfig } from '../store/DialStore';
import { CONTROL_ANIM } from './control-motion';
import { ShortcutContext } from './ShortcutListener';
import { ShortcutsMenu } from './ShortcutsMenu';
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
  const shortcutCtx = useContext(ShortcutContext);
  const hasShortcuts = Object.keys(panel.shortcuts).length > 0;

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

  const renderControlInner = (control: ControlMeta) => {
    const value = values[control.path];

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
            shortcut={control.shortcut}
            shortcutActive={shortcutCtx.activePanelId === panel.id && shortcutCtx.activePath === control.path}
          />
        );

      case 'toggle':
        return (
          <Toggle
            label={control.label}
            checked={value as boolean}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
            shortcut={control.shortcut}
            shortcutActive={shortcutCtx.activePanelId === panel.id && shortcutCtx.activePath === control.path}
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

      case 'transition':
        return (
          <TransitionControl
            panelId={panel.id}
            path={control.path}
            label={control.label}
            value={value as TransitionConfig}
            onChange={(v) => DialStore.updateValue(panel.id, control.path, v)}
          />
        );

      case 'folder':
        return (
          <Folder title={control.label} defaultOpen={control.defaultOpen ?? true}>
            <AnimatePresence initial={false}>
              {control.children?.map(renderControl)}
            </AnimatePresence>
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

      case 'action':
        return (
          <button
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

  const renderControl = (control: ControlMeta) => {
    const inner = renderControlInner(control);
    if (inner === null) return null;

    // Every control is wrapped in a motion.div so we can animate its
    // enter/exit when conditional visibility hides/shows it. The marker
    // classes let theme.css target folder wrappers specifically
    // (for the adjacent-divider collapse rule) without needing :has().
    // spring and transition controls render as Folder internally
    const isFolder = control.type === 'folder' || control.type === 'spring' || control.type === 'transition';
    const wrapClassName = isFolder
      ? 'dialkit-control-wrap dialkit-control-wrap-folder'
      : 'dialkit-control-wrap';

    return (
      <motion.div
        key={control.path}
        className={wrapClassName}
        {...CONTROL_ANIM}
      >
        {inner}
      </motion.div>
    );
  };

  const renderControls = () => {
    // AnimatePresence wraps the control list so each control's exit
    // animation runs before unmount. initial={false} disables the
    // first-mount enter animation — the panel appears instantly on open.
    return (
      <AnimatePresence initial={false}>
        {panel.controls.map(renderControl)}
      </AnimatePresence>
    );
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
        className="dialkit-toolbar-add"
        onClick={handleCopy}
        title="Copy parameters"
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
      >
        <span style={{ position: 'relative', width: 16, height: 16 }}>
          <AnimatePresence initial={false} mode="wait">
            {copied ? (
              <motion.svg
                key="check"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', inset: 0, width: 16, height: 16, color: 'var(--dial-text-label)' }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.08 }}
              >
                <path d={ICON_CHECK} />
              </motion.svg>
            ) : (
              <motion.svg
                key="clipboard"
                viewBox="0 0 24 24"
                fill="none"
                style={{ position: 'absolute', inset: 0, width: 16, height: 16, color: 'var(--dial-text-label)' }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.08 }}
              >
                <path d={ICON_CLIPBOARD.board} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d={ICON_CLIPBOARD.sparkle} fill="currentColor"/>
                <path d={ICON_CLIPBOARD.body} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
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
