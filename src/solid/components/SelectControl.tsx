import { createSignal, createEffect, onMount, onCleanup, createUniqueId, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { getDialKitPortalRoot } from '../../dropdown-position';
import { useFloatingDropdown } from '../floating';
import { ICON_CHEVRON } from '../../icons';

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

export function SelectControl(props: SelectControlProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [portalTarget, setPortalTarget] = createSignal<HTMLElement | null>(null);
  const [dropdownEl, setDropdownEl] = createSignal<HTMLDivElement | undefined>();
  let triggerRef!: HTMLButtonElement;
  let chevronRef!: SVGSVGElement;
  const optionRefs: (HTMLButtonElement | undefined)[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let closeAnim: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chevronAnim: any = null;

  const baseId = createUniqueId();
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const normalized = () => normalizeOptions(props.options);
  const selectedIndex = () => normalized().findIndex((o) => o.value === props.value);
  const selectedOption = () => normalized().find((o) => o.value === props.value);

  onMount(() => {
    setPortalTarget(getDialKitPortalRoot(triggerRef) ?? document.body);

    if (chevronRef) {
      chevronRef.style.transform = `rotate(${isOpen() ? 180 : 0}deg)`;
    }

    onCleanup(() => {
      closeAnim?.stop();
      chevronAnim?.stop();
    });
  });

  createEffect(() => {
    if (!chevronRef) return;
    const open = isOpen();
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 180 : 0 },
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

  // Focus never leaves the trigger — the active option is tracked with
  // aria-activedescendant. Keep the active option scrolled into view.
  createEffect(() => {
    if (isOpen() && activeIndex() >= 0) {
      optionRefs[activeIndex()]?.scrollIntoView({ block: 'nearest' });
    }
  });

  const openMenu = (toIndex: number) => {
    closeAnim?.stop();
    closeAnim = null;
    setActiveIndex(toIndex);
    setMounted(true);
    setIsOpen(true);
    // macOS Safari/Firefox don't focus a <button> on click, so force it —
    // otherwise arrow keys hit the page instead of the trigger's handler.
    triggerRef?.focus();
  };

  const commit = (index: number) => {
    props.onChange(normalized()[index].value);
    closeDropdown();
  };

  const closeDropdown = () => {
    setIsOpen(false);
    const el = dropdownEl();
    if (!el) { setMounted(false); return; }
    closeAnim?.stop();
    closeAnim = animate(
      el,
      { opacity: 0, y: -8, scale: 0.95 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: () => { setMounted(false); closeAnim = null; } }
    );
  };

  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(selectedIndex() >= 0 ? selectedIndex() : 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(selectedIndex() >= 0 ? selectedIndex() : normalized().length - 1);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % normalized().length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + normalized().length) % normalized().length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(normalized().length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex() >= 0) commit(activeIndex());
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'Tab':
        closeDropdown();
        break;
    }
  };

  // Close when focus leaves the trigger (Tab away, or focus moves elsewhere).
  const handleTriggerBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (dropdownEl()?.contains(next)) return;
    closeDropdown();
  };

  // Close on click outside (covers clicks on non-focusable areas).
  createEffect(() => {
    if (!isOpen()) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const el = dropdownEl();
      if (
        triggerRef && !triggerRef.contains(target) &&
        el && !el.contains(target)
      ) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClick);
    onCleanup(() => document.removeEventListener('mousedown', handleClick));
  });

  return (
    <div class="dialkit-select-row">
      <button
        ref={triggerRef}
        class="dialkit-select-trigger"
        onClick={() => (isOpen() ? closeDropdown() : openMenu(selectedIndex() >= 0 ? selectedIndex() : 0))}
        onKeyDown={handleTriggerKeyDown}
        onBlur={handleTriggerBlur}
        data-open={String(isOpen())}
        aria-haspopup="listbox"
        aria-expanded={isOpen()}
        aria-controls={isOpen() ? `${baseId}-listbox` : undefined}
        aria-activedescendant={isOpen() && activeIndex() >= 0 ? optionId(activeIndex()) : undefined}
      >
        <span class="dialkit-select-label">{props.label}</span>
        <div class="dialkit-select-right">
          <span class="dialkit-select-value">{selectedOption()?.label ?? props.value}</span>
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
        </div>
      </button>

      <Show when={!!portalTarget()}>
        <Portal mount={portalTarget()!}>
          <Show when={mounted()}>
            <div
              ref={(el) => {
                setDropdownEl(el);
                animate(
                  el,
                  { opacity: [0, 1], y: [-8, 0], scale: [0.95, 1] },
                  { type: 'spring', visualDuration: 0.15, bounce: 0 }
                );
              }}
              id={`${baseId}-listbox`}
              class="dialkit-select-dropdown"
              role="listbox"
              style={{ position: 'fixed', top: '0', left: '0' }}
            >
              <For each={normalized()}>
                {(option, index) => (
                  <button
                    id={optionId(index())}
                    ref={(el) => { optionRefs[index()] = el; }}
                    type="button"
                    class="dialkit-select-option"
                    role="option"
                    aria-selected={option.value === props.value}
                    tabindex={-1}
                    data-selected={String(option.value === props.value)}
                    data-active={String(index() === activeIndex())}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(index())}
                    onMouseEnter={() => setActiveIndex(index())}
                  >
                    {option.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Portal>
      </Show>
    </div>
  );
}
