import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

type SelectOption = string | { value: string; label: string };

interface SelectControlProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

function normalizeOptions(options: SelectOption[]): { value: string; label: string }[] {
  return options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );
}

export function SelectControl({ label, value, options, onChange }: SelectControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const normalized = normalizeOptions(options);
  const selectedOption = normalized.find((o) => o.value === value);

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

  return (
    <div ref={containerRef} className="dialkit-select-row">
      <button
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
            <path d="M6 9.5L12 15.5L18 9.5" />
          </motion.svg>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="dialkit-select-dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
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
      </AnimatePresence>
    </div>
  );
}
