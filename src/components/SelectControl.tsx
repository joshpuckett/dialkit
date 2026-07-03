import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getDialKitPortalRoot } from '../dropdown-position';
import { useFloatingDropdown } from '../hooks/useFloatingDropdown';
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
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const { triggerRef, floatingRef } = useFloatingDropdown<HTMLButtonElement, HTMLDivElement>(isOpen, {
    placement: 'bottom-start',
    matchWidth: true,
  });
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const baseId = useId();
  const normalized = normalizeOptions(options);
  const selectedIndex = normalized.findIndex((o) => o.value === value);
  const selectedOption = normalized[selectedIndex];
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  // Resolve portal target (closest .dialkit-root) so theme vars apply.
  useEffect(() => {
    setPortalTarget(getDialKitPortalRoot(triggerRef.current) ?? document.body);
  }, [triggerRef]);

  // Focus never leaves the trigger — the active option is tracked with
  // aria-activedescendant. This keeps arrow keys off the panel's scroll
  // container and makes blur-to-close trivial (trigger blur = close).
  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex]);

  const openMenu = useCallback((toIndex: number) => {
    setActiveIndex(toIndex);
    setIsOpen(true);
    // macOS Safari/Firefox don't focus a <button> on click, so force it —
    // otherwise arrow keys hit the page instead of the trigger's handler.
    triggerRef.current?.focus();
  }, [triggerRef]);

  const commit = useCallback((index: number) => {
    onChange(normalized[index].value);
    setIsOpen(false);
  }, [normalized, onChange]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(selectedIndex >= 0 ? selectedIndex : 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(selectedIndex >= 0 ? selectedIndex : normalized.length - 1);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % normalized.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + normalized.length) % normalized.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(normalized.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  // Close when focus leaves the trigger (Tab away, or focus moves elsewhere).
  const handleTriggerBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (floatingRef.current?.contains(next)) return;
    setIsOpen(false);
  };

  // Close on click outside (covers clicks on non-focusable areas that don't
  // blur the trigger).
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        floatingRef.current && !floatingRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, triggerRef, floatingRef]);

  return (
    <div className="dialkit-select-row">
      <button
        ref={triggerRef}
        className="dialkit-select-trigger"
        onClick={() => (isOpen ? setIsOpen(false) : openMenu(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={handleTriggerKeyDown}
        onBlur={handleTriggerBlur}
        data-open={String(isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${baseId}-listbox` : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
          {isOpen && (
            <motion.div
              ref={floatingRef}
              id={`${baseId}-listbox`}
              className="dialkit-select-dropdown"
              role="listbox"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
              style={{ position: 'fixed', top: 0, left: 0 }}
            >
              {normalized.map((option, index) => (
                <button
                  key={option.value}
                  id={optionId(index)}
                  ref={(el) => { optionRefs.current[index] = el; }}
                  type="button"
                  className="dialkit-select-option"
                  role="option"
                  aria-selected={option.value === value}
                  tabIndex={-1}
                  data-selected={String(option.value === value)}
                  data-active={String(index === activeIndex)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(index)}
                  onMouseEnter={() => setActiveIndex(index)}
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
