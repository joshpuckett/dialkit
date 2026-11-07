// Run after npm run build. Playwright is test tooling only, never an adapter dependency.
// DIALKIT_PLAYWRIGHT may point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.DIALKIT_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
const remoteRequests = [];
page.on('request', request => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
page.on('pageerror', error => errors.push(error.message));
// This suite drives the classic version menu.
const url = pathToFileURL(resolve('examples/vanilla/index.html')).href + '?versions=menu';
try {
  await page.goto(url);
  await page.waitForFunction(() => window.demo);
  const values = () => page.evaluate(() => window.demo.kit.values);
  await page.getByRole('slider', { name: 'Radius', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await values()).radius, 25);
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Radius value' }).fill('42');
  await page.keyboard.press('Enter');
  assert.equal((await values()).radius, 42);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A\nmultiline title');
  assert.equal((await values()).title, 'A\nmultiline title');
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  assert.equal((await values()).visible, false);
  await page.getByRole('button', { name: 'Choice' }).click();
  await page.getByRole('option', { name: 'Left', exact: true }).click();
  assert.equal((await values()).choice, 'left');
  await page.getByRole('group', { name: /^Position:/ }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await values()).position.x, .01);
  await page.getByRole('button', { name: 'Pick accent color' }).click();
  await page.getByRole('textbox', { name: 'CSS color', exact: true }).fill('oklch(0.65 0.18 285 / 0.6)');
  await page.keyboard.press('Enter');
  assert.equal((await values()).accent, 'oklch(0.65 0.18 285 / 0.6)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Choose cover image/ }).click();
  await page.getByRole('button', { name: 'Coral', exact: true }).click();
  assert.ok((await values()).cover.startsWith('data:image/'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Motion', exact: true }).click();
  await page.getByRole('radio', { name: 'Physics', exact: true }).first().click();
  await page.getByRole('slider', { name: 'Stiffness', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await values()).motion.spring.stiffness, 201);
  await page.getByRole('radio', { name: 'Time', exact: true }).first().click();
  assert.equal((await values()).motion.spring.visualDuration, .3);
  await page.getByRole('button', { name: /^Bézier handle 1:/ }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await values()).motion.transition.ease[0], .26);
  await page.getByRole('radio', { name: 'Time', exact: true }).nth(1).click();
  await page.getByRole('radio', { name: 'Easing', exact: true }).nth(1).click();
  assert.equal((await values()).motion.transition.ease[0], .26);
  await page.getByRole('button', { name: 'Motion', exact: true }).click();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  assert.equal(await page.getByRole('status', { name: 'Last action' }).textContent(), 'actions.replay');
  await page.evaluate(() => window.demo.timeline.pause());
  // Edits made before saving go with the new version, and the version they
  // were made on keeps what it held. After that, each version keeps its own.
  await page.getByRole('button', { name: 'Versions', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'New version', exact: true }).click();
  await page.evaluate(() => window.demo.kit.setValue('radius', 50));
  await page.getByRole('button', { name: 'Versions', exact: true }).first().click();
  await page.getByRole('menuitemradio', { name: 'V1', exact: true }).click();
  assert.equal((await values()).radius, 24);
  await page.getByRole('button', { name: 'Versions', exact: true }).first().click();
  await page.getByRole('menuitemradio', { name: 'V2', exact: true }).click();
  assert.equal((await values()).radius, 50);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  assert.equal(await page.locator('.dialkit-panel-inner').getAttribute('data-collapsed'), 'true');
  await page.getByRole('button', { name: 'Open panel', exact: true }).click();
  await page.locator('h1').click();
  await page.keyboard.down('r'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('r');
  assert.equal((await values()).radius, 51);
  // No double keyboard handling with two roots.
  await page.evaluate(() => { window.extraRoot = DialKit.createDialRoot({ position: 'top-left', versions: 'menu' }); });
  await page.keyboard.down('r'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('r');
  assert.equal((await values()).radius, 52);
  await page.evaluate(() => window.extraRoot.destroy());
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  // Moving the collapsed panel must not turn the drag's release into a click.
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  const bubble = page.locator('.dialkit-panel-inner');
  await page.waitForFunction(() => document.querySelector('.dialkit-panel-inner').getAnimations().length === 0);
  const bubbleBox = await bubble.boundingBox();
  await page.mouse.move(bubbleBox.x + 21, bubbleBox.y + 21); await page.mouse.down(); await page.mouse.move(80, 120, { steps: 8 }); await page.mouse.up();
  assert.equal(await bubble.getAttribute('data-collapsed'), 'true');
  assert.ok((await page.locator('.dialkit-panel').boundingBox()).x < 100);
  await bubble.click();
  assert.equal(await bubble.getAttribute('data-collapsed'), 'false');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Open panel', exact: true }).click();
  // Return the panel to its original corner before using the canvas.
  await page.evaluate(() => { window.demo.root.destroy(); window.demo.root = DialKit.createDialRoot({ theme: 'dark', versions: 'menu' }); });
  // Timeline transport, clip editing, dragging, and resizing use the same store.
  const ruler = await page.locator('.dialkit-timeline-ruler').boundingBox();
  await page.mouse.click(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2);
  assert.ok(Math.abs(await page.evaluate(() => window.demo.timeline.values.time) - 2) < .02);
  await page.getByRole('button', { name: 'Edit Move', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit Move', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  let bar = await page.getByRole('button', { name: 'Edit Move', exact: true }).boundingBox();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2); await page.mouse.down(); await page.mouse.move(bar.x + bar.width / 2 + 40, bar.y + bar.height / 2, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => window.demo.timeline.values.card.move.at) > .5);
  const handle = page.getByRole('button', { name: 'Edit Move', exact: true }).locator('[data-edge="end"]');
  const edge = await handle.boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2); await page.mouse.down(); await page.mouse.move(edge.x + edge.width / 2 - 35, edge.y + edge.height / 2, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => window.demo.timeline.values.card.move.duration) < 2);
  await page.getByRole('button', { name: 'Collapse timeline', exact: true }).click();
  await page.getByRole('button', { name: 'Expand timeline', exact: true }).click();
  // Sequence boundaries and independent property tracks remain editable.
  const pulse = page.getByRole('button', { name: 'Edit Pulse', exact: true });
  const boundary = await pulse.locator('[data-boundary="0"]').boundingBox();
  await page.mouse.move(boundary.x + 2, boundary.y + boundary.height / 2); await page.mouse.down(); await page.mouse.move(boundary.x + 32, boundary.y + boundary.height / 2, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => DialKit.DialStore.getValue(window.demo.timeline.id, 'card.pulse.step1.duration')) > 1);
  await pulse.locator('[data-step="step1"]').click();
  await page.getByRole('dialog', { name: /Edit Pulse/ }).waitFor();
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.evaluate(() => { window.trackTimeline = DialKit.createDialTimeline('Tracks', { duration: 5, float: { at: 0, loop: true, props: { y: { from: -9, to: 9, duration: 1 }, scale: { from: .9, to: 1.1, duration: 2 } } } }, { autoplay: false }); });
  await page.getByRole('button', { name: 'Edit Float', exact: true }).click();
  const track = page.getByRole('button', { name: 'Edit Float · Y', exact: true });
  const trackBox = await track.boundingBox();
  await page.mouse.move(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height / 2); await page.mouse.down(); await page.mouse.move(trackBox.x + trackBox.width / 2 + 40, trackBox.y + trackBox.height / 2, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => DialKit.DialStore.getValue(window.trackTimeline.id, 'float.y.delay')) > 0);
  assert.ok(await page.locator('.dialkit-timeline-clip-ghost').count() > 0);
  await page.evaluate(() => window.trackTimeline.destroy());
  // Zoom and reset work without changing the timeline values.
  // Start beside the playhead: as in every adapter, a press on its flag scrubs.
  await page.keyboard.down('Alt');
  await page.mouse.move(ruler.x + ruler.width * 0.75, ruler.y + ruler.height / 2); await page.mouse.down(); await page.mouse.move(ruler.x + ruler.width * 0.75 + 100, ruler.y + ruler.height / 2, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  assert.equal(await page.locator('.dialkit-timeline-horizontal-scroll').isVisible(), true);
  await page.keyboard.down('Shift'); await page.mouse.click(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2); await page.keyboard.up('Shift');
  assert.equal(await page.locator('.dialkit-timeline-horizontal-scroll').isVisible(), false);
  await page.evaluate(() => window.demo.dock.setVisible(false));
  assert.equal(await page.locator('.dialkit-timeline').isVisible(), false);
  await page.getByRole('button', { name: 'Toggle timeline', exact: true }).click();
  assert.equal(await page.locator('.dialkit-timeline').isVisible(), true);
  // Persistence and fresh mount use the same public value shape.
  await page.reload(); await page.waitForFunction(() => window.demo);
  assert.equal((await values()).radius, 52);
  await page.screenshot({ path: '/tmp/dialkit-vanilla.png' });
  await page.evaluate(() => { Object.values(window.demo).forEach(value => value.destroy()); });
  assert.equal(await page.locator('.dialkit-root').count(), 0);
  assert.equal(await page.evaluate(() => DialKit.DialStore.getPanels().length + DialKit.TimelineStore.getTimelines().length), 0);
  await page.keyboard.down('r'); await page.mouse.wheel(0, -100); await page.keyboard.up('r');
  // Root membership and inline/light rendering tolerate dynamic registration.
  await page.goto(url + '&inline&theme=light'); await page.waitForFunction(() => window.demo);
  await page.evaluate(() => { window.second = DialKit.createDialKit('Second', { speed: 1 }); });
  assert.equal(await page.locator('.dialkit-panel').getAttribute('data-multiple'), 'true');
  await page.getByRole('button', { name: 'Second', exact: true }).click();
  await page.evaluate(() => window.second.setOpen(true));
  assert.equal(await page.getByRole('slider', { name: 'Speed', exact: true }).isVisible(), true);
  await page.evaluate(() => window.second.destroy());
  assert.equal(await page.locator('.dialkit-panel-inline').count(), 1);
  await page.screenshot({ path: '/tmp/dialkit-vanilla-inline.png', fullPage: true });
  await page.evaluate(() => Object.values(window.demo).forEach(value => value.destroy()));
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
  console.log('Vanilla browser integration passed (controls, presets, shortcuts, timeline, persistence, cleanup).');
} finally { await browser.close(); }
