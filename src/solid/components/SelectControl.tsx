import { createSignal, createEffect, on, onMount, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { getDialKitPortalRoot, getDropdownPosition } from '../../dropdown-position';
import { ICON_CHEVRON } from '../../icons';
import { createDropdownDismiss, createDropdownPresence, type AnimationHandle } from '../primitives';

type SelectOption = string | { value: string; label: string };

interface SelectControlProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  midiSlot?: import('solid-js').JSX.Element;
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
  const [pos, setPos] = createSignal<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const [portalTarget, setPortalTarget] = createSignal<HTMLElement | null>(null);
  let triggerRef!: HTMLButtonElement;
  let chevronRef!: SVGSVGElement;
  let chevronAnim: AnimationHandle | null = null;

  const normalized = () => normalizeOptions(props.options);
  const selectedOption = () => normalized().find((o) => o.value === props.value);

  const dropdown = createDropdownPresence((el, done) =>
    animate(
      el,
      { opacity: 0, y: (pos()?.above ?? false) ? 8 : -8, scale: 0.95 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: done }
    )
  );

  onMount(() => {
    setPortalTarget(getDialKitPortalRoot(triggerRef) ?? document.body);
    onCleanup(() => chevronAnim?.stop());
  });

  // Chevron renders at its resting angle; only animate on changes.
  createEffect(on(dropdown.isOpen, (open) => {
    if (!chevronRef) return;
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 180 : 0 },
      { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
    );
  }, { defer: true }));

  const updatePos = () => {
    const root = portalTarget();
    if (!triggerRef || !root) return;
    const dropdownHeight = 8 + normalized().length * 36;
    setPos(getDropdownPosition(triggerRef, root, { dropdownHeight }));
  };

  const openDropdown = () => {
    updatePos();
    dropdown.open();
  };

  createDropdownDismiss({
    isOpen: dropdown.isOpen,
    contains: (target) => triggerRef?.contains(target) || dropdown.contains(target),
    onDismiss: dropdown.close,
    onViewportChange: updatePos,
  });

  const dropdownStyle = () => {
    const p = pos();
    if (!p) return {};
    return {
      position: 'absolute' as const,
      left: `${p.left}px`,
      top: `${p.top}px`,
      width: `${p.width}px`,
      'transform-origin': p.above ? 'bottom' : 'top',
    };
  };

  return (
    <div class="dialkit-select-row">
      <button
        ref={triggerRef}
        class="dialkit-select-trigger"
        onClick={() => dropdown.isOpen() ? dropdown.close() : openDropdown()}
        data-open={String(dropdown.isOpen())}
        aria-label={`${props.label}: ${selectedOption()?.label ?? props.value}`}
      >
        <span class={`dialkit-select-label${props.midiSlot ? ' dialkit-select-label-placeholder' : ''}`}>{props.label}</span>
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
      <Show when={props.midiSlot}>
        <span class="dialkit-select-midi-label"><span class="dialkit-select-label">{props.label}</span>{props.midiSlot}</span>
      </Show>

      <Show when={!!portalTarget()}>
        <Portal mount={portalTarget()!}>
          <Show when={dropdown.mounted() && pos()}>
            <div
              ref={(el) => {
                dropdown.setRef(el);
                const above = pos()?.above ?? false;
                animate(
                  el,
                  { opacity: [0, 1], y: [above ? 8 : -8, 0], scale: [0.95, 1] },
                  { type: 'spring', visualDuration: 0.15, bounce: 0 }
                );
              }}
              class="dialkit-select-dropdown"
              style={dropdownStyle()}
            >
              <For each={normalized()}>
                {(option) => (
                  <button
                    class="dialkit-select-option"
                    data-selected={String(option.value === props.value)}
                    onClick={() => {
                      props.onChange(option.value);
                      dropdown.close();
                    }}
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
