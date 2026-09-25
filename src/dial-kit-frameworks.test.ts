import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { createElement, StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createRenderer, defineComponent, h, nextTick, reactive } from 'vue';
import { compileModule } from 'svelte/compiler';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { useDialKitController } from './hooks/useDialKit';
import { useDialKitController as useVueDialKitController } from './vue/useDialKit';
import { DialKitController as LitDialKitController } from './lit/DialKitController';
import { DialStore, type DialConfig } from './store/DialStore';

const config = { group: {
  position: { type: 'pad' }, amount: [0.25, 0, 1], enabled: true,
  title: { type: 'text', default: 'Example' }, choice: { type: 'select', options: [] },
  accent: { type: 'color' }, cover: { type: 'image' },
  spring: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
  easing: { type: 'easing', duration: 0.5, ease: [0, 0, 1, 1] },
  run: { type: 'action' },
} } satisfies DialConfig;
const defaults = { position: { x: 0, y: 0 }, amount: 0.25, enabled: true, title: 'Example', choice: '',
  accent: '#000000', cover: '', spring: config.group.spring, easing: config.group.easing, run: config.group.run };
const updates = { position: { x: 0.75, y: -0.4 }, amount: 0.5, enabled: false, title: 'Changed', accent: '#ff0000', cover: '/cover.png' };
const changed = { ...defaults, ...updates };

describe('DialKit framework values', () => {
  it('updates and resets the React controller under StrictMode', () => {
    const id = 'pad-react';
    let dial: ReturnType<typeof useDialKitController<typeof config>>;
    let renderer: ReactTestRenderer | undefined;
    function Harness() { dial = useDialKitController('Pad', config, { id }); return null; }
    try {
      act(() => { renderer = create(createElement(StrictMode, null, createElement(Harness))); });
      assert.deepEqual(dial!.values.group, defaults);
      act(() => dial.setValues({ group: updates }));
      assert.deepEqual(dial!.values.group, changed);
      act(() => dial.resetValues());
      assert.deepEqual(dial!.values.group, defaults);
    } finally { act(() => renderer?.unmount()); }
    assert.equal(DialStore.getPanel(id), undefined);
  });

  it('updates and resets the Vue computed controller values', () => {
    const id = 'pad-vue';
    let dial: ReturnType<typeof useVueDialKitController<typeof config>>;
    // The hook needs a mounted owner but no browser DOM or rendered controls.
    const renderer = createRenderer<object, object>({
      patchProp() {}, insert() {}, remove() {},
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
      querySelector: () => null, setScopeId() {}, insertStaticContent: () => [{}, {}],
    });
    const app = renderer.createApp(defineComponent({
      setup() { dial = useVueDialKitController('Pad', config, { id }); return () => h('div'); },
    }));
    try {
      app.mount({});
      assert.deepEqual(dial!.values.value.group, defaults);
      dial!.setValues({ group: updates });
      assert.deepEqual(dial!.values.value.group, changed);
      dial!.resetValues();
      assert.deepEqual(dial!.values.value.group, defaults);
    } finally { app.unmount(); }
    assert.equal(DialStore.getPanel(id), undefined);
  });

  it('tracks Vue config changes and the current action callback without replacing the controller', async () => {
    const id = 'vue-live-config';
    const config = reactive({ amount: [0.5, 0, 1, 0.1], run: { type: 'action' } } satisfies DialConfig);
    const actions: string[] = [];
    const options = reactive({ id, shortcuts: { amount: { key: 'r' } }, onAction: (path: string) => actions.push(`first:${path}`) });
    let dial: ReturnType<typeof useVueDialKitController<typeof config>>;
    const renderer = createRenderer<object, object>({
      patchProp() {}, insert() {}, remove() {},
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
      querySelector: () => null, setScopeId() {}, insertStaticContent: () => [{}, {}],
    });
    const app = renderer.createApp(defineComponent({
      setup() { dial = useVueDialKitController('Live config', config, options); return () => h('div'); },
    }));
    try {
      app.mount({});
      dial!.setValue('amount', 0.8);
      config.amount[2] = 0.6;
      options.shortcuts.amount.key = 't';
      options.onAction = path => actions.push(`latest:${path}`);
      await nextTick();
      assert.equal(dial!.values.value.amount, 0.6);
      assert.equal(DialStore.resolveShortcutTarget('t')?.panelId, id);
      DialStore.triggerAction(id, 'run');
      assert.deepEqual(actions, ['latest:run']);
    } finally { app.unmount(); }
    assert.equal(DialStore.getPanel(id), undefined);
  });

  it('updates and resets the Lit controller across its host lifecycle', () => {
    const id = 'pad-lit';
    let connected = false;
    const host = {
      updates: 0, controller: undefined as LitDialKitController<typeof config> | undefined,
      addController(controller: LitDialKitController<typeof config>) { this.controller = controller; if (connected) controller.hostConnected(); },
      removeController() {}, requestUpdate() { this.updates++; }, updateComplete: Promise.resolve(true),
    };
    const dial = new LitDialKitController(host, 'Pad', config, { id });
    assert.deepEqual(dial.values.group, defaults);
    try {
      connected = true; host.controller!.hostConnected();
      assert.deepEqual(dial.values.group, defaults);
      const before = host.updates;
      dial.setValues({ group: updates });
      assert.deepEqual(dial.values.group, changed);
      assert.ok(host.updates > before);
      dial.resetValues();
      assert.deepEqual(dial.values.group, defaults);
    } finally { host.controller!.hostDisconnected(); }
    assert.equal(DialStore.getPanel(id), undefined);
  });

  it('updates the Solid store in its browser condition', () => {
    const script = `
      import assert from 'node:assert/strict';
      import { createRoot } from 'solid-js';
      import { createDialKitController } from './src/solid/createDialKit.ts';
      import { DialStore } from './src/store/DialStore.ts';
      let dispose, dial;
      createRoot(cleanup => {
        dispose = cleanup;
        dial = createDialKitController('Pad', ${JSON.stringify(config)}, { id: 'pad-solid' });
      });
      await new Promise(resolve => queueMicrotask(resolve));
      assert.deepEqual(JSON.parse(JSON.stringify(dial.values().group)), ${JSON.stringify(defaults)});
      dial.setValues({ group: ${JSON.stringify(updates)} });
      assert.deepEqual(JSON.parse(JSON.stringify(dial.values().group)), ${JSON.stringify(changed)});
      dial.resetValues();
      assert.deepEqual(JSON.parse(JSON.stringify(dial.values().group)), ${JSON.stringify(defaults)});
      dispose();
      assert.equal(DialStore.getPanel('pad-solid'), undefined);
    `;
    const result = spawnSync(process.execPath, ['--conditions=browser', '--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('keeps all Svelte control values reactive without exposing their config', () => {
    const source = readFileSync('src/svelte/createDialKit.svelte.ts', 'utf8')
      .replaceAll("from 'dialkit/store'", `from '${pathToFileURL(join(process.cwd(), 'src/store/DialStore.ts')).href}'`);
    const harness = `
      import { flushSync } from 'svelte';
      import assert from 'node:assert/strict';
      export function verify() {
        let dial;
        const dispose = $effect.root(() => {
          dial = createDialKitController('Pad', ${JSON.stringify(config)}, { id: 'pad-svelte' });
        });
        try {
          flushSync();
          assert.deepEqual(JSON.parse(JSON.stringify(dial.values.group)), ${JSON.stringify(defaults)});
          dial.setValues({ group: ${JSON.stringify(updates)} });
          flushSync();
          assert.deepEqual(JSON.parse(JSON.stringify(dial.values.group)), ${JSON.stringify(changed)});
          dial.resetValues();
          flushSync();
          assert.deepEqual(JSON.parse(JSON.stringify(dial.values.group)), ${JSON.stringify(defaults)});
        } finally { dispose(); }
        assert.equal(DialStore.getPanel('pad-svelte'), undefined);
      }
    `;
    const javascript = transpileModule(source + harness, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2020 } }).outputText;
    const compiled = compileModule(javascript, { filename: 'pad-test.svelte.js', generate: 'client' });
    const directory = mkdtempSync(join(process.cwd(), '.dial-pad-test-'));
    const file = join(directory, 'pad.mjs');
    try {
      writeFileSync(file, compiled.js.code);
      const script = `const { verify } = await import(${JSON.stringify(pathToFileURL(file).href)}); verify();`;
      const result = spawnSync(process.execPath, ['--conditions=browser', '--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
