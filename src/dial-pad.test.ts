import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePadValue, padGridIntersection, padValueFromKey, padValueFromPoint, resolvePadAxis, snapPadAxis } from './dial-pad';
import { DialStore, flattenDialValueUpdates, resolveDialValues, type DialConfig, type DialPadConfig, type DialPadValue, type ResolvedValues } from './store/DialStore';

describe('DialPad', () => {
  it('resolves default and nested pads as typed pairs, without exposing their config', () => {
    const config = {
      position: { type: 'pad' },
      motion: { feel: { type: 'pad', x: [0.3, 0.1, 1, 0.01], y: [0.2, 0, 1, 0.01], labels: { x: 'Duration', y: 'Bounce' } } },
    } satisfies DialConfig;
    const values: ResolvedValues<typeof config> = resolveDialValues(config, {});
    const position: DialPadValue = values.position;
    const duration: number = values.motion.feel.x;
    assert.deepEqual(position, { x: 0, y: 0 });
    assert.equal(duration, 0.3);
    assert.deepEqual(values.motion.feel, { x: 0.3, y: 0.2 });
    assert.deepEqual(flattenDialValueUpdates(config, { position: { x: -0.5, y: 1 }, motion: { feel: { x: 0.8, y: 0.4 } } }), {
      position: { x: -0.5, y: 1 }, 'motion.feel': { x: 0.8, y: 0.4 },
    });
    const id = 'pad-defaults';
    try {
      DialStore.registerPanel(id, 'Pads', config);
      assert.deepEqual(DialStore.getPanel(id)!.controls.map(c => c.type), ['pad', 'folder']);
      assert.deepEqual(DialStore.getPanel(id)!.controls[1].children![0].pad, config.motion.feel);
      assert.deepEqual(resolveDialValues(config, DialStore.getValues(id)), values);
      assert.deepEqual(Object.keys(DialStore.getValues(id)), ['position', 'motion.feel']);
    } finally { DialStore.unregisterPanel(id); }
  });

  it('maps all four corners with positive Y upward, and clamps outside the field', () => {
    assert.deepEqual(padValueFromPoint(0, 0), { x: -1, y: 1 });
    assert.deepEqual(padValueFromPoint(1, 0), { x: 1, y: 1 });
    assert.deepEqual(padValueFromPoint(0, 1), { x: -1, y: -1 });
    assert.deepEqual(padValueFromPoint(1, 1), { x: 1, y: -1 });
    assert.deepEqual(padValueFromPoint(0.5, 0.5), { x: 0, y: 0 });
    assert.deepEqual(padValueFromPoint(-4, 3), { x: -1, y: -1 });
    assert.deepEqual(padValueFromPoint(0.5, 0.25, { x: [25, 0, 100, 1], y: [10, -20, 20, 1] }), { x: 50, y: 10 });
  });

  it('snaps relative to each minimum, supports tiny steps, and keeps endpoints reachable', () => {
    const axis = resolvePadAxis([0.05, 0.05, 0.98, 0.1]);
    assert.equal(snapPadAxis(0.26, axis), 0.25);
    assert.equal(snapPadAxis(0.98, axis), 0.98);
    assert.equal(snapPadAxis(50, axis), 0.98);
    assert.equal(snapPadAxis(-50, axis), 0.05);
    assert.equal(snapPadAxis(0.00000026, resolvePadAxis([0, 0, 0.000001, 0.0000001])), 0.0000003);
    assert.equal(resolvePadAxis([0, -100, 100]).step, 1);
    assert.deepEqual(normalizePadValue({ x: NaN, y: Infinity }), { x: 0, y: 0 });
    assert.deepEqual(normalizePadValue(null, { x: [4, 0, 10, 1] }), { x: 4, y: 0 });
    assert.throws(() => resolvePadAxis([0, 1, 1]), RangeError);
    assert.throws(() => resolvePadAxis([0, 1, -1]), RangeError);
    assert.throws(() => resolvePadAxis([0, -1, 1, 0]), RangeError);
    assert.throws(() => resolvePadAxis([0, -Infinity, 1]), RangeError);
  });

  it('snaps clicks within eight pixels of both grid lines, including the center', () => {
    assert.deepEqual(padGridIntersection(152, 147, 300, 300), { x: 150, y: 150 });
    assert.deepEqual(padGridIntersection(158, 142, 300, 300), { x: 150, y: 150 });
    assert.deepEqual(padGridIntersection(52, 247, 300, 300), { x: 50, y: 250 });
    assert.equal(padGridIntersection(158.01, 150, 300, 300), undefined);
    assert.equal(padGridIntersection(150, 141.99, 300, 300), undefined);
    assert.equal(padGridIntersection(152, 175, 300, 300), undefined);
    assert.equal(padGridIntersection(2, 2, 300, 300), undefined);
  });

  it('keeps the click tolerance at eight pixels at different field sizes', () => {
    assert.deepEqual(padGridIntersection(122, 123, 240, 240), { x: 120, y: 120 });
    assert.deepEqual(padGridIntersection(247, 234, 480, 480), { x: 240, y: 240 });
    assert.equal(padGridIntersection(249, 240, 480, 480), undefined);
    assert.equal(padGridIntersection(0, 0, 0, 0), undefined);
    // Free positioning remains available in the same region used for snapping clicks.
    assert.deepEqual(padValueFromPoint(0.51, 0.49), { x: 0.02, y: 0.02 });
  });

  it('adjusts only the intended axis with the keyboard and supports coarse steps', () => {
    const value = { x: 0.4, y: -0.3 };
    assert.deepEqual(padValueFromKey(value, 'ArrowRight', false), { x: 0.41, y: -0.3 });
    assert.deepEqual(padValueFromKey(value, 'ArrowLeft', true), { x: 0.3, y: -0.3 });
    assert.deepEqual(padValueFromKey(value, 'ArrowUp', false), { x: 0.4, y: -0.29 });
    assert.deepEqual(padValueFromKey(value, 'ArrowDown', true), { x: 0.4, y: -0.4 });
    assert.deepEqual(padValueFromKey({ x: 1, y: 1 }, 'ArrowUp', true), { x: 1, y: 1 });
    assert.equal(padValueFromKey(value, 'Tab', false), undefined);
  });

  it('updates both axes atomically, preserves presets, reconciles ranges, and resets the current version', () => {
    const id = 'pad-presets';
    const config = { position: { type: 'pad' } } satisfies DialConfig;
    try {
      DialStore.registerPanel(id, 'Pad', config);
      const updates: DialPadValue[] = [];
      const unsubscribe = DialStore.subscribe(id, () => updates.push(DialStore.getValue(id, 'position') as DialPadValue));
      DialStore.updateValues(id, flattenDialValueUpdates(config, { position: { x: 0.8, y: -0.6 } }));
      unsubscribe();
      assert.deepEqual(updates, [{ x: 0.8, y: -0.6 }]);
      const preset = DialStore.savePreset(id, 'Offset');
      DialStore.clearActivePreset(id);
      DialStore.updateValue(id, 'position', { x: -0.2, y: 0.5 });
      DialStore.loadPreset(id, preset);
      assert.deepEqual(DialStore.getValue(id, 'position'), { x: 0.8, y: -0.6 });
      const next = { position: { type: 'pad', x: [0.1, -0.5, 0.5, 0.1], y: [0.2, 0, 1, 0.1] } } satisfies DialConfig;
      DialStore.updatePanel(id, 'Updated pad', next);
      assert.deepEqual(DialStore.getValue(id, 'position'), { x: 0.5, y: 0 });
      DialStore.updateValue(id, 'position', { x: 90, y: 0.26 });
      assert.deepEqual(DialStore.getValue(id, 'position'), { x: 0.5, y: 0.3 });
      DialStore.resetValues(id);
      assert.deepEqual(DialStore.getValue(id, 'position'), { x: 0.5, y: 0 });
      DialStore.updatePanel(id, 'Slider', { position: [0.5, 0, 1] });
      assert.equal(DialStore.getValue(id, 'position'), 0.5);
      DialStore.updatePanel(id, 'Pad again', config);
      assert.deepEqual(DialStore.getValue(id, 'position'), { x: 0, y: 0 });
    } finally { DialStore.unregisterPanel(id); }
  });

  it('restores persisted pairs and rejects malformed stored coordinates', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } } });
    const config = { position: { type: 'pad' } } satisfies Record<string, DialPadConfig>;
    const options = { persist: { key: 'pad-test-storage' } };
    try {
      DialStore.registerPanel('pad-persist-source', 'Pad', config, undefined, options);
      DialStore.updateValue('pad-persist-source', 'position', { x: -0.75, y: 0.25 });
      DialStore.savePreset('pad-persist-source', 'Saved');
      DialStore.unregisterPanel('pad-persist-source');
      DialStore.registerPanel('pad-persist-restored', 'Pad', config, undefined, options);
      assert.deepEqual(DialStore.getValue('pad-persist-restored', 'position'), { x: -0.75, y: 0.25 });
      assert.equal(DialStore.getPresets('pad-persist-restored').length, 1);
      storage.set('pad-test-storage', JSON.stringify({ version: 1, values: { position: { x: 'invalid', y: 5 } } }));
      DialStore.registerPanel('pad-persist-invalid', 'Pad', config, undefined, options);
      assert.deepEqual(DialStore.getValue('pad-persist-invalid', 'position'), { x: 0, y: 1 });
    } finally {
      for (const id of ['pad-persist-source', 'pad-persist-restored', 'pad-persist-invalid']) DialStore.unregisterPanel(id);
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
