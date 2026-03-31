import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { DialStore, ShortcutConfig } from '../store/DialStore';

interface ShortcutsMenuProps {
  panelId: string;
}

function formatShortcutKey(sc: ShortcutConfig): string {
  const mod = sc.modifier === 'alt' ? '⌥'
    : sc.modifier === 'shift' ? '⇧'
    : sc.modifier === 'meta' ? '⌘'
    : '';
  return `${mod}${sc.key.toUpperCase()}`;
}

export function ShortcutsMenu({ panelId }: ShortcutsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const open = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);

  // Close on mousedown outside
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      close();
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close]);

  const panel = DialStore.getPanel(panelId);
  if (!panel) return null;

  const shortcuts = Object.entries(panel.shortcuts);
  if (shortcuts.length === 0) return null;

  // Build shortcut rows with labels from controls
  const rows = shortcuts.map(([path, shortcut]) => {
    // Find control label
    const findLabel = (controls: typeof panel.controls): string => {
      for (const c of controls) {
        if (c.path === path) return c.label;
        if (c.type === 'folder' && c.children) {
          const found = findLabel(c.children);
          if (found) return found;
        }
      }
      return path;
    };
    return {
      path,
      shortcut,
      label: findLabel(panel.controls),
    };
  });

  return (
    <>
      <motion.button
        ref={triggerRef}
        className="dialkit-shortcuts-trigger"
        onClick={toggle}
        title="Keyboard shortcuts"
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10H6.01" />
          <path d="M10 10H10.01" />
          <path d="M14 10H14.01" />
          <path d="M18 10H18.01" />
          <path d="M8 14H16" />
        </svg>
      </motion.button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              className="dialkit-root dialkit-shortcuts-dropdown"
              style={{ position: 'fixed', top: pos.top, right: pos.right }}
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97, pointerEvents: 'none' as any }}
              transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
            >
              <div className="dialkit-shortcuts-title">Keyboard Shortcuts</div>
              <div className="dialkit-shortcuts-list">
                {rows.map((row) => (
                  <div key={row.path} className="dialkit-shortcuts-row">
                    <span className="dialkit-shortcuts-row-key">
                      {formatShortcutKey(row.shortcut)}
                    </span>
                    <span className="dialkit-shortcuts-row-label">{row.label}</span>
                    <span className="dialkit-shortcuts-row-mode">{row.shortcut.mode ?? 'normal'}</span>
                  </div>
                ))}
              </div>
              <div className="dialkit-shortcuts-hint">Hold key + scroll to adjust</div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
