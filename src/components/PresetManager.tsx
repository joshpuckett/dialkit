import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DialStore, Preset } from '../store/DialStore';

interface PresetManagerProps {
  panelId: string;
  presets: Preset[];
  activePresetId: string | null;
  onAdd: () => void;
}

export function PresetManager({ panelId, presets, activePresetId, onAdd }: PresetManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activePreset = presets.find((p) => p.id === activePresetId);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleDelete = (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    DialStore.deletePreset(panelId, presetId);
  };

  return (
    <div ref={containerRef} className="dialkit-preset-manager">
      <button
        className="dialkit-preset-trigger"
        onClick={() => presets.length > 0 && setIsOpen(!isOpen)}
        data-open={String(isOpen)}
        data-has-preset={String(!!activePreset)}
        data-disabled={String(presets.length === 0)}
      >
        <span className="dialkit-preset-label">
          {activePreset ? activePreset.name : 'Version 1'}
        </span>
        <motion.svg
          className="dialkit-select-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: 'spring', visualDuration: 0.2, bounce: 0.15 }}
        >
          <path d="M6 9.5L12 15.5L18 9.5" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="dialkit-preset-dropdown"
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
          >
            {/* Default option */}
            <div
              className="dialkit-preset-item"
              data-active={String(!activePresetId)}
              onClick={() => {
                DialStore.clearActivePreset(panelId);
                setIsOpen(false);
              }}
            >
              <span className="dialkit-preset-name">Version 1</span>
            </div>

            {presets.map((preset) => (
              <div
                key={preset.id}
                className="dialkit-preset-item"
                data-active={String(preset.id === activePresetId)}
                onClick={() => {
                  DialStore.loadPreset(panelId, preset.id);
                  setIsOpen(false);
                }}
              >
                <span className="dialkit-preset-name">{preset.name}</span>
                <button
                  className="dialkit-preset-delete"
                  onClick={(e) => handleDelete(e, preset.id)}
                  title="Delete preset"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
