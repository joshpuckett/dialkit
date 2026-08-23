import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DialStore,
  type ControlMeta,
  type DialConfig,
  type EasingConfig,
  type SpringConfig,
} from './store/DialStore';
import {
  createMidiController,
  type MidiAccessLike,
  type MidiInputLike,
  type MidiMessageEventLike,
} from './midi';

const PANEL_COUNT = 96;
const BASE_SEED = 0x4d494449;
const TRANSITION_LEAVES = [
  'x1',
  'y1',
  'x2',
  'y2',
  'duration',
  'bounce',
  'stiffness',
  'damping',
  'mass',
] as const;

type TransitionLeaf = typeof TRANSITION_LEAVES[number];
type ExpectedTarget = {
  path: string;
  kind: 'slider' | 'toggle' | 'select' | 'action' | 'transition';
  control: ControlMeta;
  leaf?: TransitionLeaf;
};

class RandomTestMidiInput implements MidiInputLike {
  readonly id = 'randomized-controller';
  readonly name = 'Randomized Test Controller';
  readonly manufacturer = 'DialKit';
  readonly state = 'connected';
  connection = 'closed';
  private readonly listeners = new Set<(event: MidiMessageEventLike) => void>();

  addEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.delete(listener);
  }

  async open(): Promise<void> {
    this.connection = 'open';
  }

  async close(): Promise<void> {
    this.connection = 'closed';
  }

  send(cc: number, value: number): void {
    const event = { data: Uint8Array.from([0xb0, cc, value]) };
    this.listeners.forEach((listener) => listener(event));
  }
}

class RandomTestMidiAccess implements MidiAccessLike {
  readonly inputs: Map<string, MidiInputLike>;

  constructor(input: MidiInputLike) {
    this.inputs = new Map([[input.id, input]]);
  }

  addEventListener(_type: 'statechange', _listener: () => void): void {}
  removeEventListener(_type: 'statechange', _listener: () => void): void {}
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function randomTransition(random: () => number): EasingConfig | SpringConfig {
  const mode = Math.floor(random() * 3);
  if (mode === 0) {
    return {
      type: 'easing',
      duration: randomBetween(random, 0.1, 2),
      ease: [random(), randomBetween(random, -1, 2), random(), randomBetween(random, -1, 2)],
    };
  }
  if (mode === 1) {
    return {
      type: 'spring',
      visualDuration: randomBetween(random, 0.1, 1),
      bounce: random(),
    };
  }
  return {
    type: 'spring',
    stiffness: randomBetween(random, 1, 1000),
    damping: randomBetween(random, 1, 100),
    mass: randomBetween(random, 0.1, 10),
  };
}

function randomPanel(seed: number): DialConfig {
  const random = mulberry32(seed);
  const low = -Math.round(randomBetween(random, 1, 40));
  const high = Math.round(randomBetween(random, 10, 160));
  const entries: Array<[string, DialConfig[string]]> = [
    [`range_${seed}`, [randomBetween(random, low, high), low, high, 0.25]],
    [`scalar_${seed}`, randomBetween(random, -500, 500)],
    [`toggle_${seed}`, random() >= 0.5],
    [`motion_a_${seed}`, randomTransition(random)],
    [`motion_b_${seed}`, randomTransition(random)],
    [`choice_${seed}`, {
      type: 'select',
      options: [
        `first-${seed}`,
        { value: `middle-${seed}`, label: `Middle ${seed}` },
        `last-${seed}`,
      ],
      default: `middle-${seed}`,
    }],
    [`single_choice_${seed}`, { type: 'select', options: [`only-${seed}`] }],
    [`action_${seed}`, { type: 'action', label: `Do ${seed}` }],
    [`text_${seed}`, random() >= 0.5 ? `Panel ${seed}` : { type: 'text', default: `Panel ${seed}` }],
    [`color_${seed}`, random() >= 0.5 ? '#7c3aed' : { type: 'color', default: '#22c55e' }],
  ];

  const root: DialConfig = {};
  const section: DialConfig = { _collapsed: random() >= 0.5 };
  const nested: DialConfig = { _collapsed: random() >= 0.5 };
  const deep: DialConfig = { _collapsed: random() >= 0.5 };
  const buckets = [root, section, nested, deep];

  for (const [key, value] of shuffled(entries, random)) {
    buckets[Math.floor(random() * buckets.length)][key] = value;
  }
  nested[`depth_${seed}`] = deep;
  section[`nested_${seed}`] = nested;
  root[`section_${seed}`] = section;
  return root;
}

function expectedContract(controls: readonly ControlMeta[]): {
  supported: ExpectedTarget[];
  unsupported: string[];
} {
  const supported: ExpectedTarget[] = [];
  const unsupported: string[] = [];

  const visit = (control: ControlMeta): void => {
    switch (control.type) {
      case 'slider':
      case 'toggle':
      case 'action':
        supported.push({ path: control.path, kind: control.type, control });
        break;
      case 'select':
        if ((control.options?.length ?? 0) > 1) {
          supported.push({ path: control.path, kind: 'select', control });
        } else {
          unsupported.push(control.path);
        }
        break;
      case 'spring':
      case 'transition':
        unsupported.push(control.path);
        for (const leaf of TRANSITION_LEAVES) {
          supported.push({ path: `${control.path}.${leaf}`, kind: 'transition', control, leaf });
        }
        break;
      case 'folder':
        unsupported.push(control.path);
        control.children?.forEach(visit);
        break;
      case 'color':
      case 'text':
        unsupported.push(control.path);
        break;
    }
  };

  controls.forEach(visit);
  return { supported, unsupported };
}

function easingValue(): EasingConfig {
  return { type: 'easing', duration: 0.5, ease: [0.25, 0.1, 0.25, 1] };
}

function simpleSpringValue(): SpringConfig {
  return { type: 'spring', visualDuration: 0.5, bounce: 0.25 };
}

function advancedSpringValue(): SpringConfig {
  return { type: 'spring', stiffness: 300, damping: 24, mass: 1 };
}

function assertTransitionLeaf(
  panelId: string,
  parentPath: string,
  leaf: TransitionLeaf,
  expected: number,
  message: string,
): void {
  const value = DialStore.getValue(panelId, parentPath) as EasingConfig | SpringConfig;
  if (leaf === 'x1' || leaf === 'y1' || leaf === 'x2' || leaf === 'y2') {
    const index = { x1: 0, y1: 1, x2: 2, y2: 3 }[leaf];
    assert.equal(value.type, 'easing', message);
    assert.equal((value as EasingConfig).ease[index], expected, message);
    return;
  }
  if (leaf === 'duration') {
    const duration = value.type === 'easing' ? value.duration : value.visualDuration;
    assert.equal(duration, expected, message);
    return;
  }
  assert.equal(value.type, 'spring', message);
  assert.equal((value as SpringConfig)[leaf], expected, message);
}

function assertNumericValue(actual: unknown, expected: number | undefined, message: string): void {
  assert.equal(typeof actual, 'number', message);
  assert.equal(typeof expected, 'number', message);
  const tolerance = Math.max(1e-10, Math.abs(expected) * Number.EPSILON * 16);
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `${message}: expected ${expected}, received ${actual}`);
}

function assertSliderEndpoint(
  actual: unknown,
  expected: number | undefined,
  step: number | undefined,
  message: string,
): void {
  assert.equal(typeof actual, 'number', message);
  assert.equal(typeof expected, 'number', message);
  const tolerance = Math.max(1e-12, Math.abs(expected) * Number.EPSILON * 8, (step ?? 0) / 2 + 1e-12);
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `${message}: expected endpoint ${expected}, received ${actual}`);
}

// This is a reproducible generated-schema corpus, not a renderer, hardware, or
// open-ended fuzz test. It exercises the declared target matrix through DialStore.
test('exercises the MIDI target matrix across fixed-seed generated panel schemas', async (t) => {
  const input = new RandomTestMidiInput();
  const access = new RandomTestMidiAccess(input);
  const midi = createMidiController({ requestMIDIAccess: async () => access });
  assert.equal(await midi.connect(), true);

  let supportedCount = 0;
  let unsupportedCount = 0;

  try {
    for (let panelIndex = 0; panelIndex < PANEL_COUNT; panelIndex += 1) {
      const seed = (BASE_SEED + Math.imul(panelIndex + 1, 0x9e3779b1)) >>> 0;
      const panelId = `midi-random-${seed.toString(16)}`;
      DialStore.registerPanel(panelId, `Random MIDI ${panelIndex + 1}`, randomPanel(seed));

      try {
        const panel = DialStore.getPanel(panelId);
        assert.ok(panel, `seed ${seed}: panel registered`);
        const contract = expectedContract(panel.controls);
        supportedCount += contract.supported.length;
        unsupportedCount += contract.unsupported.length;

        for (const path of contract.unsupported) {
          const context = `seed ${seed}, unsupported ${panelId}.${path}`;
          assert.equal(midi.canMapTarget(panelId, path), false, context);
          assert.throws(() => midi.bind({ panelId, path, cc: 127 }), /target not found/, context);
        }

        let actionCount = 0;
        const unsubscribeActions = DialStore.subscribeActions(panelId, () => { actionCount += 1; });
        try {
          for (let targetIndex = 0; targetIndex < contract.supported.length; targetIndex += 1) {
            const target = contract.supported[targetIndex];
            const cc = targetIndex % 128;
            const context = `seed ${seed}, target ${panelId}.${target.path}`;

            if (target.kind === 'transition') {
              const parentPath = target.control.path;
              if (target.leaf === 'x1' || target.leaf === 'y1' || target.leaf === 'x2' || target.leaf === 'y2' || target.leaf === 'duration') {
                DialStore.updateValue(panelId, parentPath, easingValue());
              } else if (target.leaf === 'bounce') {
                DialStore.updateValue(panelId, parentPath, simpleSpringValue());
              } else {
                DialStore.updateValue(panelId, parentPath, advancedSpringValue());
              }
            }

            assert.equal(midi.canMapTarget(panelId, target.path), true, context);
            const binding = midi.bind({ panelId, path: target.path, cc });
            assert.equal(midi.getBindingForTarget(panelId, target.path), binding, context);

            if (target.kind === 'slider') {
              input.send(cc, 0);
              assertNumericValue(DialStore.getValue(panelId, target.path), target.control.min, `${context}, minimum`);
              input.send(cc, 127);
              assertSliderEndpoint(DialStore.getValue(panelId, target.path), target.control.max, target.control.step, `${context}, maximum`);
            } else if (target.kind === 'select') {
              const options = target.control.options ?? [];
              const optionValue = (index: number) => typeof options[index] === 'string' ? options[index] : options[index]?.value;
              input.send(cc, 0);
              assert.equal(DialStore.getValue(panelId, target.path), optionValue(0), `${context}, first option`);
              input.send(cc, 127);
              assert.equal(DialStore.getValue(panelId, target.path), optionValue(options.length - 1), `${context}, last option`);
            } else if (target.kind === 'toggle') {
              const before = Boolean(DialStore.getValue(panelId, target.path));
              input.send(cc, 0);
              input.send(cc, 127);
              assert.equal(DialStore.getValue(panelId, target.path), !before, `${context}, rising edge`);
              input.send(cc, 127);
              assert.equal(DialStore.getValue(panelId, target.path), !before, `${context}, held button`);
            } else if (target.kind === 'action') {
              const before = actionCount;
              input.send(cc, 0);
              input.send(cc, 127);
              input.send(cc, 127);
              assert.equal(actionCount, before + 1, `${context}, one activation per rising edge`);
            } else {
              const leaf = target.leaf!;
              const parentPath = target.control.path;
              const ranges: Record<TransitionLeaf, readonly [number, number]> = {
                x1: [0, 1], y1: [-1, 2], x2: [0, 1], y2: [-1, 2],
                duration: [0.1, 2], bounce: [0, 1], stiffness: [1, 1000],
                damping: [1, 100], mass: [0.1, 10],
              };
              input.send(cc, 0);
              assertTransitionLeaf(panelId, parentPath, leaf, ranges[leaf][0], `${context}, minimum`);
              input.send(cc, 127);
              assertTransitionLeaf(panelId, parentPath, leaf, ranges[leaf][1], `${context}, maximum`);

              if (leaf === 'duration') {
                DialStore.updateValue(panelId, parentPath, simpleSpringValue());
                input.send(cc, 0);
                assertTransitionLeaf(panelId, parentPath, leaf, 0.1, `${context}, spring minimum`);
                input.send(cc, 127);
                assertTransitionLeaf(panelId, parentPath, leaf, 1, `${context}, spring maximum`);
              }
            }

            assert.equal(midi.unbind(binding), true, `${context}, unbind`);
            assert.equal(midi.getBindingForTarget(panelId, target.path), undefined, `${context}, binding removed`);
          }
        } finally {
          unsubscribeActions();
        }
      } finally {
        DialStore.unregisterPanel(panelId);
      }
    }
  } finally {
    midi.disconnect();
  }

  assert.ok(supportedCount >= PANEL_COUNT * 20, 'the fixed-seed corpus exercises the supported target matrix');
  assert.ok(unsupportedCount >= PANEL_COUNT * 5, 'the fixed-seed corpus exercises unsupported control types');
  t.diagnostic(`${PANEL_COUNT} fixed-seed generated schemas; ${supportedCount} compatible targets; ${unsupportedCount} incompatible paths`);
});
