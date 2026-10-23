import { DialStore, type Preset } from '../store/DialStore';
import { observeDropdownKeyboard } from '../dropdown-keyboard';
import { openDropdownOnKey } from '../control-keyboard';
import { getDialKitPortalRoot, getDropdownPosition, observeDropdownPosition } from '../dropdown-position';
import { eventWithin, findControl, formatToggleShortcut } from '../shortcut-utils';
import { ICON_CHEVRON, ICON_TRASH, ICON_PLUS, ICON_CHECK } from '../icons';
import { element, icon, type Mounted } from './dom';
export function popupMenu(trigger: HTMLButtonElement, className: string, kind: 'select' | 'presets' | 'help', populate: (popup: HTMLElement) => void) {
  let popup: HTMLDivElement | undefined;
  let stopKeyboard: (() => void) | undefined, stopPosition: (() => void) | undefined;
  const outside = (event: Event) => {
    if (!eventWithin(event, trigger, popup))
      close();
  };
  function close() {
    stopKeyboard?.();
    stopPosition?.();
    stopKeyboard = stopPosition = undefined;
    popup?.remove();
    popup = undefined;
    trigger.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside);
  }
  function open() {
    if (popup || trigger.disabled)
      return;
    const root = getDialKitPortalRoot(trigger) ?? document.body;
    popup = element('div', className);
    popup.style.position = 'fixed';
    root.append(popup);
    populate(popup);
    trigger.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    stopPosition = observeDropdownPosition(trigger, () => {
      if (!popup)
        return;
      if (!trigger.isConnected || !trigger.getClientRects().length) {
        close();
        return;
      }
      const p = getDropdownPosition(trigger, root, { fixed: true, dropdownHeight: popup.scrollHeight + 2, ...(kind === 'help' ? { width: 280 } : {}) });
      Object.assign(popup.style, { top: `${p.top}px`, left: `${p.left}px`, width: `${p.width}px`, maxHeight: `${p.maxHeight}px` });
    }, () => popup);
    stopKeyboard = observeDropdownKeyboard(trigger, () => popup, close, kind);
    document.addEventListener('pointerdown', outside);
  }
  const click = () => {
    if (popup)
      close();
    else
      open();
  };
  const key = (e: KeyboardEvent) => openDropdownOnKey(e, open);
  trigger.setAttribute('aria-haspopup', kind === 'select' ? 'listbox' : kind === 'presets' ? 'menu' : 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', click);
  trigger.addEventListener('keydown', key);
  return {
    close, refresh() {
      if (popup)
        populate(popup);
    }, destroy() {
      close();
      trigger.removeEventListener('click', click);
      trigger.removeEventListener('keydown', key);
    }
  };
}
export interface SelectControlProps {
  label: string;
  value: string;
  options: (string | {
    value: string;
    label: string;
  })[];
  onChange: (value: string) => void;
}
export function mountSelectControl(host: HTMLElement, initial: SelectControlProps): Mounted<SelectControlProps> {
  let props = initial;
  const row = element('div', 'dialkit-select-row');
  const trigger = element('button', 'dialkit-select-trigger');
  const label = element('span', 'dialkit-select-label');
  const right = element('div', 'dialkit-select-right');
  const value = element('span', 'dialkit-select-value');
  right.append(value, icon(ICON_CHEVRON, 'dialkit-select-chevron'));
  trigger.append(label, right);
  row.append(trigger);
  host.append(row);
  const options = () => props.options.map(option => typeof option === 'string' ? { value: option, label: option.replace(/\b\w/g, c => c.toUpperCase()) } : option);
  const menu = popupMenu(trigger, 'dialkit-select-dropdown', 'select', popup => {
    popup.replaceChildren(...options().map(option => {
      const b = element('button', 'dialkit-select-option', option.label);
      b.dataset.selected = String(option.value === props.value);
      b.addEventListener('click', () => {
        props.onChange(option.value);
        menu.close();
      });
      return b;
    }));
  });
  function render() {
    label.textContent = props.label;
    value.textContent = options().find(o => o.value === props.value)?.label ?? props.value;
    trigger.disabled = !props.options.length;
    menu.refresh();
  }
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      menu.destroy();
      row.remove();
    }
  };
}
export interface PresetManagerProps {
  panelId: string;
  presets: Preset[];
  activePresetId: string | null;
  onAdd?: () => void;
}
export function mountPresetManager(host: HTMLElement, initial: PresetManagerProps): Mounted<PresetManagerProps> {
  let props = initial;
  const row = element('div', 'dialkit-preset-manager');
  const trigger = element('button', 'dialkit-preset-trigger');
  const label = element('span', 'dialkit-preset-label');
  trigger.setAttribute('aria-label', 'Versions');
  trigger.append(label, icon(ICON_CHEVRON, 'dialkit-select-chevron'));
  row.append(trigger);
  host.append(row);
  const menu = popupMenu(trigger, 'dialkit-preset-dropdown', 'presets', popup => {
    const versions = [{ id: null, name: 'Version 1' }, ...props.presets];
    popup.replaceChildren(...versions.map(preset => {
      const item = element('div', 'dialkit-preset-item');
      item.dataset.active = String(preset.id === props.activePresetId);
      const name = element('button', 'dialkit-preset-name', preset.name);
      item.addEventListener('click', () => {
        if (preset.id)
          DialStore.loadPreset(props.panelId, preset.id);
        else
          DialStore.clearActivePreset(props.panelId);
        menu.close();
      });
      item.append(icon(preset.id === props.activePresetId ? ICON_CHECK : [], 'dialkit-preset-check'), name);
      if (preset.id) {
        const del = element('button', 'dialkit-preset-delete');
        del.title = `Delete ${preset.name}`;
        del.setAttribute('aria-label', del.title);
        del.append(icon(ICON_TRASH));
        del.addEventListener('click', (event) => { event.stopPropagation(); DialStore.deletePreset(props.panelId, preset.id!); });
        item.append(del);
      }
      return item;
    }));
    const divider = element('div', 'dialkit-preset-divider');
    divider.setAttribute('role', 'separator');
    const create = element('button', 'dialkit-preset-create');
    create.append(icon(ICON_PLUS, 'dialkit-preset-check'), document.createTextNode('New version'));
    create.addEventListener('click', () => {
      if (props.onAdd) props.onAdd(); else DialStore.saveNewPreset(props.panelId);
      menu.close();
      trigger.focus();
    });
    popup.append(divider, create);
  });
  function render() {
    const active = props.presets.find(p => p.id === props.activePresetId);
    label.textContent = active?.name ?? 'Version 1';
    trigger.dataset.hasPreset = String(!!active);
    menu.refresh();
  }
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      menu.destroy();
      row.remove();
    }
  };
}
export function mountShortcutsMenu(host: HTMLElement, initial: {
  panelId: string;
}): Mounted<{
  panelId: string;
}> {
  let props = initial;
  const trigger = element('button', 'dialkit-shortcuts-trigger');
  trigger.title = 'Keyboard shortcuts';
  trigger.setAttribute('aria-label', trigger.title);
  trigger.append(icon(['M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z', 'M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8']));
  host.append(trigger);
  const menu = popupMenu(trigger, 'dialkit-shortcuts-dropdown', 'help', popup => {
    const panel = DialStore.getPanel(props.panelId);
    popup.replaceChildren(element('div', 'dialkit-shortcuts-title', 'Keyboard Shortcuts'));
    const list = element('div', 'dialkit-shortcuts-list');
    for (const [path, shortcut] of Object.entries(panel?.shortcuts ?? {})) {
      const row = element('div', 'dialkit-shortcuts-row');
      const interaction = shortcut.interaction ?? 'scroll';
      row.append(element('span', 'dialkit-shortcuts-row-key', formatToggleShortcut(shortcut)), element('span', 'dialkit-shortcuts-row-label', findControl(panel!.controls, path)?.label ?? path), element('span', 'dialkit-shortcuts-row-mode', interaction === 'scroll-only' ? 'scroll' : `key+${interaction}`));
      list.append(row);
    }
    popup.append(list, element('div', 'dialkit-shortcuts-hint', 'See pill badges on controls for keys'));
  });
  const render = () => {
    trigger.style.display = Object.keys(DialStore.getPanel(props.panelId)?.shortcuts ?? {}).length ? '' : 'none';
    menu.refresh();
  };
  const stop = DialStore.subscribeGlobal(render);
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      stop();
      menu.destroy();
      trigger.remove();
    }
  };
}
