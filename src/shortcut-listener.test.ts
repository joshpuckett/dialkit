import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DialStore } from './store/DialStore';
import { getShortcutStepScale, getWheelDistance, mountShortcutListener, takeWheelSteps, WHEEL_STEP_DISTANCE } from './shortcut-listener';
import { formatAriaKeyshortcut, getActiveModifier, getShortcutKey, getShortcutKeys, matchesHotkey, parseHotkey } from './shortcut-utils';

type Init = Partial<Record<'key' | 'code', string>> & Partial<Record<'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'repeat', boolean>> & Partial<Record<'deltaX' | 'deltaY' | 'deltaMode' | 'clientX' | 'button', number>>;

function fakeEvent(type: string, init: Init = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { key: '', code: '', altKey: false, shiftKey: false, metaKey: false, ctrlKey: false, repeat: false, isComposing: false, deltaX: 0, deltaY: 0, deltaMode: 0, clientX: 0, button: 0, ...init });
  return event as Event & KeyboardEvent & WheelEvent;
}

const originalWindow = globalThis.window;

describe('shortcut key matching', () => {
  it('lists the typed character first, then the physical key a modifier replaced', () => {
    assert.deepEqual(getShortcutKeys({ key: '+', code: 'Equal', altKey: false, shiftKey: true }), ['+', '=']);
    assert.deepEqual(getShortcutKeys({ key: '?', code: 'Slash', altKey: false, shiftKey: true }), ['?', '/']);
    assert.deepEqual(getShortcutKeys({ key: 'r', code: 'KeyR', altKey: false, shiftKey: false }), ['r']);
  });

  it('uses the physical key when a modifier changes the typed character', () => {
    assert.equal(getShortcutKey({ key: '®', code: 'KeyR', altKey: true, shiftKey: false }), 'r');
    assert.equal(getShortcutKey({ key: '!', code: 'Digit1', altKey: false, shiftKey: true }), '1');
    assert.equal(getShortcutKey({ key: 'R', code: 'KeyR', altKey: false, shiftKey: true }), 'r');
    assert.equal(getShortcutKey({ key: 'Dead', code: 'KeyE', altKey: true, shiftKey: false }), 'e');
  });

  it('keeps the typed character without modifiers, so other keyboard layouts match what is printed', () => {
    assert.equal(getShortcutKey({ key: 'a', code: 'KeyQ', altKey: false, shiftKey: false }), 'a');
    assert.equal(getShortcutKey({ key: 'z', code: 'KeyY', altKey: false, shiftKey: false }), 'z');
  });

  it('allows one assignable modifier and rejects Control or combinations', () => {
    const modifiers = (init: Init) => getActiveModifier(fakeEvent('keydown', init));
    assert.equal(modifiers({}), undefined);
    assert.equal(modifiers({ altKey: true }), 'alt');
    assert.equal(modifiers({ ctrlKey: true }), null);
    assert.equal(modifiers({ altKey: true, shiftKey: true }), null);
  });
});

describe('hotkeys', () => {
  it('parses names, aliases and symbols', () => {
    assert.deepEqual(parseHotkey('ctrl+period'), { key: '.', modifiers: ['ctrl'] });
    assert.deepEqual(parseHotkey('Option+Shift+D'), { key: 'd', modifiers: ['alt', 'shift'] });
    assert.deepEqual(parseHotkey('backquote'), { key: '`', modifiers: [] });
    assert.deepEqual(parseHotkey('ctrl++'), { key: '+', modifiers: ['ctrl'] });
    assert.equal(parseHotkey('hyper+k'), null);
    assert.equal(parseHotkey(''), null);
  });

  it('matches exactly, including on macOS where Option changes the character', () => {
    const hotkey = parseHotkey('alt+d')!;
    assert.equal(matchesHotkey(fakeEvent('keydown', { key: '∂', code: 'KeyD', altKey: true }), hotkey), true);
    assert.equal(matchesHotkey(fakeEvent('keydown', { key: 'd', code: 'KeyD' }), hotkey), false);
    assert.equal(matchesHotkey(fakeEvent('keydown', { key: '∂', code: 'KeyD', altKey: true, shiftKey: true }), hotkey), false);
  });

  it('formats aria-keyshortcuts', () => {
    assert.equal(formatAriaKeyshortcut(parseHotkey('ctrl+period')!), 'Control+.');
    assert.equal(formatAriaKeyshortcut(parseHotkey('alt+shift+d')!), 'Alt+Shift+D');
  });
});

describe('wheel steps', () => {
  it('uses the dominant axis and treats right and up as increases', () => {
    assert.equal(getWheelDistance({ deltaX: 0, deltaY: -10, deltaMode: 0 }), 10);
    assert.equal(getWheelDistance({ deltaX: 12, deltaY: 3, deltaMode: 0 }), 12);
    assert.equal(getWheelDistance({ deltaX: 0, deltaY: 3, deltaMode: 1 }), -48);
  });

  it('moves one step per notch and accumulates trackpad deltas', () => {
    assert.deepEqual(takeWheelSteps(0, 120), { steps: 1, remainder: 0 });
    assert.deepEqual(takeWheelSteps(0, -100), { steps: -1, remainder: 0 });
    let accumulated = 0, steps = 0;
    for (let i = 0; i < 20; i++) {
      const result = takeWheelSteps(accumulated, 5);
      accumulated = result.remainder;
      steps += result.steps;
    }
    assert.equal(steps, Math.trunc(100 / WHEEL_STEP_DISTANCE));
    assert.deepEqual(takeWheelSteps(40, -5), { steps: 0, remainder: -5 });
  });

  it('moves one step for line-based deltas and at the start of a gesture', () => {
    assert.deepEqual(takeWheelSteps(0, 48, true), { steps: 1, remainder: 0 });
    assert.deepEqual(takeWheelSteps(0, -3, true), { steps: -1, remainder: 0 });
    assert.deepEqual(takeWheelSteps(20, 0), { steps: 0, remainder: 20 });
  });

  it('scales held shortcuts with Shift and Option, and leaves Command and Control to the browser', () => {
    const shortcut = { key: 'r' };
    assert.equal(getShortcutStepScale(fakeEvent('keydown', { shiftKey: true }), shortcut), 10);
    assert.equal(getShortcutStepScale(fakeEvent('keydown', { altKey: true }), shortcut), 0.1);
    assert.equal(getShortcutStepScale(fakeEvent('keydown', { altKey: true }), { key: 'r', modifier: 'alt' }), 1);
    assert.equal(getShortcutStepScale(fakeEvent('keydown', { metaKey: true }), shortcut), undefined);
  });
});

describe('shared shortcut listener', () => {
  let target: EventTarget & { innerHeight: number };
  let listener: { destroy(): void } | undefined;
  let second: { destroy(): void } | undefined;
  const dispatch = (type: string, init: Init = {}) => {
    const event = fakeEvent(type, init);
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    target = Object.assign(new EventTarget(), { innerHeight: 800 });
    globalThis.window = target as unknown as Window & typeof globalThis;
    DialStore.registerPanel('shortcut-listener-test', 'Test', {
      radius: [10, 0, 100, 1],
      blur: [0, 0, 20, 1],
      visible: true,
      zoom: [100, 25, 200, 1],
      grid: false,
    }, {
      radius: { key: 'r' },
      blur: { key: 'b', modifier: 'alt' },
      visible: { key: 'v' },
      zoom: { interaction: 'scroll-only' },
      grid: { key: '+', modifier: 'shift' },
    });
    listener = mountShortcutListener();
  });

  afterEach(() => {
    listener?.destroy();
    second?.destroy();
    second = undefined;
    DialStore.unregisterPanel('shortcut-listener-test');
    globalThis.window = originalWindow;
  });

  const value = (path: string) => DialStore.getValue('shortcut-listener-test', path);

  it('adjusts an Option shortcut on macOS and releases it in either order', () => {
    dispatch('keydown', { key: '∫', code: 'KeyB', altKey: true });
    dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight', altKey: true });
    assert.equal(value('blur'), 1);
    dispatch('keyup', { key: 'Alt', code: 'AltLeft' });
    dispatch('keyup', { key: 'b', code: 'KeyB' });
    dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    assert.equal(value('blur'), 1, 'the released key is no longer held');
  });

  it('does not drive an Option shortcut from the plain key', () => {
    dispatch('keydown', { key: 'b', code: 'KeyB' });
    dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    assert.equal(value('blur'), 0);
  });

  it('scales arrow steps with Shift and Option while the key is held', () => {
    dispatch('keydown', { key: 'r', code: 'KeyR' });
    dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true });
    assert.equal(value('radius'), 20);
    dispatch('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    assert.equal(value('radius'), 19.9);
  });

  it('toggles once per press and ignores Control combinations', () => {
    dispatch('keydown', { key: 'v', code: 'KeyV' });
    dispatch('keydown', { key: 'v', code: 'KeyV', repeat: true });
    assert.equal(value('visible'), false);
    dispatch('keyup', { key: 'v', code: 'KeyV' });
    dispatch('keydown', { key: 'v', code: 'KeyV', ctrlKey: true });
    assert.equal(value('visible'), false, 'Control+V is paste, not the V shortcut');
  });

  it('matches a shortcut on a shifted symbol by the typed character', () => {
    dispatch('keydown', { key: '+', code: 'Equal', shiftKey: true });
    assert.equal(value('grid'), true);
  });

  it('clears keys when Command is released, since macOS sends no keyup for them', () => {
    dispatch('keydown', { key: 'r', code: 'KeyR' });
    dispatch('keyup', { key: 'Meta', code: 'MetaLeft' });
    dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    assert.equal(value('radius'), 10);
  });

  it('applies a shortcut once when several roots mount the listener', () => {
    second = mountShortcutListener();
    dispatch('keydown', { key: 'v', code: 'KeyV' });
    assert.equal(value('visible'), false);
  });

  it('lets pinch-zoom through and moves scroll-only sliders one step per notch', () => {
    const pinch = dispatch('wheel', { deltaY: -100, ctrlKey: true });
    assert.equal(pinch.defaultPrevented, false);
    assert.equal(value('zoom'), 100);
    const notch = dispatch('wheel', { deltaY: -100 });
    assert.equal(notch.defaultPrevented, true);
    assert.equal(value('zoom'), 101);
  });
});
