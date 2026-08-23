// Release smoke for the exact package archive consumers receive. Run after build.
// The check packs without lifecycle scripts, installs that tarball into an isolated
// consumer project, then exercises the installed exports rather than the worktree.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build as bundle } from 'esbuild';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const temporaryRoot = mkdtempSync(join(tmpdir(), 'dialkit-package-smoke-'));

class FakeInput {
  constructor(id) {
    this.id = id;
    this.listeners = new Set();
    this.state = 'connected';
  }

  addEventListener(_type, listener) { this.listeners.add(listener); }
  removeEventListener(_type, listener) { this.listeners.delete(listener); }
  async open() {}
  async close() {}

  send(status, cc, value) {
    const event = { data: Uint8Array.from([status, cc, value]) };
    this.listeners.forEach((listener) => listener(event));
  }
}

function fakeAccess() {
  const input = new FakeInput('smoke');
  const access = {
    inputs: { values() { return [input].values(); } },
    addEventListener() {},
    removeEventListener() {},
  };
  return { input, access };
}

async function runtimeSmoke(label, midi, store) {
  assert.equal(typeof midi.getSharedMidiController, 'function', `${label}: MIDI runtime exported`);
  assert.equal(
    midi.getSharedMidiController(),
    midi.getSharedMidiController(),
    `${label}: shared controller is a singleton`,
  );

  const panelId = `midi-package-smoke-${label}`;
  store.DialStore.registerPanel(panelId, 'Package smoke', { amount: [0, 0, 100, 1] });
  const { input, access } = fakeAccess();
  const controller = midi.createMidiController({ requestMIDIAccess: async () => access });

  try {
    assert.equal(await controller.connect(), true, `${label}: fake backend connected`);
    const learning = controller.learn({ panelId, path: 'amount' });
    input.send(0xb5, 74, 127);
    const binding = await learning;
    assert.equal(binding.cc, 74, `${label}: learned the moved CC`);
    assert.equal(binding.inputId, undefined, `${label}: learned mapping remains device-agnostic`);
    assert.equal(binding.channel, undefined, `${label}: learned mapping remains channel-agnostic`);
    assert.equal(
      store.DialStore.getValue(panelId, 'amount'),
      100,
      `${label}: MIDI updated the matching installed store singleton`,
    );
  } finally {
    controller.disconnect();
    store.DialStore.unregisterPanel(panelId);
  }
}

async function renderInstalledSveltePanel(packageRoot, consumerRoot) {
  const entry = join(consumerRoot, 'svelte-panel-smoke.mjs');
  const output = join(consumerRoot, 'svelte-panel-smoke.bundle.mjs');
  const panelComponent = join(packageRoot, 'dist/svelte/components/Panel.svelte');
  writeFileSync(entry, `
    import { render } from 'svelte/server';
    import Panel from ${JSON.stringify(panelComponent)};
    import { DialStore } from 'dialkit/store';
    import { createMidiController } from 'dialkit/midi';

    const panelId = 'installed-svelte-panel';
    DialStore.registerPanel(panelId, 'Installed Svelte', {
      amount: [20, 0, 100, 1],
      enabled: true,
      choice: { type: 'select', options: ['one', 'two'], default: 'one' },
      run: { type: 'action', label: 'Run' },
    });
    const controller = createMidiController();
    controller.startMapping();
    const panel = DialStore.getPanel(panelId);
    const html = render(Panel, { props: { panel, midi: controller } }).body;
    console.log(html);
    DialStore.unregisterPanel(panelId);
  `);

  await bundle({
    absWorkingDir: consumerRoot,
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    conditions: ['svelte', 'node'],
    nodePaths: [join(projectRoot, 'node_modules')],
    external: ['dialkit/store', 'dialkit/midi'],
    plugins: [{
      name: 'compile-installed-svelte',
      setup(build) {
        build.onLoad({ filter: /\.svelte$/ }, ({ path }) => {
          const source = readFileSync(path, 'utf8');
          return {
            contents: compile(source, { filename: path, generate: 'server' }).js.code,
            loader: 'js',
          };
        });
      },
    }],
  });

  const html = execFileSync(process.execPath, [output], {
    cwd: consumerRoot,
    encoding: 'utf8',
  });
  assert.match(html, /dialkit-midi-pill/, 'installed Svelte Panel reaches MIDI badges');
  assert.match(html, /dialkit-midi-action-target/, 'installed Svelte Panel reaches the action wrapper');
  assert.match(
    html,
    /dialkit-midi-action-control[^>]*>[\s\S]*?<\/button>(?:(?!<button)[\s\S])*?<button[^>]*dialkit-midi-pill/,
    'installed Svelte action and MIDI badge render as sibling buttons',
  );
}

function checkInstalledRootTypeExports(consumerRoot) {
  const entry = join(consumerRoot, 'root-midi-types.ts');
  writeFileSync(entry, `
    import type { MidiLearnSource as ReactLearn, MidiMappingOwner as ReactOwner } from 'dialkit';
    import type { MidiLearnSource as SolidLearn, MidiMappingOwner as SolidOwner } from 'dialkit/solid';
    import type { MidiLearnSource as VueLearn, MidiMappingOwner as VueOwner } from 'dialkit/vue';
    import type { MidiLearnSource as SvelteLearn, MidiMappingOwner as SvelteOwner } from 'dialkit/svelte';

    const sources: [ReactLearn, SolidLearn, VueLearn, SvelteLearn] = [{}, {}, {}, {}];
    const owners: [ReactOwner, SolidOwner, VueOwner, SvelteOwner] = [{}, {}, {}, {}];
    void sources;
    void owners;
  `);
  execFileSync(process.execPath, [
    join(projectRoot, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--skipLibCheck',
    '--module', 'esnext',
    '--moduleResolution', 'bundler',
    '--target', 'es2020',
    entry,
  ], { cwd: consumerRoot, encoding: 'utf8' });
}

try {
  const packResult = JSON.parse(execFileSync(
    npm,
    ['pack', '--ignore-scripts', '--json', '--pack-destination', temporaryRoot],
    { cwd: projectRoot, encoding: 'utf8' },
  ));
  assert.equal(packResult.length, 1, 'npm pack produced one archive');

  const archive = join(temporaryRoot, packResult[0].filename);
  const consumerRoot = join(temporaryRoot, 'consumer');
  mkdirSync(consumerRoot);
  writeFileSync(
    join(consumerRoot, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
  );
  execFileSync(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--omit=peer',
      '--legacy-peer-deps',
      archive,
    ],
    { cwd: consumerRoot, encoding: 'utf8' },
  );

  const packageRoot = join(consumerRoot, 'node_modules', 'dialkit');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const installedRequire = createRequire(join(consumerRoot, 'consumer.cjs'));
  const importExport = async (subpath) => import(pathToFileURL(
    join(packageRoot, manifest.exports[subpath].import.default),
  ).href);

  checkInstalledRootTypeExports(consumerRoot);

  await runtimeSmoke(
    'installed ESM',
    await importExport('./midi'),
    await importExport('./store'),
  );
  await runtimeSmoke(
    'installed CJS',
    installedRequire('dialkit/midi'),
    installedRequire('dialkit/store'),
  );

  const installedFile = (path) => readFileSync(join(packageRoot, path), 'utf8');
  const externalized = [
    ['dist/index.js', ['"dialkit/midi"', '"dialkit/store"']],
    ['dist/index.cjs', ['"dialkit/midi"', '"dialkit/store"']],
    ['dist/solid/index.js', ['"dialkit/midi"', '"dialkit/store"']],
    ['dist/vue/index.js', ['"dialkit/midi"', '"dialkit/store"']],
  ];
  for (const [file, specifiers] of externalized) {
    const output = installedFile(file);
    for (const specifier of specifiers) {
      assert.ok(output.includes(specifier), `${file} defers to installed ${specifier}`);
    }
  }

  // Svelte is intentionally shipped as unbundled component source. These imports
  // are its singleton contract: a Svelte consumer resolves the exact same installed
  // store and MIDI subpaths as every other adapter.
  const svelteIndex = installedFile('dist/svelte/index.js');
  const svelteFactory = installedFile('dist/svelte/createDialKit.svelte.js');
  const svelteMenu = installedFile('dist/svelte/components/MidiMenu.svelte');
  assert.match(svelteIndex, /from ['"]dialkit\/store['"]/, 'Svelte re-exports installed store');
  assert.match(svelteIndex, /from ['"]dialkit\/midi['"]/, 'Svelte re-exports installed MIDI runtime');
  assert.match(svelteFactory, /from ['"]dialkit\/store['"]/, 'Svelte factory uses installed store');
  assert.match(svelteMenu, /from ['"]dialkit\/store['"]/, 'Svelte menu uses installed store');
  assert.match(svelteMenu, /from ['"]dialkit\/midi['"]/, 'Svelte menu uses installed MIDI runtime');
  await renderInstalledSveltePanel(packageRoot, consumerRoot);

  assert.ok(
    !installedFile('dist/index.js').includes('function createMidiController'),
    'React bundle does not inline a private MIDI runtime',
  );
  console.log('OK: installed-tarball ESM/CJS runtime, shared store, and framework singleton smoke passed');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
