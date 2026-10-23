import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DialStore, type DialConfig } from './store/DialStore';

function withStorage(run: (storage: Map<string, string>, writes: () => number) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map<string, string>();
  let writes = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; storage.set(key, value); },
  } } });
  try { run(storage, () => writes); }
  finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

describe('DialStore persistence', () => {
  it('recovers from malformed JSON, records, preset entries, and transition modes', () => withStorage(storage => {
    const config = { amount: [2, 0, 10], transition: { type: 'spring', visualDuration: 0.3, bounce: 0.2 } } satisfies DialConfig;
    const records = ['{', 'null', '[]', JSON.stringify({ version: 2 }),
      JSON.stringify({ version: 1, values: [], presets: {} }),
      JSON.stringify({ version: 1, values: { amount: 'bad', 'transition.__mode': 'bad' }, presets: [null, 1, {}, { id: 'bad', name: 'Bad', values: null }], activePresetId: 'missing' }),
    ];
    records.forEach((raw, index) => {
      const id = `persist-malformed-${index}`;
      storage.set(id, raw);
      try {
        DialStore.registerPanel(id, 'Config', config, undefined, { persist: { key: id } });
        assert.equal(DialStore.getValue(id, 'amount'), 2);
        assert.equal(DialStore.getTransitionMode(id, 'transition'), 'simple');
        assert.deepEqual(DialStore.getPresets(id), []);
        assert.equal(DialStore.getActivePresetId(id), null);
      } finally { DialStore.unregisterPanel(id); }
    });
  }));

  it('restores values without preset state when preset persistence is disabled', () => withStorage(storage => {
    const id = 'persist-values-only';
    storage.set(id, JSON.stringify({ version: 1, values: { amount: 7 }, baseValues: { amount: 2 },
      presets: [{ id: 'saved', name: 'Saved', values: { amount: 7 } }], activePresetId: 'saved' }));
    try {
      DialStore.registerPanel(id, 'Config', { amount: [1, 0, 10] }, undefined, { persist: { key: id, presets: false } });
      assert.equal(DialStore.getValue(id, 'amount'), 7);
      assert.deepEqual(DialStore.getPresets(id), []);
      assert.equal(DialStore.getActivePresetId(id), null);
      DialStore.clearActivePreset(id);
      assert.equal(DialStore.getValue(id, 'amount'), 7);
      assert.deepEqual(JSON.parse(storage.get(id)!), { version: 1, values: { amount: 7 } });
    } finally { DialStore.unregisterPanel(id); }
  }));

  it('writes once per changed batch, skips unchanged values, and honors persist: false', () => withStorage((storage, writes) => {
    const id = 'persist-writes';
    const config = { amount: [1, 0, 10], enabled: true } satisfies DialConfig;
    try {
      DialStore.registerPanel(id, 'Config', config, undefined, { persist: { key: id } });
      const initialWrites = writes();
      DialStore.updateValues(id, { amount: 1, enabled: true });
      assert.equal(writes(), initialWrites);
      DialStore.updateValues(id, { amount: 2, enabled: false });
      assert.equal(writes(), initialWrites + 1);
      const saved = storage.get(id);
      DialStore.updatePanel(id, 'Config', config, undefined, { persist: false });
      DialStore.updateValue(id, 'amount', 3);
      assert.equal(writes(), initialWrites + 1);
      assert.equal(storage.get(id), saved);
      assert.equal(DialStore.getValue(id, 'amount'), 3);
    } finally { DialStore.unregisterPanel(id); }
  }));
});

for (const legacy of [false, true]) {
  it(`preserves reset baselines after storage reload (legacy: ${legacy})`, () => withStorage(storage => {
    const source = `reset-persist-source-${legacy}`;
    const target = `reset-persist-target-${legacy}`;
    const key = `reset-persist-${legacy}`;
    const config = { amount: [1, 0, 10] } satisfies DialConfig;
    try {
      DialStore.registerPanel(source, 'Source', config, undefined, { persist: { key } });
      DialStore.updateValue(source, 'amount', 3);
      const preset = DialStore.saveNewPreset(source);
      DialStore.updateValue(source, 'amount', 7);
      if (legacy) {
        const saved = JSON.parse(storage.get(key)!);
        delete saved.presets[0].initialValues;
        storage.set(key, JSON.stringify(saved));
      }
      DialStore.registerPanel(target, 'Restored', config, undefined, { persist: { key } });
      assert.equal(DialStore.getValue(target, 'amount'), 7);
      DialStore.updateValue(target, 'amount', 9);
      DialStore.resetValues(target);
      assert.equal(DialStore.getActivePresetId(target), preset);
      assert.equal(DialStore.getValue(target, 'amount'), legacy ? 7 : 3);
      const saved = JSON.parse(storage.get(key)!);
      assert.equal(saved.activePresetId, preset);
      assert.equal(saved.presets[0].values.amount, legacy ? 7 : 3);
      assert.equal(saved.presets[0].initialValues.amount, legacy ? 7 : 3);
      assert.equal(saved.baseValues.amount, 3);
    } finally {
      DialStore.unregisterPanel(source);
      DialStore.unregisterPanel(target);
    }
  }));
}
