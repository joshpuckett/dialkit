import { useState, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { DialStore, Preset } from '../store/DialStore';
import { useFloatingDropdown } from '../hooks/useFloatingDropdown';
import { ICON_CHEVRON, ICON_TRASH } from '../icons';

interface PresetManagerProps {
  panelId: string;
  presets: Preset[];
  activePresetId: string | null;
  onAdd: () => void;
}

export function PresetManager({ panelId, presets, activePresetId, onAdd }: PresetManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const baseId = useId();
  const { triggerRef, floatingRef } = useFloatingDropdown<HTMLButtonElement, HTMLDivElement>(isOpen, {
    placement: 'bottom-start',
    matchWidth: true,
  });

  const hasPresets = presets.length > 0;
  const activePreset = presets.find((p) => p.id === activePresetId);

  // Flat selectable list: the implicit "Version 1" (no preset) plus each preset.
  const items: { id: string | null; name: string }[] = [
    { id: null, name: 'Version 1' },
    ...presets.map((p) => ({ id: p.id, name: p.name })),
  ];
  const selectedIndex = Math.max(0, items.findIndex((it) => it.id === activePresetId));
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const close = useCallback(() => setIsOpen(false), []);

  const openMenu = useCallback((toIndex: number) => {
    if (!hasPresets) return;
    setActiveIndex(toIndex);
    setIsOpen(true);
    // macOS Safari/Firefox don't focus a <button> on click — force it so the
    // trigger's key handler receives arrow keys.
    triggerRef.current?.focus();
  }, [hasPresets, triggerRef]);

  const handleSelect = useCallback((presetId: string | null) => {
    if (presetId) {
      DialStore.loadPreset(panelId, presetId);
    } else {
      DialStore.clearActivePreset(panelId);
    }
    close();
  }, [panelId, close]);

  // Keep the active item scrolled into view.
  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(selectedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(items.length - 1);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) handleSelect(items[activeIndex].id);
        break;
      case 'Delete':
      case 'Backspace': {
        const target = items[activeIndex];
        if (target?.id) {
          e.preventDefault();
          DialStore.deletePreset(panelId, target.id);
          setActiveIndex((i) => Math.max(0, i - 1));
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  };

  // Close when focus leaves the trigger.
  const handleTriggerBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (floatingRef.current?.contains(next)) return;
    close();
  };

  // Close on mousedown outside trigger + dropdown.
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        floatingRef.current?.contains(target)
      ) return;
      close();
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close, triggerRef, floatingRef]);

  const handleDelete = (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    DialStore.deletePreset(panelId, presetId);
  };

  return (
    <div className="dialkit-preset-manager">
      <button
        ref={triggerRef}
        className="dialkit-preset-trigger"
        onClick={() => (isOpen ? close() : openMenu(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
        onBlur={handleTriggerBlur}
        data-open={String(isOpen)}
        data-has-preset={String(!!activePreset)}
        data-disabled={String(!hasPresets)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${baseId}-listbox` : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
          animate={{ rotate: isOpen ? 180 : 0, opacity: hasPresets ? 0.6 : 0.25 }}
          transition={{ type: 'spring', visualDuration: 0.2, bounce: 0.15 }}
        >
          <path d={ICON_CHEVRON} />
        </motion.svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={floatingRef}
              id={`${baseId}-listbox`}
              className="dialkit-root dialkit-preset-dropdown"
              role="listbox"
              style={{ position: 'fixed', top: 0, left: 0 }}
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97, pointerEvents: 'none' as any }}
              transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
            >
              {items.map((item, index) => (
                <div
                  key={item.id ?? '__none__'}
                  id={optionId(index)}
                  className="dialkit-preset-item"
                  role="option"
                  aria-selected={index === selectedIndex}
                  data-active={String(index === activeIndex)}
                  data-selected={String(index === selectedIndex)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(item.id)}
                >
                  <span className="dialkit-preset-name">{item.name}</span>
                  {item.id && (
                    <button
                      className="dialkit-preset-delete"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => handleDelete(e, item.id!)}
                      title="Delete preset"
                      tabIndex={-1}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {ICON_TRASH.map((d, i) => (
                          <path key={i} d={d} />
                        ))}
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
