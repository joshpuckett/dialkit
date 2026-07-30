import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DialStore } from './store/DialStore';

describe('DialStore panel open state', () => {
  it('starts collapsed when the panel registers with collapsed: true', () => {
    const id = 'open-collapsed';
    DialStore.registerPanel(id, id, { size: 1 }, undefined, { collapsed: true });

    assert.equal(DialStore.isPanelOpen(id), false);
    assert.equal(DialStore.getPanelOpen(id), false);

    DialStore.unregisterPanel(id);
  });

  it('leaves open state unset without the option so hosts can seed their own default', () => {
    const id = 'open-unset';
    DialStore.registerPanel(id, id, { size: 1 });

    assert.equal(DialStore.getPanelOpen(id), undefined);
    assert.equal(DialStore.isPanelOpen(id), true);

    DialStore.unregisterPanel(id);
  });

  it('sets and toggles open state, notifying subscribers', () => {
    const id = 'open-toggle';
    DialStore.registerPanel(id, id, { size: 1 });
    let notifications = 0;
    const unsubscribe = DialStore.subscribe(id, () => { notifications += 1; });

    DialStore.setPanelOpen(id, false);
    assert.equal(DialStore.isPanelOpen(id), false);
    assert.equal(notifications, 1);

    // Setting the same value is a no-op.
    DialStore.setPanelOpen(id, false);
    assert.equal(notifications, 1);

    DialStore.togglePanelOpen(id);
    assert.equal(DialStore.isPanelOpen(id), true);
    assert.equal(notifications, 2);

    unsubscribe();
    DialStore.unregisterPanel(id);
  });

  it('initPanelOpen only applies while no state exists', () => {
    const id = 'open-init';
    DialStore.registerPanel(id, id, { size: 1 }, undefined, { collapsed: true });

    DialStore.initPanelOpen(id, true);
    assert.equal(DialStore.isPanelOpen(id), false);

    DialStore.unregisterPanel(id);
  });

  it('clears open state on unregister but retains it for panels with a stable id', () => {
    const transient = 'open-transient';
    DialStore.registerPanel(transient, transient, { size: 1 }, undefined, { collapsed: true });
    DialStore.unregisterPanel(transient);
    assert.equal(DialStore.getPanelOpen(transient), undefined);

    const retained = 'open-retained';
    DialStore.registerPanel(retained, retained, { size: 1 }, undefined, { retainOnUnmount: true });
    DialStore.setPanelOpen(retained, false);
    DialStore.unregisterPanel(retained);
    assert.equal(DialStore.getPanelOpen(retained), false);
  });
});
