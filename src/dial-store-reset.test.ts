import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DialStore } from './store/DialStore';

it('resets only the selected version to its creation state, including transition modes', () => {
  const id = 'reset-selected-version';
  DialStore.registerPanel(id, 'Reset', {
    amount: [1, 0, 10],
    transition: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
  });
  try {
    DialStore.updateValue(id, 'amount', 3);
    DialStore.updateTransitionMode(id, 'transition', 'advanced');
    const second = DialStore.saveNewPreset(id);
    DialStore.updateValue(id, 'amount', 5);
    const third = DialStore.saveNewPreset(id);
    DialStore.updateValue(id, 'amount', 9);
    DialStore.clearActivePreset(id);
    DialStore.updateValue(id, 'amount', 4);
    DialStore.loadPreset(id, second);
    DialStore.updateTransitionMode(id, 'transition', 'easing');
    const before = DialStore.getValues(id);
    let notifications = 0;
    const unsubscribe = DialStore.subscribe(id, () => notifications++);
    DialStore.resetValues(id);
    unsubscribe();
    assert.equal(notifications, 1);
    assert.notEqual(DialStore.getValues(id), before);
    assert.equal(before.amount, 5);
    assert.equal(DialStore.getActivePresetId(id), second);
    assert.equal(DialStore.getValue(id, 'amount'), 3);
    assert.equal(DialStore.getTransitionMode(id, 'transition'), 'advanced');
    DialStore.updateValue(id, 'amount', 7);
    DialStore.resetValues(id);
    assert.equal(DialStore.getValue(id, 'amount'), 3);
    DialStore.clearActivePreset(id);
    assert.equal(DialStore.getValue(id, 'amount'), 4);
    DialStore.resetValues(id);
    assert.equal(DialStore.getActivePresetId(id), null);
    assert.equal(DialStore.getValue(id, 'amount'), 1);
    DialStore.loadPreset(id, third);
    assert.equal(DialStore.getValue(id, 'amount'), 9);
    DialStore.resetValues(id);
    assert.equal(DialStore.getValue(id, 'amount'), 5);
    DialStore.loadPreset(id, second);
    assert.equal(DialStore.getValue(id, 'amount'), 3);
  } finally { DialStore.unregisterPanel(id); }
});
