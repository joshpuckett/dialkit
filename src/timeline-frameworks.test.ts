import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { createRenderer, defineComponent, h } from 'vue';
import { DialTimeline as VueDialTimeline } from './vue/components/Timeline/DialTimeline';
import { useDialTimeline as useVueDialTimeline } from './vue/useDialTimeline';
import { DialTimelineController as LitDialTimelineController } from './lit/DialTimelineController';
import { DialStore } from './store/DialStore';
import { TimelineStore } from './store/TimelineStore';
import { TimelineUiStore } from './store/TimelineUiStore';

type HostNode = {
  parent: HostNode | null;
  children: HostNode[];
  text?: string;
};

const vueRenderer = createRenderer<HostNode, HostNode>({
  patchProp() {},
  insert(child, parent, anchor) {
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index >= 0) parent.children.splice(index, 0, child);
    else parent.children.push(child);
  },
  remove(child) {
    const index = child.parent?.children.indexOf(child) ?? -1;
    if (child.parent && index >= 0) child.parent.children.splice(index, 1);
    child.parent = null;
  },
  createElement() {
    return { parent: null, children: [] };
  },
  createText(text) {
    return { parent: null, children: [], text };
  },
  createComment(text) {
    return { parent: null, children: [], text };
  },
  setText(node, text) {
    node.text = text;
  },
  setElementText(node, text) {
    node.text = text;
  },
  parentNode(node) {
    return node.parent;
  },
  nextSibling(node) {
    if (!node.parent) return null;
    const index = node.parent.children.indexOf(node);
    return node.parent.children[index + 1] ?? null;
  },
  querySelector() {
    return null;
  },
  setScopeId() {},
  insertStaticContent() {
    const node: HostNode = { parent: null, children: [] };
    return [node, node];
  },
});

describe('framework timeline adapters', () => {
  it('leaves Vue timeline visibility uncontrolled when visible is omitted', () => {
    TimelineUiStore.requestVisible(true);
    const root: HostNode = { parent: null, children: [] };
    const app = vueRenderer.createApp(VueDialTimeline, { productionEnabled: true });

    app.mount(root);
    assert.equal(TimelineUiStore.getVisible(), true);

    app.unmount();
  });

  it('registers, updates, and cleans up the Vue adapter', () => {
    const id = 'vue-timeline-lifecycle';
    let timeline: ReturnType<typeof useVueDialTimeline> | undefined;
    const App = defineComponent({
      setup() {
        timeline = useVueDialTimeline('Vue Timeline Test', {
          clip: { at: 0, duration: 1 },
        }, { id, autoplay: false });
        return () => h('div');
      },
    });
    const root: HostNode = { parent: null, children: [] };
    const app = vueRenderer.createApp(App);

    app.mount(root);
    assert.equal(TimelineStore.getTimeline(id)?.duration, 1);
    assert.equal(DialStore.getPanel(id)?.kind, 'timeline');
    assert.equal(timeline!.value.clip.duration, 1);

    DialStore.updateValue(id, 'clip.duration', 1.5);
    assert.equal(timeline!.value.clip.duration, 1.5);

    app.unmount();
    assert.equal(TimelineStore.getTimeline(id), undefined);
    assert.equal(DialStore.getPanel(id), undefined);
  });

  it('registers, updates, and cleans up the Lit adapter', () => {
    const id = 'lit-timeline-lifecycle';
    const host = {
      updates: 0, controller: undefined as LitDialTimelineController<{ clip: { at: number; duration: number } }> | undefined,
      addController(controller: LitDialTimelineController<{ clip: { at: number; duration: number } }>) { this.controller = controller; },
      removeController() {}, requestUpdate() { this.updates++; }, updateComplete: Promise.resolve(true),
    };
    const timeline = new LitDialTimelineController(host, 'Lit Timeline Test', {
      clip: { at: 0, duration: 1 },
    }, { id, autoplay: false });
    assert.equal(timeline.values.duration, 1);

    host.controller!.hostConnected();
    assert.equal(TimelineStore.getTimeline(id)?.duration, 1);
    assert.equal(DialStore.getPanel(id)?.kind, 'timeline');
    assert.equal(timeline.values.clip.duration, 1);

    const updates = host.updates;
    DialStore.updateValue(id, 'clip.duration', 1.5);
    assert.equal(timeline.values.clip.duration, 1.5);
    assert.ok(host.updates > updates);

    host.controller!.hostDisconnected();
    assert.equal(TimelineStore.getTimeline(id), undefined);
    assert.equal(DialStore.getPanel(id), undefined);
  });

  it('registers, updates, and cleans up the Solid adapter in its browser condition', () => {
    const script = `
      globalThis.window = { document: {} };
      globalThis.document = globalThis.window.document;
      const { createRoot } = await import('solid-js');
      const { createDialTimeline } = await import('./src/solid/createDialTimeline.ts');
      const { DialStore } = await import('./src/store/DialStore.ts');
      const { TimelineStore } = await import('./src/store/TimelineStore.ts');
      const id = 'solid-timeline-lifecycle';
      let dispose;
      let timeline;
      createRoot((cleanup) => {
        dispose = cleanup;
        timeline = createDialTimeline('Solid Timeline Test', {
          clip: { at: 0, duration: 1 },
        }, { id, autoplay: false });
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const registered = TimelineStore.getTimeline(id)?.duration;
      const kind = DialStore.getPanel(id)?.kind;
      DialStore.updateValue(id, 'clip.duration', 1.5);
      const edited = timeline().clip.duration;
      dispose();
      console.log(JSON.stringify({
        registered,
        kind,
        edited,
        timelineRemoved: TimelineStore.getTimeline(id) === undefined,
        panelRemoved: DialStore.getPanel(id) === undefined,
      }));
    `;
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import', 'tsx', '--input-type=module', '-e', script],
      { cwd: process.cwd(), encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      registered: 1,
      kind: 'timeline',
      edited: 1.5,
      timelineRemoved: true,
      panelRemoved: true,
    });
  });

  it('compiles and resolves the Svelte adapter value contract during SSR', async () => {
    let source = readFileSync('src/svelte/createDialTimeline.svelte.ts', 'utf8');
    source = source
      .replaceAll("from 'dialkit/store'", "from '../src/store/DialStore.ts'")
      .replaceAll("from 'dialkit/timeline'", "from '../src/timeline/index.ts'");
    const javascript = transpileModule(source, {
      compilerOptions: {
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2020,
      },
    }).outputText;
    const compiled = compileModule(javascript, {
      filename: 'createDialTimeline.svelte.js',
      generate: 'server',
    });
    const tempDirectory = mkdtempSync(join(process.cwd(), '.svelte-timeline-test-'));
    const modulePath = join(tempDirectory, 'timeline.mjs');

    try {
      writeFileSync(modulePath, compiled.js.code);
      const module = await import(pathToFileURL(modulePath).href);
      const timeline = module.createDialTimeline('Svelte Timeline Test', {
        clip: { at: 0.25, duration: 1 },
      }, { autoplay: false });

      assert.equal(timeline.duration, 1.25);
      assert.equal(timeline.clip.at, 0.25);
      assert.equal(timeline.clip.duration, 1);
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
