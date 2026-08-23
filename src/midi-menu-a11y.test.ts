import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(path, 'utf8');

const adapters = [
  { name: 'React', path: 'src/components/MidiMenu.tsx', uniqueId: 'useId' },
  { name: 'Solid', path: 'src/solid/components/MidiMenu.tsx', uniqueId: 'createUniqueId' },
  { name: 'Vue', path: 'src/vue/components/MidiMenu.ts', uniqueId: 'useId' },
  { name: 'Svelte', path: 'src/svelte/components/MidiMenu.svelte', uniqueId: '$props.id' },
];

describe('MIDI menu accessibility contract', () => {
  for (const adapter of adapters) {
    it(`${adapter.name} uses instance-safe dialog linkage and native controller selection`, () => {
      const source = read(adapter.path);
      assert.ok(source.includes(adapter.uniqueId), `${adapter.name} must derive IDs from its framework instance`);
      assert.ok(source.includes('aria-labelledby') && source.includes('titleId'), `${adapter.name} dialog needs a linked visible title`);
      assert.ok(source.includes('dialkit-midi-device-radio'), `${adapter.name} must render native radio inputs`);
      assert.match(source, /type.{0,4}radio/, `${adapter.name} controller selection must use native radio semantics`);
      assert.ok(source.includes('button:not(:disabled)'), `${adapter.name} must move focus into the opened dialog`);
      assert.match(source, /trigger(?:Ref|El).*\.focus|triggerRef\.value\?\.focus/s, `${adapter.name} must return focus to its trigger`);
      assert.ok(source.includes('startMapping(undefined, ownerToken)'), `${adapter.name} must own sessions it starts`);
      assert.ok(source.includes('stopMapping(ownerToken)'), `${adapter.name} cleanup must stop only its own session`);
      assert.ok(!source.includes("'dialkit-midi-root'") && !source.includes("$derived('dialkit-midi-root')"), `${adapter.name} must not reuse a global dialog ID`);
    });
  }

  it('expands only the MIDI trigger hit target without changing approved header geometry', () => {
    const theme = read('src/styles/theme.css');
    assert.match(theme, /\.dialkit-root-header-actions \.dialkit-midi-trigger\s*\{[^}]*position: relative;[^}]*height: 16px;/s);
    assert.match(theme, /\.dialkit-root-header-actions \.dialkit-midi-trigger::before\s*\{[^}]*position: absolute;[^}]*inset: -4px 0;/s);
    assert.match(theme, /\.dialkit-root-header-actions\s*\{[^}]*right: 24px;/s, 'the origin-aligned toggle relationship must stay unchanged');
    assert.match(theme, /\.dialkit-midi-device:has\(\.dialkit-midi-device-radio:focus-visible\)/, 'native radios need a visible row-level focus indicator');
  });
});

describe('MIDI mapping owner propagation', () => {
  const ownershipAdapters = [
    {
      name: 'React',
      root: 'src/components/DialRoot.tsx',
      panel: 'src/components/Panel.tsx',
      renderer: 'src/components/ControlRenderer.tsx',
      badge: 'src/components/ControlRenderer.tsx',
    },
    {
      name: 'Solid',
      root: 'src/solid/components/DialRoot.tsx',
      panel: 'src/solid/components/Panel.tsx',
      renderer: 'src/solid/components/ControlRenderer.tsx',
      badge: 'src/solid/components/MidiBadge.tsx',
    },
    {
      name: 'Vue',
      root: 'src/vue/components/DialRoot.ts',
      panel: 'src/vue/components/Panel.ts',
      renderer: 'src/vue/components/ControlRenderer.ts',
      badge: 'src/vue/components/MidiBadge.ts',
    },
    {
      name: 'Svelte',
      root: 'src/svelte/components/DialRoot.svelte',
      panel: 'src/svelte/components/Panel.svelte',
      renderer: 'src/svelte/components/ControlRenderer.svelte',
      badge: 'src/svelte/components/MidiBadge.svelte',
    },
  ];

  for (const adapter of ownershipAdapters) {
    it(`${adapter.name} keeps badge re-map sessions owned by the originating root`, () => {
      const root = read(adapter.root);
      const panel = read(adapter.panel);
      const renderer = read(adapter.renderer);
      const badge = read(adapter.badge);
      assert.ok(root.includes('MidiMappingOwner'), `${adapter.name} root must create a stable mapping owner`);
      assert.match(root, /stopMapping\(midiOwner\)/, `${adapter.name} root must clean only its own session`);
      assert.ok(root.includes('midiOwner'), `${adapter.name} root must pass its owner downstream`);
      assert.ok(panel.includes('midiOwner'), `${adapter.name} panel must preserve the root owner`);
      assert.ok(renderer.includes('midiOwner'), `${adapter.name} renderer must preserve the root owner`);
      assert.match(badge, /startMapping\(undefined, (?:props\.)?(?:ownerToken|midiOwner)\)/,
        `${adapter.name} bound badge must start an owned mapping session`);
    });
  }

  it('Svelte propagates root ownership to every spring and transition leaf badge', () => {
    for (const path of [
      'src/svelte/components/SpringControl.svelte',
      'src/svelte/components/TransitionControl.svelte',
    ]) {
      const source = read(path);
      assert.ok(source.includes('MidiMappingOwner'));
      assert.doesNotMatch(source, /<MidiBadge(?![^>]*ownerToken)[^>]*>/,
        `${path} must not render an ownerless compound-control badge`);
    }
  });
});
