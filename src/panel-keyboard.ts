import { announce } from './announce';
import { formatAriaKeyshortcut, isTextEntryFocused, matchesHotkey, parseHotkey, type Hotkey } from './shortcut-utils';

export type PanelKeyboardOptions = {
  /** Toggles the panel from anywhere on the page, for example `"ctrl+period"` or `"mod+."`. */
  hotkey?: string | false;
  inline?: boolean;
  /** Move the floating panel by a pixel offset (Option/Alt + arrows on its header). */
  move?: (dx: number, dy: number) => void;
};

const ROOT_TOGGLE = '.dialkit-folder-root > .dialkit-folder-header .dialkit-folder-header-top';
const FOLDER_HEADER = '.dialkit-folder-header';
const FOCUSABLE = '[role="slider"], [role="radio"][tabindex="0"], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
const MOVE_STEP = 10;
const MOVE_STEP_LARGE = 50;

/**
 * Keyboard access for a DialKit panel, shared by every adapter:
 * - an optional hotkey opens the panel and moves focus into it; pressed again
 *   from inside the panel, it closes the panel and returns focus;
 * - Escape closes the panel and returns focus to where it was before opening;
 * - Option/Alt + arrows on the header move a floating panel.
 */
export function observePanelKeyboard(panel: HTMLElement, initial: PanelKeyboardOptions = {}) {
  let options = initial;
  let hotkey: Hotkey | null = null;
  let returnFocus: HTMLElement | null = null;
  let frame = 0;

  const toggle = () => panel.querySelector<HTMLElement>(ROOT_TOGGLE);
  const isOpen = () => options.inline || toggle()?.getAttribute('aria-expanded') === 'true';
  const label = () => toggle()?.getAttribute('aria-label') || 'DialKit';

  const applyAttributes = () => {
    hotkey = options.hotkey ? parseHotkey(options.hotkey) : null;
    if (options.hotkey && !hotkey) console.warn(`[dialkit] Unrecognized hotkey "${options.hotkey}".`);
    if (!panel.hasAttribute('role')) panel.setAttribute('role', 'region');
    if (!panel.hasAttribute('aria-label')) panel.setAttribute('aria-label', 'DialKit');
    const header = toggle();
    if (header && !options.inline) {
      if (hotkey) header.setAttribute('aria-keyshortcuts', formatAriaKeyshortcut(hotkey));
      else header.removeAttribute('aria-keyshortcuts');
    }
  };

  const focusFirstControl = (attempt = 0) => {
    cancelAnimationFrame(frame);
    const header = toggle();
    const candidates = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element => (
      element !== header && !element.closest('.dialkit-panel-header, [inert], [aria-hidden="true"]') && element.getClientRects().length > 0
    ));
    // Prefer a control over section headers and their toolbars.
    const control = candidates.find(element => !element.closest(FOLDER_HEADER)) ?? candidates[0];
    if (control) { control.focus({ preventScroll: true }); return; }
    // Controls mount after the open state renders; give the adapter a few frames.
    if (attempt < 10) frame = requestAnimationFrame(() => focusFirstControl(attempt + 1));
    else header?.focus({ preventScroll: true });
  };

  const restoreFocus = () => {
    const target = returnFocus?.isConnected && !panel.contains(returnFocus) ? returnFocus : toggle();
    returnFocus = null;
    target?.focus({ preventScroll: true });
  };

  const open = () => {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && active !== document.body && !panel.contains(active) ? active : null;
    if (!isOpen()) {
      toggle()?.click();
      announce(`${label()} opened. Press Escape to close.`);
    }
    focusFirstControl();
  };

  const close = () => {
    if (options.inline || !isOpen()) return;
    const hadFocus = panel.contains(document.activeElement);
    toggle()?.click();
    announce(`${label()} closed.`);
    if (hadFocus || returnFocus) restoreFocus();
  };

  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (!hotkey || event.defaultPrevented || event.repeat || !matchesHotkey(event, hotkey)) return;
    // A hotkey without Control or Command would type a character, so it waits while typing.
    if (!hotkey.modifiers.some(modifier => modifier === 'ctrl' || modifier === 'meta') && isTextEntryFocused()) return;
    event.preventDefault();
    // From inside an open panel the hotkey closes it; from anywhere else it brings focus to the panel.
    if (isOpen() && !options.inline && panel.contains(document.activeElement)) close();
    else open();
  };

  // Listen on the window, after the adapters' own handlers: React, Solid and Svelte
  // delegate events above the panel, so an editor's Escape must get to claim it first.
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (options.inline || !isOpen() || !(event.target instanceof Node) || !panel.contains(event.target)) return;
    event.preventDefault();
    close();
  };

  const onPanelKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const header = toggle();
    if (!options.move || options.inline || !event.altKey || event.ctrlKey || event.metaKey || event.target !== header) return;
    const distance = event.shiftKey ? MOVE_STEP_LARGE : MOVE_STEP;
    const delta = { ArrowLeft: [-distance, 0], ArrowRight: [distance, 0], ArrowUp: [0, -distance], ArrowDown: [0, distance] }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    options.move(delta[0], delta[1]);
    const rect = panel.getBoundingClientRect();
    announce(`${label()} moved to ${Math.round(rect.left)}, ${Math.round(rect.top)}.`);
  };

  applyAttributes();
  // Adapters rebuild the header when panels are added or removed; keep its attributes.
  const observer = new MutationObserver(() => {
    const header = toggle();
    if (header && !options.inline && hotkey && !header.hasAttribute('aria-keyshortcuts')) applyAttributes();
  });
  observer.observe(panel, { childList: true, subtree: true });
  window.addEventListener('keydown', onWindowKeyDown);
  window.addEventListener('keydown', onEscape);
  panel.addEventListener('keydown', onPanelKeyDown);

  return {
    update(next: PanelKeyboardOptions) {
      options = next;
      applyAttributes();
    },
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', onWindowKeyDown);
      window.removeEventListener('keydown', onEscape);
      panel.removeEventListener('keydown', onPanelKeyDown);
    },
  };
}
