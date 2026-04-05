import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { DialStore, ShortcutConfig } from '../../store/DialStore';

interface ShortcutsMenuProps {
  panelId: string;
}

function formatShortcutKey(sc: ShortcutConfig): string {
  if (!sc.key) return '\u2014';
  const mod = sc.modifier === 'alt' ? '\u2325'
    : sc.modifier === 'shift' ? '\u21E7'
    : sc.modifier === 'meta' ? '\u2318'
    : '';
  return `${mod}${sc.key.toUpperCase()}`;
}

function formatInteraction(sc: ShortcutConfig): string {
  const interaction = sc.interaction ?? 'scroll';
  switch (interaction) {
    case 'scroll': return sc.key ? 'key+scroll' : 'scroll';
    case 'drag': return 'key+drag';
    case 'move': return 'key+move';
    case 'scroll-only': return 'scroll';
  }
}

export function ShortcutsMenu(props: ShortcutsMenuProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [pos, setPos] = createSignal({ top: 0, right: 0 });

  let triggerRef!: HTMLButtonElement;
  let dropdownRef: HTMLDivElement | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let triggerTapAnim: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dropdownEnterAnim: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dropdownExitAnim: any = null;

  const tapTransition = { type: 'spring' as const, visualDuration: 0.15, bounce: 0.3 };

  const open = () => {
    const rect = triggerRef?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  const toggle = () => {
    if (isOpen()) close();
    else open();
  };

  // Close on mousedown outside
  createEffect(() => {
    if (!isOpen()) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.contains(target) || dropdownRef?.contains(target)) return;
      close();
    };

    document.addEventListener('mousedown', handler);
    onCleanup(() => document.removeEventListener('mousedown', handler));
  });

  // Animate dropdown enter/exit
  createEffect(() => {
    const opened = isOpen();
    if (!dropdownRef) return;

    if (opened) {
      dropdownExitAnim?.stop();
      dropdownRef.style.pointerEvents = 'auto';
      dropdownEnterAnim = animate(
        dropdownRef,
        { opacity: 1, y: 0, scale: 1 },
        { type: 'spring', visualDuration: 0.15, bounce: 0 }
      );
    } else {
      dropdownEnterAnim?.stop();
      dropdownRef.style.pointerEvents = 'none';
      dropdownExitAnim = animate(
        dropdownRef,
        { opacity: 0, y: 4, scale: 0.97 },
        { type: 'spring', visualDuration: 0.15, bounce: 0 }
      );
    }
  });

  onCleanup(() => {
    triggerTapAnim?.stop();
    dropdownEnterAnim?.stop();
    dropdownExitAnim?.stop();
  });

  const panel = () => DialStore.getPanel(props.panelId);

  const rows = () => {
    const p = panel();
    if (!p) return [];
    const shortcuts = Object.entries(p.shortcuts);
    if (shortcuts.length === 0) return [];

    return shortcuts.map(([path, shortcut]) => {
      const findLabel = (controls: typeof p.controls): string => {
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
        label: findLabel(p.controls),
      };
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        class="dialkit-shortcuts-trigger"
        onClick={toggle}
        onPointerDown={() => {
          triggerTapAnim?.stop();
          triggerTapAnim = animate(triggerRef, { scale: 0.9 }, tapTransition);
        }}
        onPointerUp={() => {
          triggerTapAnim?.stop();
          triggerTapAnim = animate(triggerRef, { scale: 1 }, tapTransition);
        }}
        onPointerCancel={() => {
          triggerTapAnim?.stop();
          triggerTapAnim = animate(triggerRef, { scale: 1 }, tapTransition);
        }}
        onPointerLeave={() => {
          triggerTapAnim?.stop();
          triggerTapAnim = animate(triggerRef, { scale: 1 }, tapTransition);
        }}
        title="Keyboard shortcuts"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10H6.01" />
          <path d="M10 10H10.01" />
          <path d="M14 10H14.01" />
          <path d="M18 10H18.01" />
          <path d="M8 14H16" />
        </svg>
      </button>

      <Portal mount={document.body}>
        <div
          ref={(el) => {
            dropdownRef = el;
            // Initialize hidden
            el.style.opacity = '0';
            el.style.transform = 'translateY(4px) scale(0.97)';
            el.style.pointerEvents = 'none';
          }}
          class="dialkit-root dialkit-shortcuts-dropdown"
          style={{
            position: 'fixed',
            top: `${pos().top}px`,
            right: `${pos().right}px`,
          }}
        >
          <div class="dialkit-shortcuts-title">Keyboard Shortcuts</div>
          <div class="dialkit-shortcuts-list">
            <For each={rows()}>
              {(row) => (
                <div class="dialkit-shortcuts-row">
                  <span class="dialkit-shortcuts-row-key">
                    {formatShortcutKey(row.shortcut)}
                  </span>
                  <span class="dialkit-shortcuts-row-label">{row.label}</span>
                  <span class="dialkit-shortcuts-row-mode">{formatInteraction(row.shortcut)}</span>
                </div>
              )}
            </For>
          </div>
          <div class="dialkit-shortcuts-hint">See pill badges on controls for keys</div>
        </div>
      </Portal>
    </>
  );
}
