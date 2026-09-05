import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sliderKeyValue, optionKeyIndex, handleSliderKey, activateOnKey, nudgeInputValue, handleInputNudge } from './control-keyboard';

function event(key: string, sameTarget = true) {
  const target = {} as EventTarget;
  return { key, target, currentTarget: sameTarget ? target : {} as EventTarget,
    shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}

describe('control keyboard navigation', () => {
  it('steps in both directions without accumulating floating point error', () => {
    for (const key of ['ArrowRight', 'ArrowUp']) assert.equal(sliderKeyValue(key, 0.2, 0, 1, 0.1), 0.3);
    for (const key of ['ArrowLeft', 'ArrowDown']) assert.equal(sliderKeyValue(key, 0.3, 0, 1, 0.1), 0.2);
    assert.equal(sliderKeyValue('ArrowRight', 0.15, 0.05, 1, 0.1), 0.25);
    assert.equal(sliderKeyValue('ArrowUp', 0.00002, 0, 1, 0.00001), 0.00003);
  });
  it('supports coarse steps and exact endpoints, including a partial last step', () => {
    assert.equal(sliderKeyValue('PageUp', 20, 0, 100, 2), 40);
    assert.equal(sliderKeyValue('PageDown', 20, 0, 100, 2), 0);
    assert.equal(sliderKeyValue('ArrowRight', 20, 0, 100, 2, true), 40);
    assert.equal(sliderKeyValue('Home', 3, -1, 4.5, 2), -1);
    assert.equal(sliderKeyValue('End', 3, -1, 4.5, 2), 4.5);
    assert.equal(sliderKeyValue('ArrowRight', 4, 0, 4.5, 2), 4.5);
    assert.equal(sliderKeyValue('ArrowLeft', 4.5, 0, 4.5, 2), 4);
    assert.equal(sliderKeyValue('ArrowLeft', 0, 0, 100, 1), 0);
    assert.equal(sliderKeyValue('ArrowRight', 1, 1, 1, 1), 1);
  });
  it('consumes only slider keys, leaving text editing, Tab, and browser shortcuts alone', () => {
    const changes: number[] = []; let edits = 0;
    const run = (e: ReturnType<typeof event>) => handleSliderKey(e, 2, 0, 10, 1, v => changes.push(v), () => edits++);
    const up = event('ArrowUp'); run(up);
    assert.deepEqual(changes, [3]); assert.equal(up.prevented, true); assert.equal(up.stopped, true);
    run(event('Enter')); assert.equal(edits, 1);
    const tab = event('Tab'); run(tab); assert.equal(tab.prevented, false);
    run(event('ArrowUp', false)); run({ ...event('ArrowUp'), metaKey: true });
    assert.deepEqual(changes, [3]);
  });
  it('nudges the number field onto values the slider can hold, keeping the displayed precision', () => {
    assert.equal(nudgeInputValue('ArrowUp', '0.50', 0.1, 1, 0.05)?.text, '0.55');
    assert.equal(nudgeInputValue('ArrowDown', '0.50', 0.1, 1, 0.05)?.text, '0.45');
    assert.equal(nudgeInputValue('ArrowUp', '0.50', 0, 1, 0.01)?.text, '0.51');
    assert.equal(nudgeInputValue('ArrowUp', '3', 0, 10, 1)?.text, '4');
    assert.equal(nudgeInputValue('ArrowDown', '-0.5', -1, 1, 0.1)?.text, '-0.6');
    assert.equal(nudgeInputValue('ArrowUp', '0.53', 0.1, 1, 0.05)?.text, '0.55');
    assert.equal(nudgeInputValue('ArrowUp', '1.00', 0, 1, 0.01)?.text, '1.00');
    assert.equal(nudgeInputValue('ArrowUp', '0.05', 0, 1, 0.01, true)?.text, '0.15');
  });
  it('leaves caret keys, browser keys, and non-numeric text to the number field', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Escape', 'Tab', 'a'])
      assert.equal(nudgeInputValue(key, '0.5', 0, 1, 0.1), undefined, key);
    for (const text of ['', '   ', 'abc']) assert.equal(nudgeInputValue('ArrowUp', text, 0, 1, 0.1), undefined, text);
  });
  it('commits a nudge at once but leaves modified arrows to the browser', () => {
    const applied: [string, number][] = [];
    const apply = (text: string, value: number) => applied.push([text, value]);
    assert.equal(handleInputNudge(event('ArrowUp'), '0.50', 0, 1, 0.05, apply), true);
    assert.equal(handleInputNudge({ ...event('ArrowUp'), metaKey: true }, '0.50', 0, 1, 0.05, apply), false);
    assert.equal(handleInputNudge(event('ArrowLeft'), '0.50', 0, 1, 0.05, apply), false);
    assert.deepEqual(applied, [['0.55', 0.55]]);
  });
  it('clamps list navigation but wraps segmented choices and handles empty lists', () => {
    assert.equal(optionKeyIndex('ArrowDown', 2, 3), 2);
    assert.equal(optionKeyIndex('ArrowDown', 2, 3, true), 0);
    assert.equal(optionKeyIndex('ArrowLeft', 0, 3, true), 2);
    assert.equal(optionKeyIndex('Home', 2, 3), 0);
    assert.equal(optionKeyIndex('End', 0, 3), 2);
    assert.equal(optionKeyIndex('ArrowDown', 0, 0), undefined);
    assert.equal(optionKeyIndex('Tab', 0, 3), undefined);
  });
  it('activates folder headers without responding to keys from nested controls', () => {
    let count = 0;
    for (const key of ['Enter', ' ']) { const e = event(key); activateOnKey(e, () => count++); assert.equal(e.prevented, true); }
    activateOnKey(event('Enter', false), () => count++);
    activateOnKey(event('ArrowDown'), () => count++);
    assert.equal(count, 2);
  });
});
