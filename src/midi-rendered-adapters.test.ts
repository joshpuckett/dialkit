import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { build } from 'esbuild';
import { solidPlugin } from 'esbuild-plugin-solid';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {
  createMidiController,
  type MidiAccessLike,
  type MidiController,
  type MidiControllerSnapshot,
  type MidiInputLike,
  type MidiMessageEventLike,
} from './midi';
import { DialStore, type DialConfig, type PanelConfig } from './store/DialStore';
import { DialRoot as ReactDialRoot } from './components/DialRoot';
import { Panel as ReactPanel } from './components/Panel';
import { Panel as VuePanel } from './vue/components/Panel';

const testWindow = {
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
};

const testDocument = {
  body: { nodeType: 1 },
  addEventListener() {},
  removeEventListener() {},
};

Object.assign(globalThis, {
  window: testWindow,
  document: testDocument,
});

const panelConfig: DialConfig = {
  amount: [0, 100, 1, 50],
  enabled: true,
  mode: { type: 'select', options: ['One', 'Two', 'Three'], default: 'One' },
  run: { type: 'action', label: 'Run' },
  spring: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
  transition: { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] },
};

const mappingSnapshot: MidiControllerSnapshot = {
  status: 'connected',
  inputs: [{ id: 'controller', name: 'Test Controller', manufacturer: null, state: 'connected', connection: 'open' }],
  activeInputId: 'controller',
  bindings: [],
  learning: null,
  learningWarning: null,
  mapping: { panelId: null },
  error: null,
};

function createMappingController(onSubscribe: () => void = () => undefined): MidiController {
  return {
    connect: async () => true,
    disconnect() {},
    canMapTarget: () => true,
    bind: () => { throw new Error('not used'); },
    unbind: () => false,
    unbindTarget: () => 0,
    unbindAll() {},
    learn: async () => { throw new Error('not used'); },
    cancelLearn: () => false,
    selectInput: () => true,
    getBindingForTarget: () => undefined,
    startMapping() {},
    stopMapping() {},
    getSnapshot: () => mappingSnapshot,
    subscribe: () => {
      onSubscribe();
      return () => undefined;
    },
  };
}

function registerPanel(id: string): PanelConfig {
  DialStore.registerPanel(id, 'Rendered MIDI matrix', panelConfig);
  const panel = DialStore.getPanel(id);
  assert.ok(panel);
  return panel;
}

function hasClass(value: unknown, className: string): boolean {
  return typeof value === 'string' && value.split(/\s+/).includes(className);
}

function assertBadgeIsNotNestedInButton(badge: ReactTestInstance): void {
  let parent = badge.parent;
  while (parent) {
    assert.notEqual(parent.type, 'button', 'the MIDI badge must be a sibling of the action button, never its child');
    if (hasClass(parent.props.className, 'dialkit-midi-action-target')) return;
    parent = parent.parent;
  }
}

class OwnershipTestInput implements MidiInputLike {
  readonly id = 'owner-controller';
  readonly name = 'Owner Controller';
  readonly manufacturer = 'Test';
  state = 'connected';
  connection = 'open';
  private listeners = new Set<(event: MidiMessageEventLike) => void>();

  addEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.delete(listener);
  }
}

describe('rendered MIDI adapter reachability', () => {
  it('renders every compatible control through the real React Panel path without nested buttons', () => {
    const id = 'rendered-midi-react';
    const panel = registerPanel(id);
    let renderer: ReactTestRenderer | undefined;
    try {
      act(() => {
        renderer = create(createElement(ReactPanel, { panel, midi: createMappingController(), variant: 'section' }));
      });
      const badges = renderer!.root.findAll((node) => hasClass(node.props.className, 'dialkit-midi-pill'));
      assert.equal(badges.length, 11, 'slider, toggle, select, action, spring leaves, and easing leaves should all be reachable');
      const actionBadge = renderer!.root.findAll((node) => hasClass(node.props.className, 'dialkit-midi-action-target'))[0]
        .find((node) => hasClass(node.props.className, 'dialkit-midi-pill'));
      assertBadgeIsNotNestedInButton(actionBadge);
    } finally {
      act(() => renderer?.unmount());
      DialStore.unregisterPanel(id);
    }
  });

  it('renders every compatible control through the real Vue Panel path without nested buttons', async () => {
    const id = 'rendered-midi-vue';
    const panel = registerPanel(id);
    let subscriptions = 0;
    try {
      const app = createSSRApp({
        render: () => h(VuePanel, { panel, midi: createMappingController(() => { subscriptions += 1; }), variant: 'section' }),
      });
      app.config.warnHandler = () => undefined;
      const html = await renderToString(app);
      assert.equal((html.match(/class="dialkit-midi-pill"/g) ?? []).length, 11,
        'slider, toggle, select, action, spring leaves, and easing leaves should all be reachable');
      assert.match(html, /class="dialkit-midi-action-target"><button[^>]*dialkit-midi-action-control[^>]*>Run<\/button><button[^>]*dialkit-midi-pill/,
        'the action and MIDI badge must render as sibling buttons');
      assert.doesNotMatch(html, /<button[^>]*dialkit-midi-action-control[^>]*>[^<]*<button/,
        'an action button must never contain the MIDI badge button');
      assert.equal(subscriptions, 0, 'Vue MIDI badges must not retain shared-controller subscriptions during SSR');
    } finally {
      DialStore.unregisterPanel(id);
    }
  });

  it('renders every compatible control through the real Solid Panel path without nested buttons', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dialkit-solid-midi-'));
    const output = join(directory, 'rendered.mjs');
    const entry = `
      import { createComponent } from 'solid-js';
      import { renderToString } from 'solid-js/web';
      import { Panel } from './src/solid/components/Panel.tsx';
      import { DialStore } from './src/store/DialStore.ts';

      const config = ${JSON.stringify(panelConfig)};
      const snapshot = ${JSON.stringify(mappingSnapshot)};
      const id = 'rendered-midi-solid';
      DialStore.registerPanel(id, 'Rendered MIDI matrix', config);
      const panel = DialStore.getPanel(id);
      const controller = {
        canMapTarget: () => true,
        getBindingForTarget: () => undefined,
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      };
      export const html = renderToString(() => createComponent(Panel, {
        panel,
        midi: controller,
        variant: 'section',
      }));
      DialStore.unregisterPanel(id);
    `;

    try {
      await build({
        stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'solid-midi-render.tsx', loader: 'tsx' },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: output,
        conditions: ['solid', 'node'],
        plugins: [solidPlugin({ solid: { generate: 'ssr' } })],
        logLevel: 'silent',
      });
      const { html } = await import(`${pathToFileURL(output).href}?${Date.now()}`) as { html: string };
      assert.equal((html.match(/class="dialkit-midi-pill"/g) ?? []).length, 11,
        'slider, toggle, select, action, spring leaves, and easing leaves should all be reachable');
      assert.match(html, /class="dialkit-midi-action-target"><button[^>]*dialkit-midi-action-control[^>]*>Run<\/button><button[^>]*dialkit-midi-pill/,
        'the action and MIDI badge must render as sibling buttons');
      assert.doesNotMatch(html, /<button[^>]*dialkit-midi-action-control[^>]*>[^<]*<button/,
        'an action button must never contain the MIDI badge button');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps badge-triggered mapping scoped to its owning React root through cleanup', async () => {
    const id = 'rendered-midi-owner-cleanup';
    DialStore.registerPanel(id, 'Owned MIDI mapping', { amount: [50, 0, 100, 1] });
    const input = new OwnershipTestInput();
    const access: MidiAccessLike = {
      inputs: new Map([[input.id, input]]),
      addEventListener() {},
      removeEventListener() {},
    };
    const controller = createMidiController({ requestMIDIAccess: async () => access });
    let ownerRoot: ReactTestRenderer | undefined;
    let unrelatedRoot: ReactTestRenderer | undefined;

    try {
      assert.equal(await controller.connect(), true);
      assert.equal(controller.selectInput(input.id), true);
      controller.bind({ panelId: id, path: 'amount', cc: 7 });

      act(() => {
        ownerRoot = create(createElement(ReactDialRoot, {
          mode: 'inline',
          productionEnabled: true,
          midi: controller,
        }));
        unrelatedRoot = create(createElement(ReactDialRoot, {
          mode: 'inline',
          productionEnabled: true,
          midi: controller,
        }));
      });

      const badge = ownerRoot!.root.find((node) => hasClass(node.props.className, 'dialkit-midi-pill'));
      act(() => badge.props.onClick({ stopPropagation() {} }));
      assert.deepEqual(controller.getSnapshot().mapping, { panelId: null });
      assert.deepEqual(controller.getSnapshot().learning && {
        panelId: controller.getSnapshot().learning?.panelId,
        path: controller.getSnapshot().learning?.path,
      }, { panelId: id, path: 'amount' });

      act(() => unrelatedRoot?.unmount());
      assert.deepEqual(controller.getSnapshot().mapping, { panelId: null },
        'another root cannot stop the owner root mapping session');
      assert.ok(controller.getSnapshot().learning,
        'another root cannot cancel the owner root pending learn');

      act(() => ownerRoot?.unmount());
      await Promise.resolve();
      assert.equal(controller.getSnapshot().mapping, null);
      assert.equal(controller.getSnapshot().learning, null);
    } finally {
      act(() => {
        unrelatedRoot?.unmount();
        ownerRoot?.unmount();
      });
      controller.disconnect();
      DialStore.unregisterPanel(id);
    }
  });
});
