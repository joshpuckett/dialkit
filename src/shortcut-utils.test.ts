import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventWithin, getActiveElement, isInputFocused, observeFocusOutside } from './shortcut-utils';

// Node has no DOM; plain objects model the few members the helpers touch.
type Stub = { tagName: string; contentEditable?: string; shadowRoot: { activeElement: Element | null } | null; closest: (selector: string) => Element | null; getRootNode: () => unknown; ownerDocument: Document | undefined };
const element = (overrides: Partial<Stub> = {}): Element => ({ tagName: 'DIV', shadowRoot: null, closest: () => null, getRootNode: () => ({}), ownerDocument: undefined, ...overrides }) as unknown as Element;
const inTree = (activeElement: Element | null) => element({ getRootNode: () => ({ activeElement }) });
const withGlobal = (name: 'document' | 'ShadowRoot', value: unknown, run: () => void) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try { run(); } finally { previous ? Object.defineProperty(globalThis, name, previous) : delete (globalThis as Record<string, unknown>)[name]; }
};
const withDocument = (activeElement: Element | null, run: () => void) => withGlobal('document', { activeElement }, run);

describe('shadow-aware focus helpers', () => {
  const input = element({ tagName: 'INPUT' });
  const inner = element({ shadowRoot: { activeElement: input } });
  const outer = element({ shadowRoot: { activeElement: inner } });

  it('resolves focus from the owning tree, which also covers closed shadow roots', () => {
    assert.equal(getActiveElement(inTree(input)), input);
    assert.equal(getActiveElement(inTree(null)), null);
    assert.equal(getActiveElement(element()), null);
  });
  it('follows nested open shadow roots down to the focused element', () => {
    assert.equal(getActiveElement(inTree(outer)), input);
    const plain = element();
    assert.equal(getActiveElement(inTree(plain)), plain);
  });
  it('walks from the document when no element is given', () => {
    withDocument(outer, () => assert.equal(getActiveElement(), input));
    withDocument(null, () => assert.equal(getActiveElement(), null));
    withDocument(null, () => assert.equal(getActiveElement(null), null));
  });
  it('tests event membership along the composed path and ignores empty entries', () => {
    const host = element();
    const event = { composedPath: () => [input, host, element()] } as unknown as Event;
    assert.equal(eventWithin(event, host), true);
    assert.equal(eventWithin(event, null, undefined, input), true);
    assert.equal(eventWithin(event, element()), false);
    assert.equal(eventWithin(event, null, undefined), false);
    assert.equal(eventWithin(event), false);
  });
  it('detects editing surfaces through shadow boundaries', () => {
    assert.equal(isInputFocused(inTree(input)), true);
    assert.equal(isInputFocused(inTree(element({ tagName: 'TEXTAREA' }))), true);
    assert.equal(isInputFocused(inTree(element({ contentEditable: 'true' }))), true);
    assert.equal(isInputFocused(inTree(element({ closest: selector => (selector.includes('[role="slider"]') ? element() : null) }))), true);
    assert.equal(isInputFocused(inTree(element())), false);
    assert.equal(isInputFocused(inTree(null)), false);
    assert.equal(isInputFocused(inTree(outer)), true);
    withDocument(outer, () => assert.equal(isInputFocused(), true));
    withDocument(element(), () => assert.equal(isInputFocused(), false));
  });
  it('observes focus departures on every enclosing shadow root and the document', () => {
    class FakeRoot {
      listeners = new Set<(event: Event) => void>();
      addEventListener(_type: string, listener: (event: Event) => void) { this.listeners.add(listener); }
      removeEventListener(_type: string, listener: (event: Event) => void) { this.listeners.delete(listener); }
      dispatch(path: unknown[]) { this.listeners.forEach(listener => listener({ composedPath: () => path } as unknown as Event)); }
    }
    class FakeShadowRoot extends FakeRoot { constructor(readonly host: Element) { super(); } }
    const doc = new FakeRoot();
    const ownerDocument = doc as unknown as Document;
    const outer = new FakeShadowRoot(element({ getRootNode: () => doc }));
    const inner = new FakeShadowRoot(element({ getRootNode: () => outer }));
    const popup = element({ getRootNode: () => inner, ownerDocument });
    const trigger = element({ getRootNode: () => doc, ownerDocument });
    const sizes = () => [inner, outer, doc].map(root => root.listeners.size);
    withGlobal('ShadowRoot', FakeShadowRoot, () => {
      // Light DOM registers on the document only; a node deep in nested roots registers on each root above it.
      observeFocusOutside([trigger], () => {})();
      assert.deepEqual(sizes(), [0, 0, 0]);
      let departures = 0;
      const stop = observeFocusOutside([popup, trigger], () => departures++);
      assert.deepEqual(sizes(), [1, 1, 1]);
      inner.dispatch([popup, inner]);
      doc.dispatch([trigger, doc]);
      assert.equal(departures, 0);
      outer.dispatch([element(), outer]);
      doc.dispatch([element(), doc]);
      assert.equal(departures, 2);
      stop();
      assert.deepEqual(sizes(), [0, 0, 0]);
    });
    assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'ShadowRoot'), undefined);
  });
});
