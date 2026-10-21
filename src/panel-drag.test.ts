import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPanelCorner, getPanelKeyboardOffset, getPanelOriginX, getPanelOriginY, capturePanelPointer, releasePanelPointer } from './panel-drag';

describe('panel snap corner and animation origin', () => {
  it('handles a pointer ending while the drag handle is being replaced', () => {
    const handle = {
      setPointerCapture() { throw new DOMException('Pointer ended', 'NotFoundError'); },
      hasPointerCapture() { return true; },
      releasePointerCapture() { throw new DOMException('Handle detached', 'InvalidStateError'); },
    } as unknown as HTMLElement;
    assert.doesNotThrow(() => capturePanelPointer(handle, 1));
    assert.doesNotThrow(() => releasePanelPointer(handle, 1));
    const broken = { setPointerCapture() { throw new Error('Unexpected'); } } as unknown as HTMLElement;
    assert.throws(() => capturePanelPointer(broken, 1), /Unexpected/);
  });
  it('uses the configured corner before the bubble is dragged', () => {
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      assert.equal(getPanelCorner(corner, null, 1000, 800), corner);
    }
  });

  it('uses both axes of the dragged bubble center in every quadrant', () => {
    for (const [offset, corner] of [
      [{ x: 100, y: 100 }, 'top-left'],
      [{ x: 700, y: 100 }, 'top-right'],
      [{ x: 100, y: 600 }, 'bottom-left'],
      [{ x: 700, y: 600 }, 'bottom-right'],
    ] as const) {
      assert.equal(getPanelCorner('top-right', offset, 1000, 800), corner);
      assert.equal(`${getPanelOriginY('top-right', offset, 800)}-${getPanelOriginX('top-right', offset, 1000)}`, corner);
    }
  });

  it('classifies by the center rather than the top-left edge', () => {
    assert.equal(getPanelCorner('top-left', { x: 478, y: 378 }, 1000, 800), 'top-left');
    assert.equal(getPanelCorner('top-left', { x: 479, y: 379 }, 1000, 800), 'bottom-right');
  });

  it('uses the current viewport when snapping after a resize', () => {
    const offset = { x: 400, y: 300 };
    assert.equal(getPanelCorner('top-right', offset, 1000, 800), 'top-left');
    assert.equal(getPanelCorner('top-right', offset, 600, 500), 'bottom-right');
  });

  it('falls back to the configured origin during server rendering', () => {
    assert.equal(getPanelCorner('bottom-left', { x: 100, y: 100 }), 'bottom-left');
  });
});

describe('panel keyboard offset', () => {
  const rect = { left: 100, top: 200, width: 280, height: 300 };

  it('moves from the current position by the step', () => {
    assert.deepEqual(getPanelKeyboardOffset(rect, 10, 0, 1000, 800), { x: 110, y: 200 });
    assert.deepEqual(getPanelKeyboardOffset(rect, 0, -50, 1000, 800), { x: 100, y: 150 });
  });

  it('keeps the whole panel inside the viewport', () => {
    assert.deepEqual(getPanelKeyboardOffset(rect, -500, -500, 1000, 800), { x: 0, y: 0 });
    assert.deepEqual(getPanelKeyboardOffset(rect, 1000, 1000, 1000, 800), { x: 720, y: 500 });
    assert.deepEqual(getPanelKeyboardOffset({ left: 950, top: 750, width: 42, height: 42 }, 50, 50, 1000, 800), { x: 958, y: 758 });
  });

  it('pins a panel larger than the viewport to the top-left corner', () => {
    assert.deepEqual(getPanelKeyboardOffset(rect, 10, 10, 200, 250), { x: 0, y: 0 });
  });
});
