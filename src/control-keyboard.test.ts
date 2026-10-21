import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sliderKeyValue, optionKeyIndex, handleSliderKey, activateOnKey, evaluateNumber, numericInputKeyValue, formatEditableValue, beginSliderDrag, updateSliderDrag } from './control-keyboard';

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
  it('moves a tenth of a step with Option/Alt, while Shift keeps ten steps', () => {
    assert.equal(sliderKeyValue('ArrowRight', 24, 0, 64, 1, false, true), 24.1);
    assert.equal(sliderKeyValue('ArrowLeft', 0.8, 0, 1, 0.01, false, true), 0.799);
    assert.equal(sliderKeyValue('ArrowRight', 24, 0, 64, 1, true, true), 34);
    assert.equal(sliderKeyValue('PageUp', 24, 0, 64, 1, false, true), 34);
    assert.equal(sliderKeyValue('ArrowRight', 63.95, 0, 64, 1, false, true), 64);
  });
  it('resets with Delete or Backspace only when a default is available', () => {
    let resets = 0;
    const changes: number[] = [];
    const del = event('Delete');
    handleSliderKey(del, 5, 0, 10, 1, v => changes.push(v), () => {}, () => resets++);
    assert.equal(resets, 1); assert.equal(del.prevented, true);
    handleSliderKey(event('Backspace'), 5, 0, 10, 1, v => changes.push(v), () => {}, () => resets++);
    assert.equal(resets, 2);
    const unhandled = event('Delete');
    handleSliderKey(unhandled, 5, 0, 10, 1, v => changes.push(v), () => {});
    assert.equal(unhandled.prevented, false);
    handleSliderKey({ ...event('ArrowRight'), altKey: true }, 5, 0, 10, 1, v => changes.push(v), () => {});
    assert.deepEqual(changes, [5.1]);
  });
  it('evaluates typed numbers, arithmetic, relative operators, percentages and units', () => {
    assert.equal(evaluateNumber('24', 0, 0, 64), 24);
    assert.equal(evaluateNumber(' (100-20)/2 ', 0, 0, 100), 40);
    assert.equal(evaluateNumber('+10', 24, 0, 64), 34);
    assert.equal(evaluateNumber('*2', 24, 0, 64), 48);
    assert.equal(evaluateNumber('/4', 24, 0, 64), 6);
    assert.equal(evaluateNumber('-5', 24, -10, 10), -5);
    assert.equal(evaluateNumber('50%', 0, 0, 1), 0.5);
    assert.equal(evaluateNumber('50%', 0, 0, 64), 32);
    assert.equal(evaluateNumber('24px', 0, 0, 64, 'px'), 24);
    assert.equal(evaluateNumber('1.5e1', 0, 0, 64), 15);
  });
  it('rejects text that is not a number', () => {
    for (const text of ['', '12abc', 'abc', '1/0', '2 3', '(1+2', 'px']) assert.equal(evaluateNumber(text, 0, 0, 100, 'px'), undefined, text);
  });
  it('steps the numeric editor from the typed value', () => {
    const key = (k: string, shiftKey = false, altKey = false) => ({ key: k, shiftKey, altKey });
    assert.equal(numericInputKeyValue(key('ArrowUp'), '24', 0, 0, 64, 1), 25);
    assert.equal(numericInputKeyValue(key('ArrowDown', true), '24', 0, 0, 64, 1), 14);
    assert.equal(numericInputKeyValue(key('ArrowUp', false, true), '24', 0, 0, 64, 1), 24.1);
    assert.equal(numericInputKeyValue(key('ArrowUp'), 'oops', 10, 0, 64, 1), 11);
    assert.equal(numericInputKeyValue(key('ArrowUp'), '64', 0, 0, 64, 1), 64);
    assert.equal(numericInputKeyValue(key('Enter'), '24', 0, 0, 64, 1), undefined);
  });
  it('shows an extra decimal only for fine values', () => {
    assert.equal(formatEditableValue(24, 1, 0, 64), '24');
    assert.equal(formatEditableValue(24.1, 1, 0, 64), '24.1');
    assert.equal(formatEditableValue(0.8, 0.01, 0, 1), '0.80');
  });
  it('drags relative to the pointer, slows down with Option/Alt and snaps with Shift', () => {
    const plain = { shiftKey: false, altKey: false };
    const drag = beginSliderDrag(50, 100);
    assert.equal(updateSliderDrag(drag, 120, 200, 0, 100, 1, plain), 60);
    assert.equal(updateSliderDrag(drag, 140, 200, 0, 100, 1, { shiftKey: false, altKey: true }), 61);
    assert.equal(updateSliderDrag(drag, 142, 200, 0, 100, 1, { shiftKey: false, altKey: true }), 61.1);
    assert.equal(updateSliderDrag(drag, 146, 200, 0, 100, 1, { shiftKey: true, altKey: false }), 60);
    const discrete = beginSliderDrag(4, 0);
    assert.equal(updateSliderDrag(discrete, 15, 100, 0, 10, 2, { shiftKey: true, altKey: false }), 6);
    const past = beginSliderDrag(90, 0);
    assert.equal(updateSliderDrag(past, 100, 100, 0, 100, 1, plain), 100);
    assert.equal(updateSliderDrag(past, 90, 100, 0, 100, 1, plain), 100, 'the pointer must come back past the end first');
  });
});
