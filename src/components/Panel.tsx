import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DialStore, PanelConfig } from '../store/DialStore';
import { buildCopyInstruction } from '../copy-instruction';
import { ShortcutsMenu } from './ShortcutsMenu';
import { ICON_CLIPBOARD, ICON_CHECK, ICON_ADD_PRESET } from '../icons';
import { ControlRenderer } from './ControlRenderer';
import { Folder } from './Folder';
import { PresetManager } from './PresetManager';

interface PanelProps {
  panel: PanelConfig;
  defaultOpen?: boolean;
  inline?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'root' | 'section';
  toolbarExtra?: ReactNode;
}

export function Panel({ panel, defaultOpen = true, inline = false, onOpenChange, variant = 'root', toolbarExtra }: PanelProps) {
  const [copied, setCopied] = useState(false);
  const hasShortcuts = Object.keys(panel.shortcuts).length > 0;
  const subscribe = useCallback(
    (callback: () => void) => DialStore.subscribe(panel.id, callback),
    [panel.id]
  );
  const getSnapshot = useCallback(
    () => DialStore.getValues(panel.id),
    [panel.id]
  );
  const getOpenSnapshot = useCallback(
    () => DialStore.getPanelOpen(panel.id),
    [panel.id]
  );

  // Subscribe to panel value changes
  const values = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // The store owns open/collapsed state so it can be driven programmatically.
  const storeOpen = useSyncExternalStore(subscribe, getOpenSnapshot, getOpenSnapshot);
  const isOpen = storeOpen ?? defaultOpen;

  useEffect(() => {
    DialStore.initPanelOpen(panel.id, defaultOpen);
  }, [panel.id, defaultOpen]);

  const presets = DialStore.getPresets(panel.id);
  const activePresetId = DialStore.getActivePresetId(panel.id);

  const handleAddPreset = () => {
    const nextNum = presets.length + 2;
    DialStore.savePreset(panel.id, `Version ${nextNum}`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildCopyInstruction('useDialKit', panel.name, values));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenChange = useCallback((open: boolean) => {
    DialStore.setPanelOpen(panel.id, open);
    onOpenChange?.(open);
  }, [onOpenChange, panel.id]);

  const renderControls = () => (
    <ControlRenderer panelId={panel.id} controls={panel.controls} values={values} />
  );

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

      {toolbarExtra}
    </>
  );

  if (variant === 'section') {
    return (
      <Folder title={panel.name} open={isOpen} onOpenChange={handleOpenChange}>
        <div className="dialkit-panel-section-toolbar" onClick={(e) => e.stopPropagation()}>
          {toolbar}
        </div>
        {renderControls()}
      </Folder>
    );
  }

  return (
    <div className="dialkit-panel-wrapper">
      <Folder title={panel.name} open={isOpen} isRoot={true} inline={inline} onOpenChange={handleOpenChange} toolbar={toolbar}>
        {renderControls()}
      </Folder>
    </div>
  );
}
