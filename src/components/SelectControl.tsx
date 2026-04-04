import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ICON_CHEVRON } from '../icons';

type SelectOption = string | { value: string; label: string };

interface SelectControlProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeOptions(options: SelectOption[]): { value: string; label: string }[] {
  return options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: toTitleCase(opt) } : opt
  );
}

export function SelectControl({ label, value, options, onChange }: SelectControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const normalized = normalizeOptions(options);
  const selectedOption = normalized.find((o) => o.value === value);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Estimate dropdown height: 8px padding + 36px per option
    const dropdownHeight = 8 + normalized.length * 36;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const above = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    setPos({
      top: above ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      above,
    });
  }, [normalized.length]);

  // Resolve portal target (closest .dialkit-root)
  useEffect(() => {
    const root = triggerRef.current?.closest('.dialkit-root') as HTMLElement | null;
    setPortalTarget(root ?? document.body);
  }, []);

  // Position dropdown when opening
  useEffect(() => {
    if (!isOpen) return;
    updatePos();
  }, [isOpen, updatePos]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div className="dialkit-select-row">
      <button
        ref={triggerRef}
        className="dialkit-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
        data-open={String(isOpen)}
      >
        <span className="dialkit-select-label">{label}</span>
        <div className="dialkit-select-right">
          <span className="dialkit-select-value">{selectedOption?.label ?? value}</span>
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
            <path d={ICON_CHEVRON} />
          </motion.svg>
        </div>
      </button>

      {portalTarget && createPortal(
        <AnimatePresence>
          {isOpen && pos && (
            <motion.div
              ref={dropdownRef}
              className="dialkit-select-dropdown"
              initial={{ opacity: 0, y: pos.above ? 8 : -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.above ? 8 : -8, scale: 0.95 }}
              transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
              style={{
                position: 'fixed',
                left: pos.left,
                width: pos.width,
                ...(pos.above
                  ? { bottom: window.innerHeight - pos.top, transformOrigin: 'bottom' }
                  : { top: pos.top, transformOrigin: 'top' }),
              }}
            >
              {normalized.map((option) => (
                <button
                  key={option.value}
                  className="dialkit-select-option"
                  data-selected={String(option.value === value)}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        portalTarget
      )}
    </div>
  );
}
