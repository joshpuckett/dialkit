import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DialStore } from './store/DialStore';

describe('DialStore panel order', () => {
  it('sorts ordered panels before unordered panels while preserving registration order for ties', () => {
    const ids = ['order-unordered-first', 'order-two', 'order-one', 'order-unordered-second'];

    DialStore.registerPanel(ids[0], ids[0], { size: 1 });
    DialStore.registerPanel(ids[1], ids[1], { size: 1 }, undefined, { order: 2 });
    DialStore.registerPanel(ids[2], ids[2], { size: 1 }, undefined, { order: 1 });
    DialStore.registerPanel(ids[3], ids[3], { size: 1 });

    assert.deepEqual(DialStore.getPanels('panel').map((panel) => panel.id), [ids[2], ids[1], ids[0], ids[3]]);

    ids.forEach((id) => DialStore.unregisterPanel(id));
  });

  it('updates a panel order without disturbing panels with the same order', () => {
    const ids = ['order-update-first', 'order-update-second', 'order-update-third'];

    DialStore.registerPanel(ids[0], ids[0], { size: 1 }, undefined, { order: 2 });
    DialStore.registerPanel(ids[1], ids[1], { size: 1 }, undefined, { order: 2 });
    DialStore.registerPanel(ids[2], ids[2], { size: 1 }, undefined, { order: 3 });
    DialStore.updatePanel(ids[2], ids[2], { size: 1 }, undefined, { order: 1 });

    assert.deepEqual(DialStore.getPanels('panel').map((panel) => panel.id), [ids[2], ids[0], ids[1]]);

    ids.forEach((id) => DialStore.unregisterPanel(id));
  });
});
