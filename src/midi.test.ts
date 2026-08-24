import assert from 'node:assert/strict';
import test from 'node:test';
import { DialStore } from './store/DialStore';
import {
  createMidiController,
  getSharedMidiController,
  handleMidiEscape,
  midiConnectionView,
  midiTargetBadge,
  resumeMidiConnection,
  MidiLearnCancelledError,
  scaleMidiValue,
  type MidiAccessLike,
  type MidiControllerSnapshot,
  type MidiInputLike,
  type MidiMessageEventLike,
} from './midi';

class FakeMidiInput implements MidiInputLike {
  readonly listeners = new Set<(event: MidiMessageEventLike) => void>();
  readonly name: string;
  readonly manufacturer = 'Test';
  state = 'connected';
  connection = 'closed';
  openCalls = 0;
  closeCalls = 0;
  openError: Error | null = null;
  openErrors: Error[] = [];
  openGate: Promise<void> | null = null;
  openGates: Promise<void>[] = [];

  constructor(readonly id: string) {
    this.name = `Input ${id}`;
  }

  addEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.delete(listener);
  }

  async open(): Promise<void> {
    this.openCalls += 1;
    const queuedError = this.openErrors.shift();
    if (queuedError) throw queuedError;
    if (this.openError) throw this.openError;
    await (this.openGates.shift() ?? this.openGate);
    this.connection = 'open';
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.connection = 'closed';
  }

  send(status: number, cc: number, value: number): void {
    const event = { data: Uint8Array.from([status, cc, value]) };
    this.listeners.forEach((listener) => listener(event));
  }
}

class FakeMidiAccess implements MidiAccessLike {
  readonly inputs = new Map<string, MidiInputLike>();
  readonly listeners = new Set<() => void>();

  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.delete(listener);
  }

  addInput(input: FakeMidiInput): void {
    this.inputs.set(input.id, input);
    this.listeners.forEach((listener) => listener());
  }

  removeInput(id: string): void {
    this.inputs.delete(id);
    this.listeners.forEach((listener) => listener());
  }
}

function registerPanel(id: string): () => void {
  DialStore.registerPanel(id, 'MIDI test', {
    amount: [0, -10, 10, 0.5],
    nested: { opacity: [0, 0, 1, 0.01] },
    enabled: true,
    transition: { type: 'spring', visualDuration: 0.5, bounce: 0.1 },
    shape: { type: 'select', options: ['portrait', 'landscape'], default: 'portrait' },
    next: { type: 'action', label: 'Next' },
  });
  return () => DialStore.unregisterPanel(id);
}

test('is SSR/unsupported safe and reports permission denial without throwing', async () => {
  const unsupported = createMidiController();
  assert.equal(await unsupported.connect(), false);
  assert.equal(unsupported.getSnapshot().status, 'unsupported');

  const deniedError = new Error('Permission denied');
  deniedError.name = 'NotAllowedError';
  const denied = createMidiController({ requestMIDIAccess: async () => { throw deniedError; } });
  assert.equal(await denied.connect(), false);
  assert.equal(denied.getSnapshot().status, 'denied');
  assert.equal(denied.getSnapshot().error, deniedError);

  const syncError = new Error('Synchronous access failure');
  const failed = createMidiController({ requestMIDIAccess: () => { throw syncError; } });
  assert.equal(await failed.connect(), false);
  assert.equal(failed.getSnapshot().status, 'error');
  assert.equal(failed.getSnapshot().error, syncError);

  let requested = false;
  const direct = createMidiController({ requestMIDIAccess: () => {
    requested = true;
    return Promise.resolve(new FakeMidiAccess());
  } });
  const directConnect = direct.connect();
  assert.equal(requested, true, 'connect calls requestMIDIAccess in the initiating user task');
  assert.equal(await directConnect, true);
});

test('resumes MIDI only when browser permission is already granted', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('resume');
  access.inputs.set(input.id, input);
  let requested = 0;
  const midi = createMidiController({
    requestMIDIAccess: async () => {
      requested += 1;
      return access;
    },
  });

  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { permissions: { query: async () => ({ state: 'prompt' }) } },
    });
    assert.equal(await resumeMidiConnection(midi), false);
    assert.equal(requested, 0, 'a mount must not prompt for first-use permission');

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { permissions: { query: async () => ({ state: 'granted' }) } },
    });
    assert.equal(await resumeMidiConnection(midi), true);
    assert.equal(requested, 1);
    assert.equal(midi.getSnapshot().status, 'connected');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

test('keeps access after an unavailable initial input and recovers on device statechange', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('broken');
  const openError = new Error('Port unavailable');
  input.openError = openError;
  access.inputs.set(input.id, input);
  let accessRequests = 0;
  const midi = createMidiController({ requestMIDIAccess: async () => {
    accessRequests += 1;
    return access;
  } });

  assert.equal(await midi.connect(), false);
  assert.equal(midi.getSnapshot().status, 'connected', 'granted MIDI access remains live while the port is degraded');
  assert.equal(midi.getSnapshot().error, openError);
  assert.deepEqual(midi.getSnapshot().inputs, []);
  assert.equal(input.listeners.size, 0);
  assert.equal(input.openCalls, 2, 'a stale port is reset and retried once');
  assert.equal(access.listeners.size, 1, 'statechange remains attached for automatic recovery');
  assert.deepEqual(
    [midiConnectionView(midi.getSnapshot()).action, midiConnectionView(midi.getSnapshot()).actionLabel],
    ['retry', 'Retry unavailable controllers'],
  );

  input.openError = null;
  input.state = 'disconnected';
  access.listeners.forEach((listener) => listener());
  await new Promise((resolve) => setTimeout(resolve, 0));
  input.state = 'connected';
  access.listeners.forEach((listener) => listener());
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(midi.getSnapshot().status, 'connected');
  assert.equal(midi.getSnapshot().error, null);
  assert.equal(midi.getSnapshot().inputs[0]?.id, input.id);
  assert.equal(accessRequests, 1, 'hot-plug recovery reuses the granted MIDI session');
  midi.disconnect();
});

test('resets and reopens a transiently stale initial MIDI port without a physical reconnect', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('stale-once');
  input.openErrors.push(new Error('Stale USB MIDI port'));
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  assert.equal(await midi.connect(), true);
  assert.equal(midi.getSnapshot().status, 'connected');
  assert.equal(midi.getSnapshot().error, null);
  assert.equal(midi.getSnapshot().inputs[0]?.id, input.id);
  assert.equal(input.openCalls, 2);
  assert.equal(input.closeCalls, 1);
  assert.equal(input.listeners.size, 1);
  midi.disconnect();
});

test('serializes overlapping input syncs without leaking listeners', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('slow');
  let releaseOpen!: () => void;
  input.openGate = new Promise<void>((resolve) => { releaseOpen = resolve; });
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  const connecting = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input.openCalls, 1);
  access.listeners.forEach((listener) => listener());
  releaseOpen();

  assert.equal(await connecting, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input.openCalls, 1, 'queued sync reuses the completed registration');
  assert.equal(input.listeners.size, 1);

  midi.disconnect();
  assert.equal(input.listeners.size, 0);
  input.send(0xb0, 74, 127);
});

test('does not publish an input replaced while its port is opening', async () => {
  const access = new FakeMidiAccess();
  const stale = new FakeMidiInput('same-id');
  const replacement = new FakeMidiInput('same-id');
  let releaseOpen!: () => void;
  stale.openGate = new Promise<void>((resolve) => { releaseOpen = resolve; });
  access.inputs.set(stale.id, stale);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  const connecting = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  access.inputs.set(replacement.id, replacement);
  access.listeners.forEach((listener) => listener());
  releaseOpen();

  assert.equal(await connecting, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stale.listeners.size, 0);
  assert.equal(replacement.listeners.size, 1);
  assert.equal(midi.getSnapshot().inputs.length, 1);
  midi.disconnect();
  assert.equal(replacement.listeners.size, 0);
});

test('detaches a replaced input while an unrelated port is still opening', async () => {
  const panelId = 'midi-pending-other-input-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const original = new FakeMidiInput('replaceable');
  const replacement = new FakeMidiInput('replaceable');
  const blocker = new FakeMidiInput('blocker');
  let releaseBlocker!: () => void;
  blocker.openGate = new Promise<void>((resolve) => { releaseBlocker = resolve; });
  access.inputs.set(original.id, original);
  access.inputs.set(blocker.id, blocker);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    const connecting = midi.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(original.listeners.size, 1);
    assert.equal(blocker.listeners.size, 0);
    midi.bind({ panelId, path: 'amount', cc: 74 });

    access.inputs.set(replacement.id, replacement);
    access.listeners.forEach((listener) => listener());
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(original.listeners.size, 0, 'stale registration is detached without waiting for another port');
    assert.equal(replacement.listeners.size, 1);
    original.send(0xb0, 74, 127);
    assert.equal(DialStore.getValue(panelId, 'amount'), 0);
    replacement.send(0xb0, 74, 127);
    assert.equal(DialStore.getValue(panelId, 'amount'), 10);

    releaseBlocker();
    assert.equal(await connecting, true);
  } finally {
    releaseBlocker();
    midi.disconnect();
    cleanup();
  }
});

test('stale open completion cannot steal ownership from a reconnect using the same input', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('reused');
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  input.openGates = [
    new Promise<void>((resolve) => { releaseFirst = resolve; }),
    new Promise<void>((resolve) => { releaseSecond = resolve; }),
  ];
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  const firstConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  midi.disconnect();
  const secondConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input.openCalls, 2);

  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await firstConnect, false);
  assert.equal(input.closeCalls, 1, 'stale completion must not add another close beyond disconnect cleanup');
  assert.equal(input.listeners.size, 0);

  releaseSecond();
  assert.equal(await secondConnect, true);
  assert.equal(input.connection, 'open');
  assert.equal(input.listeners.size, 1);
  assert.equal(midi.getSnapshot().inputs[0]?.connection, 'open');
  midi.disconnect();
});

test('stale open completion cannot close an already registered reconnect using the same input', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('reused-newer-first');
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  input.openGates = [
    new Promise<void>((resolve) => { releaseFirst = resolve; }),
    new Promise<void>((resolve) => { releaseSecond = resolve; }),
  ];
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  const firstConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  midi.disconnect();
  const secondConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));

  releaseSecond();
  assert.equal(await secondConnect, true);
  assert.equal(input.connection, 'open');
  assert.equal(input.listeners.size, 1);

  releaseFirst();
  assert.equal(await firstConnect, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input.closeCalls, 1, 'stale completion must not add another close beyond disconnect cleanup');
  assert.equal(input.connection, 'open');
  assert.equal(input.listeners.size, 1);
  assert.equal(midi.getSnapshot().inputs[0]?.connection, 'open');
  midi.disconnect();
});

test('failed newer reconnect closes a reused input opened by stale completion', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('reused-newer-fails');
  let releaseFirst!: () => void;
  let rejectSecond!: (reason: Error) => void;
  input.openGates = [
    new Promise<void>((resolve) => { releaseFirst = resolve; }),
    new Promise<void>((_resolve, reject) => { rejectSecond = reject; }),
  ];
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  const firstConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  midi.disconnect();
  const secondConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));

  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input.connection, 'open');
  assert.equal(input.closeCalls, 1);

  input.openError = new Error('newer retry also failed');
  rejectSecond(new Error('newer open failed'));
  assert.equal(await firstConnect, false);
  assert.equal(await secondConnect, false);
  assert.equal(midi.getSnapshot().status, 'connected', 'granted access survives a failed port retry');
  assert.equal(midi.getSnapshot().error, input.openError);
  assert.equal(input.connection, 'closed');
  assert.equal(input.closeCalls, 3);
  assert.equal(input.listeners.size, 0);
  midi.disconnect();
});

test('disconnect cleanup closes a reused input when its invalidated open later rejects', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('reused-disconnected-pending');
  let releaseFirst!: () => void;
  let rejectSecond!: (reason: Error) => void;
  input.openGates = [
    new Promise<void>((resolve) => { releaseFirst = resolve; }),
    new Promise<void>((_resolve, reject) => { rejectSecond = reject; }),
  ];
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  const firstConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  midi.disconnect();
  const secondConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));

  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input.connection, 'open');
  midi.disconnect();
  rejectSecond(new Error('invalidated newer open failed'));

  assert.equal(await firstConnect, false);
  assert.equal(await secondConnect, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(midi.getSnapshot().status, 'idle');
  assert.equal(input.connection, 'closed');
  assert.equal(input.closeCalls, 3);
  assert.equal(input.listeners.size, 0);
});

test('disconnect closes a reused input even when its newer open never settles', async () => {
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('reused-disconnected-hung');
  let releaseFirst!: () => void;
  input.openGates = [
    new Promise<void>((resolve) => { releaseFirst = resolve; }),
    new Promise<void>(() => undefined),
  ];
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  const firstConnect = midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  midi.disconnect();
  void midi.connect();
  await new Promise((resolve) => setTimeout(resolve, 0));

  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await firstConnect, false);
  assert.equal(input.connection, 'open');

  midi.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(midi.getSnapshot().status, 'idle');
  assert.equal(input.connection, 'closed');
  assert.equal(input.listeners.size, 0);
});

test('connects inputs, follows hot-plug state, and removes listeners on disconnect', async () => {
  const access = new FakeMidiAccess();
  const first = new FakeMidiInput('first');
  access.inputs.set(first.id, first);
  const midi = createMidiController({ requestMIDIAccess: async () => access });
  let notifications = 0;
  const unsubscribe = midi.subscribe(() => { notifications += 1; });

  assert.equal(await midi.connect(), true);
  assert.equal(midi.getSnapshot().status, 'connected');
  assert.deepEqual(midi.getSnapshot().inputs.map((input) => input.id), ['first']);
  assert.equal(midi.getSnapshot().activeInputId, null, 'a detected controller requires explicit selection');
  assert.equal(first.listeners.size, 1);
  assert.equal(first.openCalls, 1);

  const second = new FakeMidiInput('second');
  access.addInput(second);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(midi.getSnapshot().inputs.map((input) => input.id), ['first', 'second']);
  assert.equal(midi.selectInput('second'), true);
  assert.equal(midi.getSnapshot().activeInputId, 'second');
  assert.equal(midi.selectInput('missing'), false);
  assert.equal(midi.getSnapshot().activeInputId, 'second');
  assert.equal(second.listeners.size, 1);

  access.removeInput('first');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(first.listeners.size, 0);
  assert.deepEqual(midi.getSnapshot().inputs.map((input) => input.id), ['second']);
  assert.equal(midi.getSnapshot().activeInputId, 'second', 'the selected connected controller is preserved');

  second.state = 'disconnected';
  access.listeners.forEach((listener) => listener());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(second.listeners.size, 0, 'retained disconnected ports stay detached');
  assert.deepEqual(midi.getSnapshot().inputs, []);
  assert.equal(midi.getSnapshot().activeInputId, null);

  second.state = 'connected';
  access.listeners.forEach((listener) => listener());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(second.listeners.size, 1);
  assert.deepEqual(midi.getSnapshot().inputs.map((input) => input.id), ['second']);
  assert.equal(midi.getSnapshot().activeInputId, null, 'a reconnected controller requires explicit selection');

  midi.disconnect();
  assert.equal(midi.getSnapshot().status, 'idle');
  assert.equal(midi.getSnapshot().activeInputId, null);
  assert.equal(second.listeners.size, 0);
  assert.equal(second.closeCalls, 2);
  assert.equal(access.listeners.size, 0);
  assert.ok(notifications >= 4);
  unsubscribe();
});

test('publishes hot-plug open failures as a retryable degraded connection and recovers', async () => {
  const access = new FakeMidiAccess();
  const working = new FakeMidiInput('working');
  access.inputs.set(working.id, working);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    assert.equal(await midi.connect(), true);
    const unavailable = new FakeMidiInput('unavailable');
    const openError = new Error('USB MIDI port is busy');
    unavailable.openError = openError;

    access.addInput(unavailable);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const degraded = midi.getSnapshot();
    assert.equal(degraded.status, 'connected', 'working inputs remain connected');
    assert.equal(degraded.error, openError, 'the failed hot-plug port is no longer discarded');
    assert.deepEqual(degraded.inputs.map((input) => input.id), ['working']);
    assert.deepEqual(
      [midiConnectionView(degraded).action, midiConnectionView(degraded).actionLabel],
      ['retry', 'Retry unavailable controllers'],
      'the shared connection view exposes an actionable retry',
    );

    unavailable.openError = null;
    assert.equal(await midi.connect(), true, 'the exposed retry reuses the granted MIDI access');

    const recovered = midi.getSnapshot();
    assert.equal(recovered.status, 'connected');
    assert.equal(recovered.error, null, 'a later successful port open clears degraded state');
    assert.deepEqual(recovered.inputs.map((input) => input.id), ['working', 'unavailable']);
    assert.equal(unavailable.openCalls, 3, 'hot-plug failure gets one reset attempt before the explicit retry');
  } finally {
    midi.disconnect();
  }
});

test('connect can be retried after a subscriber disconnects during connecting notification', async () => {
  const access = new FakeMidiAccess();
  const midi = createMidiController({ requestMIDIAccess: async () => access });
  let interrupted = false;
  const unsubscribe = midi.subscribe(() => {
    if (!interrupted && midi.getSnapshot().status === 'connecting') {
      interrupted = true;
      midi.disconnect();
    }
  });

  assert.equal(await midi.connect(), false);
  assert.equal(midi.getSnapshot().status, 'idle');
  unsubscribe();
  assert.equal(await midi.connect(), true);
  assert.equal(midi.getSnapshot().status, 'connected');
  midi.disconnect();

  const connectedMidi = createMidiController({ requestMIDIAccess: async () => new FakeMidiAccess() });
  const unsubscribeConnected = connectedMidi.subscribe(() => {
    if (connectedMidi.getSnapshot().status === 'connected') connectedMidi.disconnect();
  });
  assert.equal(await connectedMidi.connect(), false);
  assert.equal(connectedMidi.getSnapshot().status, 'idle');
  unsubscribeConnected();
});

test('maps CC values to continuous and discrete DialKit controls', async () => {
  const panelId = 'midi-map-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const first = new FakeMidiInput('first');
  const second = new FakeMidiInput('second');
  access.inputs.set(first.id, first);
  access.inputs.set(second.id, second);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();
    const binding = midi.bind({
      panelId,
      path: 'amount',
      cc: 74,
      channel: 2,
      inputId: 'first',
      min: -5,
      max: 5,
    });

    first.send(0xb0, 74, 127); // wrong channel
    second.send(0xb1, 74, 127); // wrong input
    first.send(0x91, 74, 127); // note-on, not CC
    assert.equal(DialStore.getValue(panelId, 'amount'), 0);

    first.send(0xb1, 74, 127);
    assert.equal(DialStore.getValue(panelId, 'amount'), 5);
    first.send(0xb1, 74, 0);
    assert.equal(DialStore.getValue(panelId, 'amount'), -5);
    first.send(0xb1, 74, 64);
    assert.equal(DialStore.getValue(panelId, 'amount'), 0);

    assert.equal(midi.unbind(binding), true);
    first.send(0xb1, 74, 127);
    assert.equal(DialStore.getValue(panelId, 'amount'), 0);

    midi.bind({ panelId, path: 'amount', cc: 1, min: -50, max: 50 });
    first.send(0xb0, 1, 127);
    assert.equal(DialStore.getValue(panelId, 'amount'), 10, 'custom ranges clamp to the control range');

    midi.bind({ panelId, path: 'transition.bounce', cc: 2 });
    first.send(0xb0, 2, 127);
    assert.equal((DialStore.getValue(panelId, 'transition') as { bounce: number }).bounce, 1);

    midi.bind({ panelId, path: 'transition.duration', cc: 3 });
    first.send(0xb0, 3, 127);
    assert.equal((DialStore.getValue(panelId, 'transition') as { visualDuration: number }).visualDuration, 1);

    DialStore.updateValue(panelId, 'transition', {
      type: 'easing',
      duration: 0.3,
      ease: [0.1, 0.2, 0.3, 0.4],
    });
    midi.bind({ panelId, path: 'transition.x1', cc: 6 });
    midi.bind({ panelId, path: 'transition.y1', cc: 7 });
    midi.bind({ panelId, path: 'transition.x2', cc: 8 });
    midi.bind({ panelId, path: 'transition.y2', cc: 9 });
    first.send(0xb0, 6, 0);
    first.send(0xb0, 7, 127);
    first.send(0xb0, 8, 127);
    first.send(0xb0, 9, 0);
    assert.deepEqual(
      (DialStore.getValue(panelId, 'transition') as { ease: [number, number, number, number] }).ease,
      [0, 2, 1, -1],
      'each cubic-bezier handle is independently mappable on the Easing tab',
    );

    midi.bind({ panelId, path: 'shape', cc: 10 });
    first.send(0xb0, 10, 127);
    assert.equal(DialStore.getValue(panelId, 'shape'), 'landscape', 'continuous CC selects the nearest option');
    first.send(0xb0, 10, 0);
    assert.equal(DialStore.getValue(panelId, 'shape'), 'portrait');

    midi.bind({ panelId, path: 'enabled', cc: 4 });
    first.send(0xb0, 4, 127);
    assert.equal(DialStore.getValue(panelId, 'enabled'), false, 'a discrete CC rising edge toggles a boolean target');
    first.send(0xb0, 4, 0);
    assert.equal(DialStore.getValue(panelId, 'enabled'), false, 'button release does not toggle again');
    first.send(0xb0, 4, 127);
    assert.equal(DialStore.getValue(panelId, 'enabled'), true);

    let actionCount = 0;
    const unsubscribeAction = DialStore.subscribeActions(panelId, (path) => {
      if (path === 'next') actionCount += 1;
    });
    midi.bind({ panelId, path: 'next', cc: 5 });
    first.send(0xb0, 5, 127);
    first.send(0xb0, 5, 0);
    assert.equal(actionCount, 1, 'a discrete CC triggers an action only on its rising edge');
    unsubscribeAction();

    assert.throws(() => midi.bind({ panelId, path: 'missing', cc: 6 }), /MIDI target not found/);
    assert.throws(() => midi.bind({ panelId, path: 'amount', cc: 128 }), /0 to 127/);
  } finally {
    midi.disconnect();
    cleanup();
  }
});

test('learn captures the next matching CC, applies it, replaces target mappings, and can be cancelled', async () => {
  const panelId = 'midi-learn-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('knobs');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();
    midi.bind({ panelId, path: 'nested.opacity', cc: 10 });
    const learnedPromise = midi.learn({ panelId, path: 'nested.opacity' });
    assert.deepEqual(midi.getSnapshot().learning, { panelId, path: 'nested.opacity' });

    input.send(0x90, 21, 100); // ignored note-on
    input.send(0xb2, 21, 127);
    const learned = await learnedPromise;
    assert.equal(learned.cc, 21);
    assert.equal(learned.channel, undefined, 'learn binds the CC only, not the source channel');
    assert.equal(learned.inputId, undefined, 'learn binds the CC only, not the source input');
    assert.equal(DialStore.getValue(panelId, 'nested.opacity'), 1);
    assert.equal(midi.getSnapshot().bindings.length, 1, 'learning replaces an existing target mapping');
    assert.equal(midi.getSnapshot().learning, null);

    const cancelled = midi.learn({ panelId, path: 'amount' });
    assert.equal(midi.cancelLearn(), true);
    await assert.rejects(cancelled, MidiLearnCancelledError);
    assert.equal(midi.cancelLearn(), false);
  } finally {
    midi.disconnect();
    cleanup();
  }
});

test('learn rolls back when subscribers disconnect during binding publication', async () => {
  const panelId = 'midi-learn-reentrant-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('knobs');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();
    let reentered = false;
    const unsubscribe = midi.subscribe(() => {
      if (!reentered && midi.getSnapshot().bindings.length > 0) {
        reentered = true;
        midi.disconnect();
      }
    });
    const learnedPromise = midi.learn({ panelId, path: 'amount' });
    const learning = midi.getSnapshot().learning;
    assert.ok(learning);
    assert.equal(Object.isFrozen(learning), true);
    assert.throws(() => { (learning as { path: string }).path = 'bad'; }, TypeError);
    input.send(0xb0, 9, 64);
    await assert.rejects(learnedPromise, MidiLearnCancelledError);
    assert.equal(reentered, true);
    assert.equal(midi.getSnapshot().status, 'idle');
    assert.equal(midi.getSnapshot().bindings.length, 0);
    assert.equal(DialStore.getValue(panelId, 'amount'), 0);
    unsubscribe();
  } finally {
    midi.disconnect();
    cleanup();
  }
});

test('learn rejects cleanly if its target disappears before completion', async () => {
  const panelId = 'midi-learn-missing-target-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('knobs');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  await midi.connect();
  const learnedPromise = midi.learn({ panelId, path: 'amount' });
  cleanup();
  assert.doesNotThrow(() => input.send(0xb0, 9, 64));
  await assert.rejects(learnedPromise, /MIDI target not found/);
  assert.equal(midi.getSnapshot().learning, null);
  assert.equal(midi.getSnapshot().bindings.length, 0);
  midi.disconnect();
});

test('learn aborts if a subscriber removes the provisional binding', async () => {
  const panelId = 'midi-learn-unbound-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('knobs');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();
    midi.bind({ panelId, path: 'amount', cc: 5 });
    let removed = false;
    const unsubscribe = midi.subscribe(() => {
      const provisional = midi.getSnapshot().bindings[0];
      if (!removed && provisional?.cc === 11) {
        removed = true;
        midi.unbind(provisional);
      }
    });
    const learnedPromise = midi.learn({ panelId, path: 'amount' });
    input.send(0xb0, 11, 127);
    await assert.rejects(learnedPromise, /removed before completion/);
    assert.equal(DialStore.getValue(panelId, 'amount'), 0);
    assert.equal(midi.getSnapshot().bindings[0]?.cc, 5, 'aborted learn restores the prior mapping');
    assert.equal(midi.getSnapshot().learning, null);
    unsubscribe();
  } finally {
    midi.disconnect();
    cleanup();
  }
});

test('subscriber failures cannot corrupt learn state', async () => {
  const panelId = 'midi-learn-subscriber-failure-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('knobs');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });
  const reported: unknown[] = [];
  const host = globalThis as { reportError?: (error: unknown) => void };
  const previousReportError = host.reportError;
  host.reportError = (reason) => reported.push(reason);

  try {
    await midi.connect();
    let threw = false;
    const unsubscribe = midi.subscribe(() => {
      if (!threw && midi.getSnapshot().bindings.length > 0) {
        threw = true;
        throw new Error('MIDI subscriber failed');
      }
    });
    const learnedPromise = midi.learn({ panelId, path: 'amount' });
    assert.doesNotThrow(() => input.send(0xb0, 12, 127));
    const learned = await learnedPromise;
    assert.equal(learned.cc, 12);
    assert.equal(midi.getSnapshot().bindings.length, 1);
    assert.equal(reported.length, 1);
    unsubscribe();

    const unsubscribeStore = DialStore.subscribe(panelId, () => {
      throw new Error('DialStore subscriber failed');
    });
    const failedLearn = midi.learn({ panelId, path: 'amount' });
    assert.doesNotThrow(() => input.send(0xb0, 13, 127));
    await assert.rejects(failedLearn, /DialStore subscriber failed/);
    assert.equal(midi.getSnapshot().learning, null);
    assert.equal(midi.getSnapshot().bindings[0]?.cc, 12, 'failed replacement restores the prior binding');
    unsubscribeStore();
  } finally {
    if (previousReportError) host.reportError = previousReportError;
    else delete host.reportError;
    midi.disconnect();
    cleanup();
  }
});

test('Escape settles only the panel that owns shared MIDI state', async () => {
  const panelId = 'midi-escape-owner-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('escape-knobs');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();
    midi.startMapping(panelId);
    const learning = midi.learn({ panelId, path: 'amount' });
    const firstEscape = {} as KeyboardEvent;
    let otherMenuCloses = 0;
    assert.equal(handleMidiEscape(firstEscape, midi, 'other-panel', true, () => { otherMenuCloses += 1; }), false);
    assert.equal(handleMidiEscape(firstEscape, midi, panelId, true, () => undefined), true);
    assert.equal(handleMidiEscape(firstEscape, midi, 'other-panel', true, () => { otherMenuCloses += 1; }), false);
    await assert.rejects(learning, MidiLearnCancelledError);
    assert.equal(otherMenuCloses, 0);
    assert.equal(midi.getSnapshot().mapping?.panelId, panelId);

    const secondEscape = {} as KeyboardEvent;
    assert.equal(handleMidiEscape(secondEscape, midi, 'other-panel', true, () => { otherMenuCloses += 1; }), false);
    assert.equal(handleMidiEscape(secondEscape, midi, panelId, false, () => undefined), true);
    assert.equal(midi.getSnapshot().mapping, null);
    assert.equal(otherMenuCloses, 0);
  } finally {
    midi.stopMapping();
    midi.disconnect();
    cleanup();
  }
});

test('learn separates capture-source filters from portable binding filters', async () => {
  const panelId = 'midi-agnostic-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const original = new FakeMidiInput('original');
  const replacement = new FakeMidiInput('replacement');
  access.inputs.set(original.id, original);
  access.inputs.set(replacement.id, replacement);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();

    // The mapping UI may listen only to the selected controller/channel while
    // persisting a controller-agnostic binding that captures the CC alone.
    const learnedPromise = midi.learn(
      { panelId, path: 'amount' },
      { inputId: 'original', channel: 1 },
    );
    assert.deepEqual(midi.getSnapshot().learning, { panelId, path: 'amount' });
    replacement.send(0xb0, 74, 127); // matching channel, wrong capture source — ignored
    original.send(0xb1, 74, 127);    // matching source, wrong capture channel — ignored
    original.send(0xb0, 74, 127);
    const learned = await learnedPromise;
    assert.equal(learned.cc, 74);
    assert.equal(learned.inputId, undefined);
    assert.equal(learned.channel, undefined);
    assert.equal(DialStore.getValue(panelId, 'amount'), 10);

    // Swapping to a different class-compliant controller that emits the same CC on a
    // different channel keeps working precisely because neither was captured.
    DialStore.updateValue(panelId, 'amount', 0);
    replacement.send(0xb5, 74, 0);
    assert.equal(DialStore.getValue(panelId, 'amount'), -10, 'any input/channel drives a device-agnostic mapping');

    // Explicit binding filters on the low-level API remain both capture filters
    // and persisted playback filters for backward compatibility.
    const filteredPromise = midi.learn({ panelId, path: 'amount', inputId: 'original', channel: 2 });
    assert.deepEqual(midi.getSnapshot().learning, { panelId, path: 'amount', inputId: 'original', channel: 2 });
    replacement.send(0xb1, 20, 127); // channel 2 but wrong input — ignored
    original.send(0xb0, 20, 127);    // right input but channel 1 — ignored
    original.send(0xb1, 20, 127);    // matches the input + channel filter
    const filtered = await filteredPromise;
    assert.equal(filtered.cc, 20);
    assert.equal(filtered.inputId, 'original');
    assert.equal(filtered.channel, 2);
  } finally {
    midi.disconnect();
    cleanup();
  }
});

test('unplugging a filtered learn source rejects learning and clears transient state', async () => {
  const panelId = 'midi-learn-unplug-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const selected = new FakeMidiInput('selected');
  const survivor = new FakeMidiInput('survivor');
  access.inputs.set(selected.id, selected);
  access.inputs.set(survivor.id, survivor);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();
    assert.equal(midi.selectInput(selected.id), true);
    const learning = midi.learn(
      { panelId, path: 'amount' },
      { inputId: selected.id },
    );
    selected.send(0x90, 60, 127);
    assert.ok(midi.getSnapshot().learningWarning);

    access.removeInput(selected.id);
    await assert.rejects(
      learning,
      (reason: unknown) => reason instanceof MidiLearnCancelledError
        && /disconnected while learning/.test(reason.message),
    );

    assert.equal(midi.getSnapshot().activeInputId, null);
    assert.equal(midi.getSnapshot().learning, null);
    assert.equal(midi.getSnapshot().learningWarning, null);
    assert.equal(midi.getSnapshot().bindings.length, 0);
    survivor.send(0xb0, 74, 127);
    assert.equal(DialStore.getValue(panelId, 'amount'), 0, 'another controller cannot complete an abandoned learn');
  } finally {
    midi.disconnect();
    cleanup();
  }
});

test('discrete learn accepts the same CC 64 press threshold used by playback', async () => {
  const panelId = 'midi-discrete-threshold-test';
  const cleanup = registerPanel(panelId);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('buttons');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();

    const toggleLearn = midi.learn({ panelId, path: 'enabled' });
    input.send(0xb0, 41, 63);
    assert.match(midi.getSnapshot().learningWarning?.message ?? '', /64 or higher/);
    input.send(0xb0, 41, 64);
    assert.equal((await toggleLearn).cc, 41);
    assert.equal(midi.getSnapshot().learningWarning, null);
    input.send(0xb0, 41, 0);
    input.send(0xb0, 41, 64);
    assert.equal(DialStore.getValue(panelId, 'enabled'), false, 'CC 64 activates the learned toggle on its rising edge');

    let actionCount = 0;
    const unsubscribeAction = DialStore.subscribeActions(panelId, (path) => {
      if (path === 'next') actionCount += 1;
    });
    const actionLearn = midi.learn({ panelId, path: 'next' });
    input.send(0xb0, 42, 64);
    assert.equal((await actionLearn).cc, 42);
    input.send(0xb0, 42, 0);
    input.send(0xb0, 42, 64);
    assert.equal(actionCount, 1, 'CC 64 activates the learned action on its rising edge');
    unsubscribeAction();
  } finally {
    midi.disconnect();
    cleanup();
  }
});

test('exposes mapping mode, target lookup, relearn, and unmap for the shared UI', async () => {
  const panelId = 'midi-mapping-ui-test';
  const other = 'midi-mapping-ui-other';
  const cleanup = registerPanel(panelId);
  const cleanupOther = registerPanel(other);
  const access = new FakeMidiAccess();
  const input = new FakeMidiInput('surface');
  access.inputs.set(input.id, input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });

  try {
    await midi.connect();

    assert.equal(midi.getSnapshot().mapping, null);
    assert.equal(midi.getBindingForTarget(panelId, 'amount'), undefined);

    midi.startMapping(panelId);
    const mapping = midi.getSnapshot().mapping;
    assert.deepEqual(mapping, { panelId });
    assert.equal(Object.isFrozen(mapping), true);
    assert.throws(() => { (mapping as { panelId: string }).panelId = 'x'; }, TypeError);

    // Learn a target while mapping, then relearn it to a different CC in place.
    const first = midi.learn({ panelId, path: 'amount' });
    input.send(0x90, 60, 127);
    assert.equal(midi.getSnapshot().learningWarning?.message, 'Use a compatible control that sends MIDI CC.');
    input.send(0xb0, 30, 127);
    assert.equal((await first).cc, 30);
    assert.equal(midi.getSnapshot().learningWarning, null);
    assert.equal(midi.getBindingForTarget(panelId, 'amount')?.cc, 30);

    const relearn = midi.learn({ panelId, path: 'amount' });
    input.send(0xb0, 31, 64);
    assert.equal((await relearn).cc, 31);
    assert.equal(midi.getSnapshot().bindings.length, 1, 'relearn replaces the existing target mapping');
    assert.equal(midi.getBindingForTarget(panelId, 'amount')?.cc, 31);

    // Switching the mapped panel abandons a pending learn on the old panel.
    const abandoned = midi.learn({ panelId, path: 'amount' });
    midi.startMapping(other);
    await assert.rejects(abandoned, MidiLearnCancelledError);
    assert.deepEqual(midi.getSnapshot().mapping, { panelId: other });

    // stopMapping settles both mapping mode and any pending learn (Escape/close/toggle).
    const settled = midi.learn({ panelId: other, path: 'amount' });
    midi.stopMapping();
    await assert.rejects(settled, MidiLearnCancelledError);
    assert.equal(midi.getSnapshot().mapping, null);

    // Unmap removes the target mapping.
    assert.equal(midi.unbindTarget(panelId, 'amount'), 1);
    assert.equal(midi.getBindingForTarget(panelId, 'amount'), undefined);
  } finally {
    midi.disconnect();
    cleanup();
    cleanupOther();
  }
});

test('mapping ownership prevents one root cleanup from stopping another root session', () => {
  const midi = createMidiController();
  const firstOwner = Symbol('first root');
  const secondOwner = Symbol('second root');

  midi.startMapping(undefined, firstOwner);
  assert.deepEqual(midi.getSnapshot().mapping, { panelId: null });
  midi.stopMapping(secondOwner);
  assert.deepEqual(midi.getSnapshot().mapping, { panelId: null }, 'non-owner cleanup is ignored');

  midi.startMapping(undefined, secondOwner);
  midi.stopMapping(firstOwner);
  assert.deepEqual(midi.getSnapshot().mapping, { panelId: null }, 'ownership follows the latest explicit starter');
  midi.stopMapping(secondOwner);
  assert.equal(midi.getSnapshot().mapping, null);

  midi.startMapping('manual-panel', firstOwner);
  midi.stopMapping();
  assert.equal(midi.getSnapshot().mapping, null, 'tokenless Done/Escape remains an explicit global stop');
});

test('getSharedMidiController is a singleton, SSR-safe, and shared across roots', async () => {
  const shared = getSharedMidiController();
  assert.equal(shared, getSharedMidiController(), 'the shared controller is a process-wide singleton');

  // A host without Web MIDI resolves connect() to false and reports unsupported
  // without throwing — creation requested no browser permission.
  assert.equal(await shared.connect(), false);
  assert.equal(shared.getSnapshot().status, 'unsupported');

  // Two roots subscribe; releasing one must not disconnect or silence the other.
  let survivorNotifications = 0;
  const releaseFirst = shared.subscribe(() => undefined);
  const releaseSecond = shared.subscribe(() => { survivorNotifications += 1; });
  releaseFirst();
  shared.startMapping('shared-root-panel');
  assert.deepEqual(shared.getSnapshot().mapping, { panelId: 'shared-root-panel' });
  assert.ok(survivorNotifications >= 1, 'the surviving root still receives notifications');
  releaseSecond();
  shared.stopMapping();
});

test('midiTargetBadge and midiConnectionView derive the shared MIDI UI view', () => {
  const snap = (over: Partial<MidiControllerSnapshot>): MidiControllerSnapshot => ({
    status: 'idle', inputs: [], activeInputId: null, bindings: [], learning: null, learningWarning: null, mapping: null, error: null, ...over,
  });
  const input = (id: string, name: string | null = null, manufacturer: string | null = null) => (
    { id, name, manufacturer, state: 'connected', connection: 'open' }
  );
  const binding = { id: 'b1', panelId: 'p', path: 'amount', cc: 74 } as const;

  // Connection view across states.
  const idle = midiConnectionView(snap({ status: 'idle' }));
  assert.deepEqual([idle.action, idle.actionLabel, idle.connected], ['map', 'Allow MIDI access', false]);
  assert.equal(idle.showStatus, false);
  assert.equal(idle.activeInputLabel, null);
  assert.equal(midiConnectionView(snap({ status: 'denied' })).action, 'retry');
  assert.equal(midiConnectionView(snap({ status: 'error' })).action, 'retry');
  assert.equal(midiConnectionView(snap({ status: 'unsupported' })).action, null);
  const noDevices = midiConnectionView(snap({ status: 'connected', inputs: [] }));
  assert.equal(noDevices.connected, true);
  assert.match(noDevices.label, /No controllers/);
  assert.deepEqual([noDevices.action, noDevices.actionLabel, noDevices.showStatus], ['reconnect', 'Reconnect controller', true]);
  const healthy = midiConnectionView(snap({ status: 'connected', inputs: [input('a')] }));
  assert.deepEqual([healthy.action, healthy.actionLabel, healthy.showStatus], ['reconnect', 'Reconnect controller', false]);
  const degraded = midiConnectionView(snap({ status: 'connected', inputs: [input('a')], error: new Error('stale') }));
  assert.deepEqual([degraded.label, degraded.action, degraded.showStatus], ['Some controllers are unavailable.', 'retry', true]);
  assert.equal(midiConnectionView(snap({ status: 'connected', inputs: [input('a'), input('b')] })).label, '2 controllers detected');
  assert.equal(midiConnectionView(snap({ status: 'connected', inputs: [input('a')] })).label, '1 controller detected');
  assert.equal(
    midiConnectionView(snap({ status: 'connected', activeInputId: 'a', inputs: [input('a', 'BeatStep', 'Arturia')] })).activeInputLabel,
    'Arturia BeatStep',
  );
  assert.equal(
    midiConnectionView(snap({ status: 'connected', activeInputId: 'a', inputs: [input('a', 'Arturia BeatStep', 'Arturia')] })).label,
    'Arturia BeatStep',
    'a manufacturer already present in the product name is not duplicated',
  );
  assert.equal(
    midiConnectionView(snap({ status: 'connected', activeInputId: 'a', inputs: [input('a', 'BeatStep', 'Arturia'), input('b', 'Launch Control', 'Novation')] })).label,
    'Arturia BeatStep +1',
  );
  assert.equal(
    midiConnectionView(snap({
      status: 'connected',
      activeInputId: 'b',
      inputs: [input('a', 'BeatStep', 'Arturia'), input('b', 'Launch Control', 'Novation')],
    })).label,
    'Novation Launch Control +1',
    'the selected controller leads the connection label',
  );

  // Per-slider badge derivation.
  assert.equal(midiTargetBadge(snap({}), 'p', 'amount'), null);
  assert.deepEqual(midiTargetBadge(snap({ mapping: { panelId: 'p' } }), 'p', 'amount'), { state: 'select', cc: null });
  assert.deepEqual(midiTargetBadge(snap({ mapping: { panelId: null } }), 'p', 'amount'), { state: 'select', cc: null });
  assert.deepEqual(midiTargetBadge(snap({ bindings: [binding] }), 'p', 'amount'), { state: 'bound', cc: 74 });
  assert.deepEqual(
    midiTargetBadge(snap({ learning: { panelId: 'p', path: 'amount' }, bindings: [binding] }), 'p', 'amount'),
    { state: 'listening', cc: null },
    'a target currently learning shows listening even if already bound',
  );
  assert.deepEqual(
    midiTargetBadge(snap({
      learning: { panelId: 'p', path: 'amount' },
      learningWarning: { panelId: 'p', path: 'amount', message: 'Use a compatible control that sends MIDI CC.' },
    }), 'p', 'amount'),
    { state: 'warning', cc: null },
  );
  // The badge is scoped to its own panel/path.
  assert.equal(midiTargetBadge(snap({ mapping: { panelId: 'other' } }), 'p', 'amount'), null);
});

test('scaleMidiValue supports reversed MIDI and output ranges', () => {
  assert.equal(
    scaleMidiValue(0, { panelId: 'p', path: 'x', cc: 1, midiMin: 127, midiMax: 0 }, { min: 0, max: 100, step: 1 }),
    100,
  );
  assert.equal(
    scaleMidiValue(127, { panelId: 'p', path: 'x', cc: 1, min: 100, max: 0 }, { min: 0, max: 100, step: 1 }),
    0,
  );
  assert.ok(
    Math.abs(scaleMidiValue(64, { panelId: 'p', path: 'x', cc: 1 }, { min: 0, max: 1, step: 1e-7 }) - (64 / 127)) < 1e-6,
    'scientific-notation steps retain their precision',
  );
  assert.equal(
    scaleMidiValue(78, { panelId: 'p', path: 'x', cc: 1 }, { min: 0, max: 1, step: 1e-13 }),
    0.6141732283465,
  );
});
