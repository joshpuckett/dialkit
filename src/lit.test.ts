import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { build } from 'esbuild';
import type { ReactiveController } from 'lit';
import { DialKitController, createDialKit, createDialKitController } from './lit/DialKitController';
import { DialTimelineController } from './lit/DialTimelineController';
import { DialRoot, DialTimeline, booleanAttribute, defineDialKitElements, optionalBooleanAttribute } from './lit/elements';
import { dialKitStyles, ensureDocumentStyles, ensureShadowStyles } from './lit/styles';
import { DialStore, type DialConfig } from './store/DialStore';
import { TimelineStore } from './store/TimelineStore';

/** The parts of ReactiveControllerHost the controllers use, with manual connect/disconnect. */
function fakeHost() {
  const controllers = new Set<ReactiveController>();
  return {
    updates: 0,
    addController: (controller: ReactiveController) => { controllers.add(controller); },
    removeController: (controller: ReactiveController) => { controllers.delete(controller); },
    requestUpdate() { this.updates++; },
    updateComplete: Promise.resolve(true),
    connect() { controllers.forEach(controller => controller.hostConnected?.()); },
    disconnect() { controllers.forEach(controller => controller.hostDisconnected?.()); },
  };
}

const config = { amount: [0.25, 0, 1, 0.05], group: { enabled: true, run: { type: 'action' } } } satisfies DialConfig;

describe('Lit adapter', () => {
  it('caches the snapshot per store change and re-renders once per batch', () => {
    const host = fakeHost();
    const dial = new DialKitController(host, 'Cache', config);
    assert.equal(createDialKitController, createDialKit);
    const before = dial.values;
    assert.equal(dial.values, before, 'unchanged store keeps the same snapshot object');
    assert.deepEqual(before, { amount: 0.25, group: { enabled: true, run: config.group.run } });
    host.connect();
    assert.equal(host.updates, 1, 'connecting requests one update for retained values');
    assert.notEqual(dial.values, before, 'registration publishes a new snapshot');
    const registered = dial.values;
    dial.setValues({ amount: 0.8, group: { enabled: false } });
    assert.equal(host.updates, 2, 'one update per batched change');
    assert.notEqual(dial.values, registered);
    assert.deepEqual(dial.values, { amount: 0.8, group: { enabled: false, run: config.group.run } });
    assert.equal(dial.getValues(), dial.values);
    dial.setValue('amount', 0.5);
    assert.equal(dial.values.amount, 0.5);
    host.disconnect();
    assert.equal(DialStore.getPanel(dial.id), undefined);
  });

  it('delivers actions only while connected and honours a swapped onAction', () => {
    const host = fakeHost();
    const actions: string[] = [];
    const options = { onAction: (path: string) => actions.push(`first:${path}`) };
    const dial = createDialKit(host, 'Actions', config, options);
    DialStore.triggerAction(dial.id, 'group.run');
    host.connect();
    DialStore.triggerAction(dial.id, 'group.run');
    options.onAction = path => actions.push(`second:${path}`);
    DialStore.triggerAction(dial.id, 'group.run');
    host.disconnect();
    DialStore.triggerAction(dial.id, 'group.run');
    assert.deepEqual(actions, ['first:group.run', 'second:group.run']);
  });

  it('reconnects with defaults for anonymous panels and retained values for stable IDs', () => {
    const anonymous = fakeHost();
    const dial = new DialKitController(anonymous, 'Anonymous', config);
    anonymous.connect();
    dial.setValue('amount', 0.9);
    anonymous.disconnect();
    anonymous.connect();
    assert.equal(dial.values.amount, 0.25);
    anonymous.disconnect();

    const stable = fakeHost();
    const shared = new DialKitController(stable, 'Shared', config, { id: 'lit-shared', defaultCollapsed: true });
    stable.connect();
    stable.connect();
    assert.equal(shared.getOpen(), false);
    shared.setOpen(true);
    assert.equal(shared.getOpen(), true);
    shared.setValue('amount', 0.6);
    stable.disconnect();
    stable.disconnect();
    assert.equal(DialStore.getPanel('lit-shared'), undefined);
    stable.connect();
    assert.equal(shared.values.amount, 0.6, 'a stable id retains values across host reconnects');
    stable.disconnect();
  });

  it('releases only registrations it acquired when a config is rejected', () => {
    const owner = fakeHost();
    const live = new DialKitController(owner, 'Shared', { amount: [0.5, 0, 1, 0.1] }, { id: 'lit-rejected' });
    owner.connect();
    live.setValue('amount', 0.7);
    const rejected = fakeHost();
    const invalid = new DialKitController(rejected, 'Shared', { position: { type: 'pad', x: [0, 1, 1] } } as DialConfig, { id: 'lit-rejected' });
    assert.throws(() => rejected.connect(), RangeError);
    rejected.disconnect();
    assert.equal(DialStore.getPanel('lit-rejected')?.name, 'Shared', 'the live owner keeps its registration');
    assert.equal(live.values.amount, 0.7);
    invalid.updateConfig({ position: { type: 'pad', x: [0, -1, 1] } } as DialConfig);
    rejected.connect();
    assert.equal(rejected.updates > 0, true, 'a corrected config connects on retry');
    rejected.disconnect();
    assert.equal(DialStore.getPanel('lit-rejected')?.name, 'Shared');
    owner.disconnect();
    assert.equal(DialStore.getPanel('lit-rejected'), undefined);
  });

  it('applies config updates before and after connecting', () => {
    const host = fakeHost();
    const dial = new DialKitController(host, 'Config', { amount: [0.5, 0, 1, 0.1] });
    dial.updateConfig({ amount: [0.3, 0, 1, 0.1] });
    assert.equal(dial.values.amount, 0.3);
    assert.equal(host.updates, 1);
    host.connect();
    dial.setValue('amount', 0.9);
    dial.updateConfig({ amount: [0.2, 0, 0.6, 0.1] });
    assert.equal(dial.values.amount, 0.6, 'edits are clamped to the new range');
    dial.resetValues();
    assert.equal(dial.values.amount, 0.2);
    host.disconnect();
  });

  it('samples the timeline controller before connecting and follows edits afterwards', () => {
    const host = fakeHost();
    const timeline = new DialTimelineController(host, 'Timeline', { clip: { at: 0.25, duration: 1 } }, { autoplay: false });
    assert.equal(timeline.values.duration, 1.25);
    assert.equal(timeline.values.clip.at, 0.25);
    host.connect();
    assert.equal(TimelineStore.getTimeline(timeline.id)?.duration, 1.25);
    const frame = timeline.values;
    assert.equal(timeline.values, frame, 'reads within one frame share a snapshot');
    const updates = host.updates;
    DialStore.updateValue(timeline.id, 'clip.duration', 1.5);
    assert.equal(host.updates, updates + 1, 'one timing edit requests one host update');
    assert.notEqual(timeline.values, frame);
    assert.equal(timeline.values.clip.duration, 1.5);
    const edited = timeline.values;
    timeline.seek(0.5);
    assert.notEqual(timeline.values, edited);
    assert.equal(timeline.values.time, 0.5);
    host.disconnect();
    host.disconnect();
    assert.equal(TimelineStore.getTimeline(timeline.id), undefined);
    assert.equal(DialStore.getPanel(timeline.id), undefined);
  });

  it('releases a timeline registration acquired before a subscriber threw', () => {
    const config = { clip: { at: 0, duration: 1 } };
    // A live owner registered without subscriptions, so only the new registration reaches the failing subscriber.
    const id = 'lit-timeline-rollback';
    DialStore.registerPanel(id, 'Shared', { clip: { at: [0, 0, 1, 0.01], duration: [1, 0, 1, 0.01] } }, undefined, { kind: 'timeline' });
    TimelineStore.register({ id, name: 'Shared', duration: 1, loop: false, loopStart: 0, clips: [] }, { autoplay: false });
    const failing = fakeHost();
    const rejected = new DialTimelineController(failing, 'Shared', config, { id, autoplay: false });
    const stop = TimelineStore.subscribeGlobal(() => { throw new Error('subscriber failed'); });
    try {
      assert.throws(() => failing.connect(), /subscriber failed/);
    } finally { stop(); }
    failing.disconnect();
    assert.equal(TimelineStore.getTimeline(id)?.duration, 1, 'the live owner keeps its timeline');
    assert.equal(DialStore.getPanel(id)?.kind, 'timeline', 'the live owner keeps its panel');
    failing.connect();
    assert.equal(rejected.values.duration, 1, 'a retry connects once the subscriber is gone');
    failing.disconnect();
    TimelineStore.unregister(id);
    DialStore.unregisterPanel(id);
    assert.equal(TimelineStore.getTimeline(id), undefined, 'the failed attempt left no registration behind');
    assert.equal(DialStore.getPanel(id), undefined);

    const alone = fakeHost();
    const solo = new DialTimelineController(alone, 'Solo', config, { id: 'lit-timeline-solo', autoplay: false });
    const stopAgain = TimelineStore.subscribeGlobal(() => { throw new Error('subscriber failed'); });
    try {
      assert.throws(() => alone.connect(), /subscriber failed/);
    } finally { stopAgain(); }
    assert.equal(TimelineStore.getTimeline('lit-timeline-solo'), undefined, 'nothing leaks when the failed connection was the only owner');
    assert.equal(DialStore.getPanel('lit-timeline-solo'), undefined);
    alone.disconnect();
    assert.equal(solo.values.duration, 1);
  });

  it('registers the elements once with attribute converters that accept "false"', () => {
    assert.equal(customElements.get('dialkit-root'), DialRoot);
    assert.equal(customElements.get('dialkit-timeline'), DialTimeline);
    assert.doesNotThrow(() => { defineDialKitElements(); defineDialKitElements(); });
    const root = new DialRoot();
    assert.deepEqual([root.position, root.defaultOpen, root.mode, root.theme, root.productionEnabled], ['top-right', true, 'popover', 'system', true]);
    const timeline = new DialTimeline();
    assert.deepEqual([timeline.theme, timeline.defaultVisible, timeline.visible, timeline.defaultOpen, timeline.productionEnabled], ['system', true, undefined, true, true]);
    for (const [attribute, expected] of [['', true], ['true', true], ['false', false], [null, false]] as const) {
      assert.equal(booleanAttribute.fromAttribute(attribute), expected);
      assert.equal(optionalBooleanAttribute.fromAttribute(attribute), attribute === null ? undefined : expected);
    }
    assert.equal(booleanAttribute.toAttribute(true), '');
    assert.equal(booleanAttribute.toAttribute(false), null);
    assert.equal(optionalBooleanAttribute.toAttribute(undefined), null);
    assert.ok(dialKitStyles.cssText.includes('.dialkit-root'));
    assert.ok(!dialKitStyles.cssText.includes('@import'), 'constructable sheets reject @import');
  });

  it('marks the style elements it creates with litNonce', () => {
    type FakeStyle = { id?: string; textContent: string; attributes: Record<string, string>; setAttribute(name: string, value: string): void };
    const fakeDocument = () => {
      const head: FakeStyle[] = [];
      const doc = {
        head: { appendChild: (style: FakeStyle) => head.push(style) },
        getElementById: (id: string) => head.find(style => style.id === id) ?? null,
        createElement: (): FakeStyle => ({ textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }),
      };
      return { doc: doc as unknown as Document, head };
    };
    const fakeShadow = (doc: Document) => {
      const styles: FakeStyle[] = [];
      const root = { ownerDocument: doc, querySelector: () => styles[0] ?? null, prepend: (style: FakeStyle) => styles.unshift(style) };
      return { root: root as unknown as ShadowRoot, styles };
    };
    const global = globalThis as { litNonce?: string };
    global.litNonce = 'test-nonce';
    try {
      const { doc, head } = fakeDocument();
      ensureDocumentStyles(doc);
      ensureDocumentStyles(doc);
      assert.equal(head.length, 1, 'the document stylesheet is injected once');
      assert.equal(head[0].id, 'dialkit-theme');
      assert.equal(head[0].attributes.nonce, 'test-nonce');
      assert.ok(head[0].textContent.includes('.dialkit-root'));
      // Node has no constructable stylesheets, so this exercises the <style> fallback.
      const { root, styles } = fakeShadow(doc);
      ensureShadowStyles(root);
      ensureShadowStyles(root);
      assert.equal(styles.length, 1, 'the shadow fallback is injected once');
      assert.equal(styles[0].attributes.nonce, 'test-nonce');
      assert.ok(styles[0].textContent.includes('.dialkit-root'));
    } finally {
      delete global.litNonce;
    }
    const { doc, head } = fakeDocument();
    ensureDocumentStyles(doc);
    ensureShadowStyles(fakeShadow(doc).root);
    assert.ok(!('nonce' in head[0].attributes), 'no nonce attribute without litNonce');
  });

  it('bundles with lit as its only external import', async () => {
    const result = await build({ entryPoints: ['src/lit/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', metafile: true, external: ['lit'] });
    assert.ok(Object.values(result.metafile!.outputs).every(output => output.imports.every(entry => entry.path === 'lit')));
    assert.ok(Object.keys(result.metafile!.inputs).every(input => !input.includes('node_modules')));
    const text = result.outputFiles[0].text;
    assert.ok(text.includes('customElements'));
    assert.ok(!text.includes('@lit/reactive-element'));
  });
});
