import { createSignal, createEffect, onMount, onCleanup, createUniqueId, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { ICON_CHEVRON, ICON_TRASH } from '../../icons';
import { getDialKitPortalRoot } from '../../dropdown-position';
import { useFloatingDropdown } from '../floating';
import { DialStore } from '../../store/DialStore';
import type { Preset } from '../../store/DialStore';

interface PresetManagerProps {
  panelId: string;
  presets: Preset[];
  activePresetId: string | null;
  onAdd: () => void;
}

export function PresetManager(props: PresetManagerProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [portalTarget, setPortalTarget] = createSignal<HTMLElement | null>(null);
  const [dropdownEl, setDropdownEl] = createSignal<HTMLDivElement | undefined>();
  let triggerRef!: HTMLButtonElement;
  let chevronRef!: SVGSVGElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let closeAnim: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chevronAnim: any = null;

  const baseId = createUniqueId();
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const hasPresets = () => props.presets.length > 0;
  const activePreset = () => props.presets.find((p) => p.id === props.activePresetId);

  // Flat selectable list: the implicit "Version 1" (no preset) plus each preset.
  const items = (): { id: string | null; name: string }[] => [
    { id: null, name: 'Version 1' },
    ...props.presets.map((p) => ({ id: p.id, name: p.name })),
  ];
  const selectedIndex = () => Math.max(0, items().findIndex((it) => it.id === props.activePresetId));

  onMount(() => {
    setPortalTarget(getDialKitPortalRoot(triggerRef) ?? document.body);

    if (chevronRef) {
      chevronRef.style.transform = `rotate(${isOpen() ? 180 : 0}deg)`;
      chevronRef.style.opacity = String(hasPresets() ? 0.6 : 0.25);
    }

    onCleanup(() => {
      closeAnim?.stop();
      chevronAnim?.stop();
    });
  });

  createEffect(() => {
    if (!chevronRef) return;
    const open = isOpen();
    const has = hasPresets();
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 180 : 0, opacity: has ? 0.6 : 0.25 },
      { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
    );
  });

  // Floating UI positioning while open.
  useFloatingDropdown(
    () => isOpen() && mounted(),
    () => triggerRef,
    () => dropdownEl(),
    { placement: 'bottom-start', matchWidth: true }
  );

  // Keep the active item scrolled into view.
  createEffect(() => {
    if (isOpen() && activeIndex() >= 0) {
      document.getElementById(optionId(activeIndex()))?.scrollIntoView({ block: 'nearest' });
    }
  });

  const openMenu = (toIndex: number) => {
    if (!hasPresets()) return;
    closeAnim?.stop();
    closeAnim = null;
    setActiveIndex(toIndex);
    setMounted(true);
    setIsOpen(true);
    // macOS Safari/Firefox don't focus a <button> on click — force it so the
    // trigger's key handler receives arrow keys.
    triggerRef?.focus();
  };

  const closeDropdown = () => {
    setIsOpen(false);
    const el = dropdownEl();
    if (!el) { setMounted(false); return; }
    closeAnim?.stop();
    closeAnim = animate(
      el,
      { opacity: 0, y: 4, scale: 0.97 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: () => { setMounted(false); closeAnim = null; } }
    );
  };

  const toggle = () => { if (isOpen()) closeDropdown(); else openMenu(selectedIndex()); };

  const handleSelect = (presetId: string | null) => {
    if (presetId) DialStore.loadPreset(props.panelId, presetId);
    else DialStore.clearActivePreset(props.panelId);
    closeDropdown();
  };

  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(selectedIndex());
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(items().length - 1);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items().length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items().length) % items().length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(items().length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex() >= 0) handleSelect(items()[activeIndex()].id);
        break;
      case 'Delete':
      case 'Backspace': {
        const target = items()[activeIndex()];
        if (target?.id) {
          e.preventDefault();
          DialStore.deletePreset(props.panelId, target.id);
          setActiveIndex((i) => Math.max(0, i - 1));
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'Tab':
        closeDropdown();
        break;
    }
  };

  // Close when focus leaves the trigger.
  const handleTriggerBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (dropdownEl()?.contains(next)) return;
    closeDropdown();
  };

  // Close on mousedown outside trigger + dropdown.
  createEffect(() => {
    if (!isOpen()) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const el = dropdownEl();
      if (triggerRef?.contains(target) || el?.contains(target)) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', handler);
    onCleanup(() => document.removeEventListener('mousedown', handler));
  });

  const handleDelete = (e: MouseEvent, presetId: string) => {
    e.stopPropagation();
    DialStore.deletePreset(props.panelId, presetId);
  };

  return (
    <div class="dialkit-preset-manager">
      <button
        ref={triggerRef}
        class="dialkit-preset-trigger"
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
        onBlur={handleTriggerBlur}
        data-open={String(isOpen())}
        data-has-preset={String(!!activePreset())}
        data-disabled={String(!hasPresets())}
        aria-haspopup="listbox"
        aria-expanded={isOpen()}
        aria-controls={isOpen() ? `${baseId}-listbox` : undefined}
        aria-activedescendant={isOpen() && activeIndex() >= 0 ? optionId(activeIndex()) : undefined}
      >
        <span class="dialkit-preset-label">
          {activePreset() ? activePreset()!.name : 'Version 1'}
        </span>
        <svg
          ref={chevronRef}
          class="dialkit-select-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d={ICON_CHEVRON} />
        </svg>
      </button>

      <Show when={!!portalTarget()}>
        <Portal mount={portalTarget()!}>
          <Show when={mounted()}>
            <div
              ref={(el) => {
                setDropdownEl(el);
                animate(
                  el,
                  { opacity: [0, 1], y: [4, 0], scale: [0.97, 1] },
                  { type: 'spring', visualDuration: 0.15, bounce: 0 }
                );
              }}
              id={`${baseId}-listbox`}
              class="dialkit-root dialkit-preset-dropdown"
              role="listbox"
              style={{ position: 'fixed', top: '0', left: '0' }}
            >
              <For each={items()}>
                {(item, index) => (
                  <div
                    id={optionId(index())}
                    class="dialkit-preset-item"
                    role="option"
                    aria-selected={index() === selectedIndex()}
                    data-active={String(index() === activeIndex())}
                    data-selected={String(index() === selectedIndex())}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index())}
                    onClick={() => handleSelect(item.id)}
                  >
                    <span class="dialkit-preset-name">{item.name}</span>
                    <Show when={item.id}>
                      <button
                        class="dialkit-preset-delete"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => handleDelete(e, item.id!)}
                        title="Delete preset"
                        tabindex={-1}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d={ICON_TRASH[0]} />
                          <path d={ICON_TRASH[1]} />
                          <path d={ICON_TRASH[2]} />
                          <path d={ICON_TRASH[3]} />
                          <path d={ICON_TRASH[4]} />
                        </svg>
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Portal>
      </Show>
    </div>
  );
}
