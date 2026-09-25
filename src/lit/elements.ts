import { ReactiveElement, type PropertyValues } from 'lit';
import { createDialRoot, type DialMode, type DialPosition, type DialTheme } from '../vanilla/DialRoot';
import { createDialTimelineRoot } from '../vanilla/DialTimeline';
import { isDevDefault } from '../env';
import { ensureDocumentStyles, ensureShadowStyles } from './styles';
export type { DialMode, DialPosition, DialTheme };
export type DialKitOpenChangeEvent = CustomEvent<{ open: boolean }>;
export type DialKitVisibilityChangeEvent = CustomEvent<{ visible: boolean }>;
/** Presence means true, except the literal `"false"`, so `default-open="false"` reads naturally in HTML. */
export const booleanAttribute = {
  fromAttribute: (value: string | null) => value !== null && value !== 'false',
  toAttribute: (value: boolean) => (value ? '' : null),
};
/** Like `booleanAttribute`, but an absent attribute leaves the property unset. */
export const optionalBooleanAttribute = {
  fromAttribute: (value: string | null) => (value === null ? undefined : value !== 'false'),
  toAttribute: (value: boolean | undefined) => (value === undefined ? null : value ? '' : null),
};
const emit = <T>(target: EventTarget, type: string, detail: T) => target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
/**
 * `<dialkit-root>`: the parameter panel. Renders in light DOM; popover mode portals to `document.body`
 * like every other adapter, inline mode fills this element. Fires `dialkit-open-change`.
 */
export class DialRoot extends ReactiveElement {
  static properties = {
    position: { type: String },
    defaultOpen: { attribute: 'default-open', converter: booleanAttribute },
    mode: { type: String },
    theme: { type: String },
    productionEnabled: { attribute: 'production-enabled', converter: booleanAttribute },
  };
  declare position: DialPosition;
  declare defaultOpen: boolean;
  declare mode: DialMode;
  declare theme: DialTheme;
  declare productionEnabled: boolean;
  private root?: ReturnType<typeof createDialRoot>;
  constructor() {
    super();
    this.position = 'top-right';
    this.defaultOpen = true;
    this.mode = 'popover';
    this.theme = 'system';
    this.productionEnabled = isDevDefault;
  }
  /** Light DOM: a slot-less shadow root would hide the inline panel and its styles. */
  protected createRenderRoot() {
    return this;
  }
  connectedCallback() {
    super.connectedCallback();
    // Re-insertion schedules no update, so remount here; the first mount happens in updated().
    if (this.hasUpdated)
      this.mount();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.unmount();
  }
  protected updated(changed: PropertyValues<this>) {
    if (this.root && !changed.has('mode') && !changed.has('productionEnabled')) {
      // In place, like the other adapters: the shell keeps its open state and a dragged offset,
      // and a new default only applies to panels registered afterwards. Send only what changed,
      // because a collapsed panel keeps the corner it was dragged to as its current position.
      const next: Parameters<typeof this.root.update>[0] = {};
      if (changed.has('theme'))
        next.theme = this.theme;
      if (changed.has('position'))
        next.position = this.position;
      if (changed.has('defaultOpen'))
        next.defaultOpen = this.defaultOpen;
      this.root.update(next);
      return;
    }
    this.mount();
  }
  private mount() {
    this.unmount();
    // Updates keep running after removal; only a connected element may own editor UI.
    if (!this.isConnected)
      return;
    const inline = this.mode === 'inline';
    // Unknown elements default to display: inline.
    this.style.display = inline ? 'block' : 'contents';
    if (!this.productionEnabled)
      return;
    ensureDocumentStyles();
    const tree = this.getRootNode();
    if (inline && tree instanceof ShadowRoot)
      ensureShadowStyles(tree);
    this.root = createDialRoot({
      position: this.position,
      defaultOpen: this.defaultOpen,
      mode: this.mode,
      theme: this.theme,
      productionEnabled: true,
      target: inline ? this : undefined,
      onOpenChange: open => emit(this, 'dialkit-open-change', { open }),
    });
  }
  private unmount() {
    this.root?.destroy();
    this.root = undefined;
  }
}
/**
 * `<dialkit-timeline>`: the timeline dock, portaled to `document.body`. Fires `dialkit-visibility-change`.
 * Leave `visible` unset for uncontrolled visibility, or bind it to control the dock from the host.
 */
export class DialTimeline extends ReactiveElement {
  static properties = {
    theme: { type: String },
    defaultVisible: { attribute: 'default-visible', converter: booleanAttribute },
    visible: { converter: optionalBooleanAttribute },
    defaultOpen: { attribute: 'default-open', converter: booleanAttribute },
    productionEnabled: { attribute: 'production-enabled', converter: booleanAttribute },
  };
  declare theme: DialTheme;
  declare defaultVisible: boolean;
  declare visible: boolean | undefined;
  declare defaultOpen: boolean;
  declare productionEnabled: boolean;
  private dock?: ReturnType<typeof createDialTimelineRoot>;
  constructor() {
    super();
    this.theme = 'system';
    this.defaultVisible = true;
    this.visible = undefined;
    this.defaultOpen = true;
    this.productionEnabled = isDevDefault;
  }
  protected createRenderRoot() {
    return this;
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated)
      this.mount();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.unmount();
  }
  protected updated(changed: PropertyValues<this>) {
    if (!this.dock || changed.has('defaultVisible') || changed.has('defaultOpen') || changed.has('productionEnabled')) {
      this.mount();
      return;
    }
    this.dock.update({ theme: this.theme, visible: this.visible, onVisibilityChange: this.onVisibilityChange });
  }
  setVisible(visible: boolean) {
    this.dock?.setVisible(visible);
  }
  private readonly onVisibilityChange = (visible: boolean) => emit(this, 'dialkit-visibility-change', { visible });
  private mount() {
    this.unmount();
    if (!this.isConnected)
      return;
    this.style.display = 'contents';
    if (!this.productionEnabled)
      return;
    ensureDocumentStyles();
    this.dock = createDialTimelineRoot({
      theme: this.theme,
      defaultVisible: this.defaultVisible,
      visible: this.visible,
      defaultOpen: this.defaultOpen,
      productionEnabled: true,
      onVisibilityChange: this.onVisibilityChange,
    });
  }
  private unmount() {
    this.dock?.destroy();
    this.dock = undefined;
  }
}
/** Registers both elements. Importing `dialkit/lit` already does this; call it for a custom registry. */
export function defineDialKitElements(registry: CustomElementRegistry | undefined = globalThis.customElements) {
  if (!registry)
    return;
  for (const [tag, ctor] of [['dialkit-root', DialRoot], ['dialkit-timeline', DialTimeline]] as const) {
    const existing = registry.get(tag);
    if (!existing)
      registry.define(tag, ctor);
    else if (existing !== ctor && isDevDefault)
      console.warn(`DialKit: <${tag}> is already defined by another copy of dialkit. Import dialkit/lit from one package instance only.`);
  }
}
defineDialKitElements();
declare global {
  interface HTMLElementTagNameMap {
    'dialkit-root': DialRoot;
    'dialkit-timeline': DialTimeline;
  }
  interface HTMLElementEventMap {
    'dialkit-open-change': DialKitOpenChangeEvent;
    'dialkit-visibility-change': DialKitVisibilityChangeEvent;
  }
}
