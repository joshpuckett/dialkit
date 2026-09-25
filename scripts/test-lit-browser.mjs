// Run after npm run build. Playwright is test tooling only, never an adapter dependency.
// DIALKIT_PLAYWRIGHT may point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const { chromium } = await import(process.env.DIALKIT_PLAYWRIGHT || 'playwright');
// Module scripts are blocked over file://, so the example runs as an inline IIFE built against dist/lit.
const bundle = await build({
  entryPoints: [resolve('examples/lit/main.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'],
  alias: { lit: resolve('node_modules/lit') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta': '{}' },
  plugins: [{ name: 'dialkit-dist', setup(b) { b.onResolve({ filter: /^dialkit\/lit$/ }, () => ({ path: resolve('dist/lit/index.js') })); } }],
});
const html = readFileSync('examples/lit/index.html', 'utf8').replace(/<script type="module" src="\.\/main\.ts"><\/script>/, () => `<script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
const directory = mkdtempSync(join(tmpdir(), 'dialkit-lit-'));
writeFileSync(join(directory, 'index.html'), html);
const url = pathToFileURL(join(directory, 'index.html')).href;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
const remoteRequests = [];
page.on('request', request => { if (/^https?:/.test(request.url()) && !/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteRequests.push(request.url()); });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto(url);
  await page.waitForFunction(() => window.demo && window.demo.app.hasUpdated);
  await page.evaluate(() => window.demo.kit.resetValues());
  const values = () => page.evaluate(() => window.demo.kit.values);
  const app = page.locator('demo-app');
  const rootElement = () => page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root'));
  // Popover root portals to the body, and the host re-renders from the controller.
  assert.equal(await page.locator('.dialkit-root:not(.dialkit-timeline)').count(), 1);
  assert.equal(await page.locator('.dialkit-root:not(.dialkit-timeline)').evaluate(el => el.parentElement === document.body), true);
  assert.equal(await page.locator('#dialkit-theme').count(), 1, 'the root injects the theme once');
  await page.getByRole('slider', { name: 'Radius', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await values()).radius, 25);
  await page.evaluate(() => window.demo.app.updateComplete);
  assert.ok((await app.getByRole('status', { name: 'Values' }).textContent()).includes('"radius":25'));
  await page.getByRole('button', { name: 'Choice' }).click();
  await page.getByRole('option', { name: 'Left', exact: true }).click();
  assert.equal((await values()).choice, 'left');
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.evaluate(() => window.demo.app.updateComplete);
  assert.equal(await app.getByRole('status', { name: 'Last action' }).textContent(), 'actions.replay');
  await page.evaluate(() => window.demo.timeline.pause());
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  // Open state events bubble out of the shadow root as composed DOM events.
  await page.evaluate(() => { window.openEvents = []; document.addEventListener('dialkit-open-change', event => window.openEvents.push(event.detail.open)); });
  await app.getByRole('button', { name: 'Close panel', exact: true }).click();
  await app.getByRole('button', { name: 'Open panel', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.openEvents), [false, true]);
  // Runtime theme changes apply in place, so a dragged panel keeps its offset (moving is only possible via the header or the collapsed bubble).
  await app.getByRole('button', { name: 'Close panel', exact: true }).click();
  const bubble = page.locator('.dialkit-panel-inner');
  await page.waitForFunction(() => document.querySelector('.dialkit-panel-inner').getAnimations().length === 0);
  const bubbleBox = await bubble.boundingBox();
  await page.mouse.move(bubbleBox.x + 21, bubbleBox.y + 21); await page.mouse.down(); await page.mouse.move(80, 120, { steps: 8 }); await page.mouse.up();
  const offset = () => page.locator('.dialkit-panel').evaluate(el => [el.style.left, el.style.top]);
  const dragged = await offset();
  assert.ok(dragged[0].endsWith('px'), 'the drag left an explicit offset');
  await page.evaluate(() => { window.demo.app.shadowRoot.querySelector('dialkit-root').theme = 'light'; });
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root').updateComplete);
  assert.equal(await page.locator('.dialkit-root:not(.dialkit-timeline)').getAttribute('data-theme'), 'light');
  assert.deepEqual(await offset(), dragged);
  await app.getByRole('button', { name: 'Open panel', exact: true }).click();
  assert.equal(await bubble.getAttribute('data-collapsed'), 'false');
  // Closing adopts the dragged corner; theme and default changes must not send the panel back to the configured one.
  await app.getByRole('button', { name: 'Close panel', exact: true }).click();
  const snapped = await page.locator('.dialkit-panel').getAttribute('data-position');
  assert.notEqual(snapped, 'top-right', 'the drag moved the panel to another corner');
  await page.evaluate(() => { const root = window.demo.app.shadowRoot.querySelector('dialkit-root'); root.theme = 'dark'; root.defaultOpen = false; });
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root').updateComplete);
  assert.equal(await page.locator('.dialkit-panel').getAttribute('data-position'), snapped, 'a theme change keeps the snapped corner');
  await app.getByRole('button', { name: 'Open panel', exact: true }).click();
  // Position changes apply in place; open state lives in the store.
  await app.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.evaluate(() => { window.rootNode = document.querySelector('.dialkit-root:not(.dialkit-timeline)'); window.demo.app.shadowRoot.querySelector('dialkit-root').position = 'bottom-left'; });
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root').updateComplete);
  assert.equal(await page.evaluate(() => window.rootNode === document.querySelector('.dialkit-root:not(.dialkit-timeline)')), true, 'position changes keep the same root');
  assert.equal(await page.locator('.dialkit-panel').getAttribute('data-position'), 'bottom-left');
  assert.equal(await page.locator('.dialkit-panel-inner').getAttribute('data-collapsed'), 'true');
  await app.getByRole('button', { name: 'Open panel', exact: true }).click();
  // production-enabled="false" removes the editor without touching the controller.
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root').setAttribute('production-enabled', 'false'));
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root').updateComplete);
  assert.equal(await page.locator('.dialkit-root:not(.dialkit-timeline)').count(), 0);
  assert.equal((await values()).radius, 25);
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root').setAttribute('production-enabled', ''));
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-root').updateComplete);
  assert.equal(await page.locator('.dialkit-root:not(.dialkit-timeline)').count(), 1);
  // Shortcuts stay quiet while typing inside the shadow root and resume afterwards.
  const typed = await values();
  await page.getByRole('textbox', { name: 'Title', exact: true }).click();
  await page.keyboard.type('very');
  assert.equal((await values()).radius, typed.radius);
  assert.ok((await values()).title.includes('very'));
  await app.locator('h1').click();
  await page.keyboard.down('r'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('r');
  assert.equal((await values()).radius, typed.radius + 1);
  // The timeline dock portals to the body; visibility is shared with the root's toggle and reported as an event.
  assert.equal(await page.locator('.dialkit-timeline').evaluate(el => el.parentElement === document.body), true);
  await page.evaluate(() => { window.visibilityEvents = []; document.addEventListener('dialkit-visibility-change', event => window.visibilityEvents.push(event.detail.visible)); });
  await page.evaluate(() => window.demo.app.shadowRoot.querySelector('dialkit-timeline').setVisible(false));
  assert.equal(await page.locator('.dialkit-timeline').isVisible(), false);
  await page.getByRole('button', { name: 'Toggle timeline', exact: true }).click();
  assert.equal(await page.locator('.dialkit-timeline').isVisible(), true);
  assert.deepEqual(await page.evaluate(() => window.visibilityEvents), [false, true]);
  const ruler = await page.locator('.dialkit-timeline-ruler').boundingBox();
  await page.mouse.click(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2);
  assert.ok(Math.abs(await page.evaluate(() => window.demo.timeline.values.time) - 2) < .02);
  await page.evaluate(() => window.demo.app.updateComplete);
  assert.ok(await app.locator('.card').evaluate(el => el.style.transform.startsWith('translate(')));
  // Persistence survives a reload.
  await page.reload(); await page.waitForFunction(() => window.demo && window.demo.app.hasUpdated);
  assert.equal((await values()).radius, typed.radius + 1);
  await page.screenshot({ path: '/tmp/dialkit-lit.png' });
  // Removing the host removes every root and releases both registrations.
  await page.evaluate(() => window.demo.app.remove());
  assert.equal(await page.locator('.dialkit-root').count(), 0);
  assert.equal(await page.evaluate(() => window.stores.DialStore.getPanels().length + window.stores.TimelineStore.getTimelines().length), 0);
  // Re-inserting the host registers again and remounts the editor.
  await page.evaluate(() => document.body.append(window.demo.app));
  await page.evaluate(() => window.demo.app.updateComplete);
  assert.equal(await page.locator('.dialkit-root:not(.dialkit-timeline)').count(), 1);
  assert.equal(await page.evaluate(() => window.stores.DialStore.getPanels().length), 2);
  // Updates keep running on detached elements; they must not recreate editor UI.
  const roots = () => page.evaluate(() => [document.querySelectorAll('.dialkit-root:not(.dialkit-timeline)').length, document.querySelectorAll('.dialkit-timeline').length]);
  await page.evaluate(async () => {
    const root = window.demo.app.shadowRoot.querySelector('dialkit-root');
    const dock = window.demo.app.shadowRoot.querySelector('dialkit-timeline');
    window.detached = { root, dock };
    root.remove(); dock.remove();
    root.theme = 'light'; dock.theme = 'light';
    await Promise.all([root.updateComplete, dock.updateComplete]);
  });
  assert.deepEqual(await roots(), [0, 0], 'detached elements must stay unmounted after an update');
  await page.evaluate(async () => {
    const fresh = document.createElement('dialkit-root');
    const freshDock = document.createElement('dialkit-timeline');
    document.body.append(fresh, freshDock);
    fresh.remove(); freshDock.remove();
    await Promise.all([fresh.updateComplete, freshDock.updateComplete]);
  });
  assert.deepEqual(await roots(), [0, 0], 'append and remove before the first update must not mount');
  await page.evaluate(async () => {
    const { root, dock } = window.detached;
    root.theme = 'dark'; dock.theme = 'dark';
    document.body.append(root, dock);
    await Promise.all([root.updateComplete, dock.updateComplete]);
  });
  assert.deepEqual(await roots(), [1, 1], 'reconnected elements mount exactly one root and one dock');
  // A second panel wraps both in a shell. Like the other adapters, the shell keeps its state across
  // position changes, and default-open is an initial value that later changes do not reapply.
  const collapsed = () => page.locator('.dialkit-panel-inner').getAttribute('data-collapsed');
  const setRoot = async (patch) => { await page.evaluate(patch => Object.assign(document.querySelector('dialkit-root'), patch), patch); await page.evaluate(() => document.querySelector('dialkit-root').updateComplete); };
  await page.evaluate(() => window.stores.DialStore.registerPanel('second', 'Second panel', { speed: 1 }));
  await page.waitForSelector('.dialkit-panel[data-multiple="true"]');
  await page.evaluate(() => { window.openEvents = []; document.addEventListener('dialkit-open-change', event => window.openEvents.push(event.detail.open)); window.rootNode = document.querySelector('.dialkit-root:not(.dialkit-timeline)'); });
  await page.getByRole('button', { name: 'DialKit', exact: true }).click();
  assert.equal(await collapsed(), 'true');
  assert.deepEqual(await page.evaluate(() => window.openEvents), [false]);
  await setRoot({ position: 'top-left' });
  assert.equal(await page.locator('.dialkit-panel').getAttribute('data-position'), 'top-left');
  assert.equal(await collapsed(), 'true', 'the multi-panel shell stays collapsed across a position change');
  assert.equal(await page.evaluate(() => window.rootNode === document.querySelector('.dialkit-root:not(.dialkit-timeline)')), true);
  await setRoot({ defaultOpen: false });
  await setRoot({ defaultOpen: true });
  assert.equal(await collapsed(), 'true', 'changing default-open leaves a collapsed shell alone');
  await page.getByRole('button', { name: 'DialKit', exact: true }).click();
  assert.equal(await collapsed(), 'false');
  await setRoot({ defaultOpen: false });
  assert.equal(await collapsed(), 'false', 'changing default-open leaves an expanded shell alone');
  // A panel registered after the change initializes from the current default, and a later change does not reset it.
  await page.evaluate(() => { window.demo.app.remove(); window.stores.DialStore.unregisterPanel('second'); });
  assert.equal(await page.evaluate(() => window.stores.DialStore.getPanels().length), 0);
  await page.evaluate(() => window.stores.DialStore.registerPanel('fresh', 'Fresh panel', { speed: 1 }));
  await page.waitForSelector('.dialkit-panel-inner');
  assert.equal(await page.evaluate(() => window.stores.DialStore.getPanelOpen('fresh')), false);
  assert.equal(await collapsed(), 'true', 'a new sole panel starts from the current default');
  await setRoot({ defaultOpen: true });
  assert.equal(await collapsed(), 'true', 'an initialized panel keeps its state when the default changes');
  await page.evaluate(() => window.stores.DialStore.unregisterPanel('fresh'));
  // A timeline-only shell follows the same rules.
  await page.evaluate(() => window.stores.TimelineStore.register({ id: 'solo', name: 'Solo', duration: 1, loop: false, loopStart: 0, clips: [] }, { autoplay: false }));
  await page.waitForSelector('.dialkit-timeline-toolkit-only');
  await page.getByRole('button', { name: 'DialKit', exact: true }).click();
  assert.equal(await collapsed(), 'true');
  await setRoot({ position: 'bottom-left', defaultOpen: false });
  await setRoot({ defaultOpen: true });
  assert.equal(await collapsed(), 'true', 'the timeline-only shell stays collapsed across position and default changes');
  await page.evaluate(() => window.stores.TimelineStore.unregister('solo'));
  // Inline mode inside the component's shadow root adopts the styles and keeps popups working.
  await page.goto(url + '?inline'); await page.waitForFunction(() => window.demo && window.demo.app.hasUpdated);
  await page.evaluate(() => window.demo.kit.resetValues());
  const inline = page.locator('.dialkit-panel-inline');
  assert.equal(await inline.evaluate(el => el.getRootNode() === window.demo.app.shadowRoot), true);
  assert.equal(await page.evaluate(() => window.demo.app.shadowRoot.adoptedStyleSheets.length), 2, 'component styles plus the DialKit theme');
  assert.notEqual(await inline.evaluate(el => getComputedStyle(el).fontFamily), await app.evaluate(el => getComputedStyle(el).fontFamily));
  await page.getByRole('button', { name: 'Choice' }).click();
  await page.getByRole('option', { name: 'Right', exact: true }).click();
  assert.equal((await values()).choice, 'right');
  await page.getByRole('button', { name: 'Pick accent color' }).click();
  await page.getByRole('textbox', { name: 'CSS color', exact: true }).fill('oklch(0.7 0.1 200)');
  await page.keyboard.press('Enter');
  assert.equal((await values()).accent, 'oklch(0.7 0.1 200)');
  await page.keyboard.press('Escape');
  const inlineTyped = await values();
  await page.getByRole('textbox', { name: 'Title', exact: true }).click();
  await page.keyboard.type('more');
  assert.equal((await values()).radius, inlineTyped.radius);
  await app.locator('h1').click();
  await page.keyboard.down('r'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('r');
  assert.equal((await values()).radius, inlineTyped.radius + 1);
  // Inline roots render into the element itself, so a detached update must leave it empty too.
  await page.evaluate(async () => {
    const root = window.demo.app.shadowRoot.querySelector('dialkit-root');
    window.detachedRoot = root;
    root.remove();
    root.theme = 'light';
    await root.updateComplete;
  });
  assert.equal(await page.evaluate(() => window.detachedRoot.childElementCount), 0, 'a detached inline root must not rebuild its panel');
  await page.evaluate(async () => { window.demo.app.shadowRoot.querySelector('aside').append(window.detachedRoot); await window.detachedRoot.updateComplete; });
  assert.equal(await page.evaluate(() => window.detachedRoot.querySelectorAll('.dialkit-panel-inline').length), 1);
  await page.screenshot({ path: '/tmp/dialkit-lit-inline.png', fullPage: true });
  await page.evaluate(() => window.demo.app.remove());
  assert.equal(await page.locator('.dialkit-root').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
  // A nonce-based style policy: window.litNonce, set before any script runs, must reach the style elements DialKit
  // creates itself. The theme's Google Fonts import is allowed by host and the demo's own style attribute binding by
  // directive, so only inline <style> handling is under test.
  const nonce = 'dialkit-test-nonce';
  writeFileSync(join(directory, 'csp.html'), html.replace('<style>', `<meta http-equiv="Content-Security-Policy" content="style-src 'nonce-${nonce}' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'">\n  <script>window.litNonce = '${nonce}';</script>\n  <style nonce="${nonce}">`));
  const csp = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const cspErrors = [];
  csp.on('pageerror', error => cspErrors.push(error.message));
  csp.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') cspErrors.push(message.text()); });
  await csp.addInitScript(() => { window.violations = []; document.addEventListener('securitypolicyviolation', event => window.violations.push(`${event.violatedDirective} ${event.blockedURI}`)); });
  await csp.goto(pathToFileURL(join(directory, 'csp.html')).href);
  await csp.waitForFunction(() => window.demo && window.demo.app.hasUpdated);
  assert.deepEqual(await csp.locator('#dialkit-theme').evaluate(style => [style.nonce, style.sheet !== null && style.sheet.cssRules.length > 0]), [nonce, true], 'the injected theme carries the nonce and applies');
  assert.equal(await csp.locator('.dialkit-panel').evaluate(el => getComputedStyle(el).position), 'fixed', 'the panel is styled under the policy');
  assert.deepEqual(await csp.evaluate(() => window.violations), []);
  assert.deepEqual(cspErrors, []);
  await csp.close();
  console.log('Lit browser integration passed (controllers, elements, events, theme and position updates, shadow inline, timeline, persistence, cleanup, CSP nonce).');
} finally {
  await browser.close();
  rmSync(directory, { recursive: true, force: true });
}
