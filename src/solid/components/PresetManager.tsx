import { observeDropdownKeyboard } from '../../dropdown-keyboard';
import { openDropdownOnKey } from '../../control-keyboard';
import { createSignal, createEffect, on, onMount, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { ICON_CHEVRON, ICON_TRASH, ICON_PLUS, ICON_CHECK } from '../../icons';
import { getDialKitPortalRoot, getDropdownPosition } from '../../dropdown-position';
import { DialStore } from '../../store/DialStore';
import type { Preset } from '../../store/DialStore';
import { createDropdownDismiss, createDropdownPresence, type AnimationHandle } from '../primitives';

interface PresetManagerProps {
  panelId: string;
  presets: Preset[];
  activePresetId: string | null;
  onAdd?: () => void;
}

export function PresetManager(props: PresetManagerProps) {
  const [pos, setPos] = createSignal({ top: 0, left: 0, width: 0 });
  const [portalTarget, setPortalTarget] = createSignal<HTMLElement | null>(null);
  let triggerRef!: HTMLButtonElement;
  let dropdownRef: HTMLDivElement | undefined;
  let chevronRef!: SVGSVGElement;
  let chevronAnim: AnimationHandle | null = null;

  const activePreset = () => props.presets.find((p) => p.id === props.activePresetId);
  const activeName = () => activePreset()?.name ?? 'Version 1';

  const dropdown = createDropdownPresence((el, done) =>
    animate(
      el,
      { opacity: 0, y: 4, scale: 0.97 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: done }
    )
  );

  onMount(() => {
    setPortalTarget(getDialKitPortalRoot(triggerRef) ?? document.body);
    onCleanup(() => chevronAnim?.stop());
  });

  // Renders at its resting state via inline style; animate on changes only.
  createEffect(on(dropdown.isOpen, (open) => {
    if (!chevronRef) return;
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 180 : 0, opacity: 0.6 },
      { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
    );
  }, { defer: true }));

  const updatePos = () => {
    const root = portalTarget();
    if (!triggerRef || !root) return;
    setPos(getDropdownPosition(triggerRef, root, { fixed: true, dropdownHeight: (dropdownRef?.scrollHeight ?? 0) + 2 }));
  };

  const openDropdown = () => {
    updatePos();
    dropdown.open();
  };

  const toggle = () => {
    if (dropdown.isOpen()) dropdown.close();
    else openDropdown();
  };

  createDropdownDismiss({
    isOpen: dropdown.isOpen,
    contains: (target) => triggerRef?.contains(target) || dropdown.contains(target),
    onDismiss: dropdown.close,
    onViewportChange: updatePos,
  });

  createEffect(() => {
    if (!dropdown.isOpen()) return;
    onCleanup(observeDropdownKeyboard(triggerRef, () => dropdownRef, dropdown.close, 'presets'));
  });

  const handleSelect = (presetId: string | null) => {
    if (presetId) DialStore.loadPreset(props.panelId, presetId);
    else DialStore.clearActivePreset(props.panelId);
    dropdown.close();
  };

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
        data-open={String(dropdown.isOpen())}
        data-has-preset={String(!!activePreset())}
        type="button" aria-haspopup="menu" aria-expanded={dropdown.isOpen()}
        aria-label={`Versions: ${activeName()}`} onKeyDown={(e) => openDropdownOnKey(e, openDropdown)}
      >
        <span class="dialkit-preset-label">
          {activeName()}
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
          style={{ opacity: 0.6 }}
        >
          <path d={ICON_CHEVRON} />
        </svg>
      </button>

      <Show when={!!portalTarget()}>
        <Portal mount={portalTarget()!}>
          <Show when={dropdown.mounted()}>
            <div
              ref={(el) => {
                dropdownRef = el;
                dropdown.setRef(el);
                animate(
                  el,
                  { opacity: [0, 1], y: [4, 0], scale: [0.97, 1] },
                  { type: 'spring', visualDuration: 0.15, bounce: 0 }
                );
              }}
              class="dialkit-root dialkit-preset-dropdown"
              style={{
                position: 'fixed',
                top: `${pos().top}px`,
                left: `${pos().left}px`,
                'min-width': `${pos().width}px`,
              }}
            >
              <div
                class="dialkit-preset-item"
                data-active={String(!props.activePresetId)}
                onClick={() => handleSelect(null)}
              >
                <svg class="dialkit-preset-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><Show when={!props.activePresetId}><path d={ICON_CHECK} /></Show></svg>
                <button type="button" class="dialkit-preset-name">Version 1</button>
              </div>

              <For each={props.presets}>
                {(preset) => (
                  <div
                    class="dialkit-preset-item"
                    data-active={String(preset.id === props.activePresetId)}
                    onClick={() => handleSelect(preset.id)}
                  >
                    <svg class="dialkit-preset-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><Show when={preset.id === props.activePresetId}><path d={ICON_CHECK} /></Show></svg>
                    <button type="button" class="dialkit-preset-name">{preset.name}</button>
                    <button
                      class="dialkit-preset-delete"
                      onClick={(e) => handleDelete(e, preset.id)}
                      type="button" title={`Delete ${preset.name}`} aria-label={`Delete ${preset.name}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d={ICON_TRASH[0]} />
                        <path d={ICON_TRASH[1]} />
                        <path d={ICON_TRASH[2]} />
                        <path d={ICON_TRASH[3]} />
                        <path d={ICON_TRASH[4]} />
                      </svg>
                    </button>
                  </div>
                )}
              </For>
              <div class="dialkit-preset-divider" role="separator" />
              <button type="button" class="dialkit-preset-create" onClick={() => { if (props.onAdd) props.onAdd(); else DialStore.saveNewPreset(props.panelId); dropdown.close(); triggerRef.focus(); }}>
                <svg class="dialkit-preset-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d={ICON_PLUS[0]} /></svg>
                New version
              </button>
            </div>
          </Show>
        </Portal>
      </Show>
    </div>
  );
}
