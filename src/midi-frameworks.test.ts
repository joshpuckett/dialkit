import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Source-level contract checks for the four framework adapters. These assertions
// verify imports, public seams, and shared design-system hooks in source; they do not
// render the adapters or prove that every source path is reachable. Runtime behavior
// is covered by midi.test.ts, while scripts/smoke-package.mjs checks the installed
// package's singleton identity.

const read = (path: string): string => readFileSync(path, 'utf8');

const readComponentDir = (dir: string): string =>
  readdirSync(dir)
    .filter((file) => /\.(tsx?|svelte)$/.test(file))
    .map((file) => read(join(dir, file)))
    .join('\n');

const adapters = [
  { name: 'react', index: 'src/index.ts', dir: 'src/components', root: 'src/components/DialRoot.tsx', panel: 'src/components/Panel.tsx', menu: 'src/components/MidiMenu.tsx', slider: 'src/components/Slider.tsx', midiSpecifier: "'./midi'" },
  { name: 'solid', index: 'src/solid/index.ts', dir: 'src/solid/components', root: 'src/solid/components/DialRoot.tsx', panel: 'src/solid/components/Panel.tsx', menu: 'src/solid/components/MidiMenu.tsx', slider: 'src/solid/components/Slider.tsx', midiSpecifier: "'../midi'" },
  { name: 'vue', index: 'src/vue/index.ts', dir: 'src/vue/components', root: 'src/vue/components/DialRoot.ts', panel: 'src/vue/components/Panel.ts', menu: 'src/vue/components/MidiMenu.ts', slider: 'src/vue/components/Slider.ts', midiSpecifier: "'../midi'" },
  { name: 'svelte', index: 'src/svelte/index.ts', dir: 'src/svelte/components', root: 'src/svelte/components/DialRoot.svelte', panel: 'src/svelte/components/Panel.svelte', menu: 'src/svelte/components/MidiMenu.svelte', slider: 'src/svelte/components/Slider.svelte', midiSpecifier: "'dialkit/midi'" },
];

describe('MIDI mapping UI parity across framework adapters', () => {
  for (const adapter of adapters) {
    it(`${adapter.name}: re-exports the shared MIDI surface + MidiMenu from the canonical specifier`, () => {
      const index = read(adapter.index);
      for (const symbol of ['createMidiController', 'getSharedMidiController', 'midiConnectionView', 'midiInputDisplayName', 'midiTargetBadge', 'MidiMenu']) {
        assert.ok(index.includes(symbol), `${adapter.name} index should export ${symbol}`);
      }
      assert.ok(
        index.includes(adapter.midiSpecifier),
        `${adapter.name} index should import the MIDI runtime from ${adapter.midiSpecifier} (bundler → dialkit/midi singleton)`,
      );
    });

    it(`${adapter.name}: menu reuses the DS toolbar + glass dropdown and drives the shared model`, () => {
      const menu = read(adapter.menu);
      assert.ok(menu.includes('dialkit-midi-trigger'), `${adapter.name} menu should use the 36px toolbar trigger class`);
      assert.ok(menu.includes('dialkit-midi-dropdown'), `${adapter.name} menu should use the portaled glass dropdown class`);
      assert.ok(menu.includes('data-theme'), `${adapter.name} portaled menu should preserve the DialKit theme`);
      assert.ok(menu.includes('midiConnectionView'), `${adapter.name} menu should derive status via midiConnectionView`);
      assert.ok(menu.includes('MIDI_CONTROLLER_DESCRIPTION'), `${adapter.name} should use the shared one-sentence controller description`);
      assert.ok(/startMapping/.test(menu) && /stopMapping/.test(menu), `${adapter.name} menu should toggle mapping mode`);
      assert.ok(menu.includes('.connect()') && menu.includes('await'), `${adapter.name} menu should request MIDI access from its CTA`);
      assert.ok(menu.includes('Map parameters'), `${adapter.name} should expose an explicit mapping-mode CTA`);
      assert.ok(menu.includes('dialkit-button dialkit-midi-cta'), `${adapter.name} MIDI CTAs should reuse the canonical DialKit button style`);
      assert.ok(!menu.includes('dialkit-midi-enable') && !menu.includes('dialkit-midi-map-parameters'), `${adapter.name} should not retain bespoke MIDI CTA classes`);
      assert.ok(menu.includes('Finish MIDI mapping') && menu.includes('Done'), `${adapter.name} root trigger should become the map-mode exit`);
      assert.ok(menu.includes('selectInput') && menu.includes('radiogroup'), `${adapter.name} should expose connected controllers as a single active selection`);
      assert.ok(menu.includes('activeInputId'), `${adapter.name} should require an explicitly selected controller before mapping`);
      assert.ok(menu.includes('dialkit-midi-device-check') && menu.includes('ICON_CHECK'), `${adapter.name} should mark the active controller with the shared check icon`);
      assert.ok(!menu.includes('dialkit-midi-device-state') && !menu.includes('>Active<') && !menu.includes("'Active'"), `${adapter.name} should not label the selected controller with redundant Active text`);
      assert.ok(menu.includes('dialkit-midi-trigger-status') && /data-state.{0,4}connected/.test(menu), `${adapter.name} should render the active controller through the shared status component variant`);
      assert.ok(menu.includes('data-connected'), `${adapter.name} should expose the connected trigger state to shared styling`);
      assert.ok(menu.includes('unbindTarget'), `${adapter.name} menu should unmap via unbindTarget`);
      assert.ok(/data-state.{0,4}disconnected/.test(menu) && menu.includes('No controller'), `${adapter.name} should render the disconnected state through the shared status component variant`);
      assert.ok(menu.includes('dialkit-midi-trigger-status-dot') && menu.includes('dialkit-midi-trigger-status-label'), `${adapter.name} status variants should share one dot-and-label component contract`);
      assert.ok(menu.includes('ICON_TRASH'), `${adapter.name} menu should reuse the shared trash icon for unmapping`);
      assert.ok(read(adapter.root).includes('MidiMenu'), `${adapter.name} should own MIDI at the DialKit root`);
      assert.ok(!read(adapter.panel).includes('MidiMenu'), `${adapter.name} panels should not duplicate the MIDI control`);
    });

    it(`${adapter.name}: compatible controls gain a controller-aware mapping badge via the shared seam`, () => {
      assert.ok(read(adapter.slider).includes('midiSlot'), `${adapter.name} Slider should expose the midiSlot seam`);
      const components = readComponentDir(adapter.dir);
      assert.ok(components.includes('midiTargetBadge'), `${adapter.name} should derive the badge via midiTargetBadge`);
      assert.ok(components.includes('canMapTarget'), `${adapter.name} should gate badges through the live panel-schema target resolver`);
      assert.ok(components.includes('dialkit-midi-pill'), `${adapter.name} should render the badge with dialkit-midi-pill`);
      assert.ok(components.includes('Move control'), `${adapter.name} should state the next hardware-learning step without truncation`);
      assert.ok(components.includes('Use MIDI CC'), `${adapter.name} should surface incompatible MIDI inline`);
      assert.ok(components.includes('.duration') && components.includes('.bounce'), `${adapter.name} should expose compound transition leaves to MIDI mapping`);
      for (const leaf of ['.x1', '.y1', '.x2', '.y2']) {
        assert.ok(components.includes(leaf), `${adapter.name} should expose the easing ${leaf.slice(1)} handle to MIDI mapping`);
      }
      assert.ok(components.includes('SelectControl') && components.includes('midiSlot'), `${adapter.name} should expose multi-option selects to continuous mapping`);
      assert.ok(components.includes('midiSlot') && components.includes('dialkit-midi-action-target'), `${adapter.name} should expose toggles and actions to discrete mapping`);
      assert.ok(components.includes('dialkit-midi-live-dot'), `${adapter.name} should retain a subtle mapped/live indicator`);
      assert.ok(/\blearn\(/.test(components), `${adapter.name} badge should start learn on click`);
    });
  }

  it('leaves the origin root-header layout untouched and positions MIDI beside its existing icon', () => {
    const theme = read('src/styles/theme.css');
    assert.match(theme, /\.dialkit-root-header-actions\s*\{[^}]*position: absolute;[^}]*top: 12px;[^}]*right: 24px;/s, 'MIDI should sit 8px left of the origin-anchored icon without joining header layout flow');
    assert.match(theme, /dialkit-panel-inner:not\(\[data-collapsed="true"\]\)[^{]*\.dialkit-panel-icon\s*\{[^}]*right: 0;/s, 'the sticky expanded header should compensate for its new positioning context and preserve the origin icon anchor');
    assert.match(theme, /\.dialkit-panel\[data-multiple="true"\] \.dialkit-root-header-actions\s*\{[^}]*top: 14px;/s, 'MIDI should follow the origin multi-panel icon offset');
    assert.match(theme, /dialkit-panel-header\s*\{[^}]*position: sticky;[^}]*top: 0;/s, 'the unchanged origin root header should become sticky at the panel edge');
    assert.ok(theme.includes('top: 44px;') && theme.includes('top: 88px;'), 'multi-panel sections should use the existing 44px header lanes');
    assert.doesNotMatch(theme, /dialkit-panel-header\s*\{[^}]*(?:padding|margin|height|width):/s, 'sticky behavior must not alter root-header geometry');
    assert.match(theme, /\.dialkit-midi-devices\s*\{[^}]*padding: 8px 2px;/s, 'controller rows should have equal breathing room around their dividers');
    assert.match(theme, /\.dialkit-midi-cta\s*\{[^}]*margin: 8px 4px 4px;/s, 'the CTA should resolve to equal visual insets after the dropdown outer padding');
    assert.match(theme, /\.dialkit-midi-title\s*\{[^}]*padding: 8px 8px 4px;/s, 'the controller title should sit 4px above its description');
    assert.match(theme, /\.dialkit-midi-status\s*\{[^}]*padding: 0 8px 8px;/s, 'the controller description should sit 8px above the divider');
  });
});
