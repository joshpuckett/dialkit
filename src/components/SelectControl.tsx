import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';

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

const OPTION_HEIGHT_PX = 33; // must match .dialkit-select-option height in theme.css
const DROPDOWN_PADDING_PX = 8; // 4px top + 4px bottom
const DROPDOWN_MAX_HEIGHT_PX = 240;

export function SelectControl({ label, value, options, onChange }: SelectControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [pos, setPos] = useState({ top: 0, bottom: 0, left: 0, width: 0 });
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const selectedOption = normalized.find((o) => o.value === value);

  const calculatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const gap = 4;
    const dropdownEstimatedHeight = Math.min(
      normalized.length * OPTION_HEIGHT_PX + DROPDOWN_PADDING_PX,
      DROPDOWN_MAX_HEIGHT_PX
    );
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openBelow = spaceBelow >= dropdownEstimatedHeight || spaceBelow >= spaceAbove;

    setPlacement(openBelow ? 'below' : 'above');
    setPos({
      top: rect.bottom + gap,
      bottom: window.innerHeight - rect.top + gap,
      left: rect.left,
      width: rect.width,
    });
  }, [normalized.length]);

  const close = useCallback(() => setIsOpen(false), []);

  const open = useCallback(() => {
    calculatePosition();
    setIsOpen(true);
  }, [calculatePosition]);

  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      close();
    };

    const handleScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      close();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  return (
    <>
      <div className="dialkit-select-row">
        <button
          ref={triggerRef}
          className="dialkit-select-trigger"
          onClick={toggle}
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
              <path d="M6 9.5L12 15.5L18 9.5" />
            </motion.svg>
          </div>
        </button>
      </div>

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              className="dialkit-select-dropdown"
              style={
                placement === 'below'
                  ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width }
                  : { position: 'fixed', bottom: pos.bottom, left: pos.left, width: pos.width }
              }
              initial={{
                opacity: 0,
                y: placement === 'below' ? 4 : -4,
                scale: 0.97,
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: placement === 'below' ? 4 : -4,
                scale: 0.97,
                pointerEvents: 'none' as any,
              }}
              transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
            >
              {normalized.map((option) => (
                <button
                  key={option.value}
                  className="dialkit-select-option"
                  data-selected={String(option.value === value)}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
