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
const url = pathToFileURL(resolve('examples/vanilla/index.html')).href;
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
  // Presets keep their edits while the base version remains independent.
  await page.getByRole('button', { name: 'Versions', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'New version', exact: true }).click();
  await page.evaluate(() => window.demo.kit.setValue('radius', 50));
  await page.getByRole('button', { name: 'Versions', exact: true }).first().click();
  await page.getByRole('menuitemradio', { name: 'Version 1', exact: true }).click();
  assert.equal((await values()).radius, 42);
  await page.getByRole('button', { name: 'Versions', exact: true }).first().click();
  await page.getByRole('menuitemradio', { name: 'Version 2', exact: true }).click();
  assert.equal((await values()).radius, 50);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  assert.equal(await page.locator('.dialkit-panel-inner').getAttribute('data-collapsed'), 'true');
  await page.getByRole('button', { name: 'Open panel', exact: true }).click();
  // Settings update in place without rebuilding the panel.
  await page.evaluate(() => window.demo.root.update({ position: 'top-left', theme: 'light' }));
  assert.deepEqual(await page.locator('.dialkit-panel').evaluate(el => [el.dataset.position, el.parentElement.dataset.theme]), ['top-left', 'light']);
  await page.evaluate(() => window.demo.root.update({ position: 'top-right', theme: 'dark' }));
  await page.locator('h1').click();
  await page.keyboard.down('r'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('r');
  assert.equal((await values()).radius, 51);
  // No double keyboard handling with two roots.
  await page.evaluate(() => { window.extraRoot = DialKit.createDialRoot({ position: 'top-left' }); });
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
  await page.evaluate(() => { window.demo.root.destroy(); window.demo.root = DialKit.createDialRoot({ theme: 'dark' }); });
  // Timeline transport, clip editing, dragging, and resizing use the same store.
  const ruler = await page.locator('.dialkit-timeline-ruler').boundingBox();
  await page.mouse.click(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2);
  assert.ok(Math.abs(await page.evaluate(() => window.demo.timeline.values.time) - 2) < .02);
  await page.getByRole('button', { name: 'Edit Move', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit Move', exact: true }).waitFor();
  const editorAbovePanel = () => page.getByRole('dialog', { name: 'Edit Move', exact: true }).evaluate(popup => {
    const tree = popup.getRootNode();
    const panel = tree.querySelector('.dialkit-panel');
    const previous = panel.getAttribute('style');
    const rect = popup.getBoundingClientRect();
    try {
      Object.assign(panel.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, right: 'auto', bottom: 'auto' });
      return popup.contains(tree.elementFromPoint(rect.left + 30, rect.top + 30));
    } finally {
      if (previous === null) panel.removeAttribute('style');
      else panel.setAttribute('style', previous);
    }
  });
  assert.equal(await editorAbovePanel(), true, 'clip editor must receive clicks above an overlapping panel');
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
  // Expanding re-measures the lanes and rebuilds the clips on the following frame; measure after that render.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
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
  await page.keyboard.down('Alt');
  await page.mouse.move(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2); await page.mouse.down(); await page.mouse.move(ruler.x + ruler.width / 2 + 100, ruler.y + ruler.height / 2, { steps: 5 }); await page.mouse.up();
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
  await page.goto(url + '?inline&theme=light'); await page.waitForFunction(() => window.demo);
  await page.evaluate(() => { window.second = DialKit.createDialKit('Second', { speed: 1 }); });
  assert.equal(await page.locator('.dialkit-panel').getAttribute('data-multiple'), 'true');
  await page.getByRole('button', { name: 'Second', exact: true }).click();
  await page.evaluate(() => window.second.setOpen(true));
  assert.equal(await page.getByRole('slider', { name: 'Speed', exact: true }).isVisible(), true);
  await page.evaluate(() => window.second.destroy());
  assert.equal(await page.locator('.dialkit-panel-inline').count(), 1);
  await page.screenshot({ path: '/tmp/dialkit-vanilla-inline.png', fullPage: true });
  await page.evaluate(() => Object.values(window.demo).forEach(value => value.destroy()));
  // Shadow DOM: listeners on document see retargeted events and the shadow host as the active element,
  // so the shared helpers must resolve both across the boundary for inline roots to match light DOM.
  // The stylesheet inside the shadow root loads after the page script has finished.
  const shadowStyles = () => page.waitForFunction(() => window.demoShadow.querySelector('link').sheet !== null);
  await page.goto(url + '?inline&shadow&theme=dark'); await page.waitForFunction(() => window.demo); await shadowStyles();
  await page.evaluate(() => window.demo.kit.resetValues());
  const inShadow = locator => locator.evaluate(el => window.demoShadow.contains(el));
  assert.equal(await inShadow(page.locator('.dialkit-panel-inline')), true);
  // Menus: pointer selection, keyboard navigation, and focus returning to the trigger.
  const choice = page.getByRole('button', { name: 'Choice' });
  await choice.click();
  await page.getByRole('option', { name: 'Left', exact: true }).click();
  assert.equal((await values()).choice, 'left');
  await choice.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.demoShadow.activeElement?.getAttribute('role') === 'option');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal((await values()).choice, 'right');
  assert.equal(await choice.evaluate(el => el.getRootNode().activeElement === el), true);
  // Colour popover: clicks and Tab inside it keep it open; typing still commits.
  await page.getByRole('button', { name: 'Pick accent color' }).click();
  const picker = page.getByRole('dialog', { name: 'Accent color picker', exact: true });
  await picker.getByRole('radio', { name: 'OKLCH', exact: true }).click();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.dialkit-color-control[data-open="true"]').count(), 1);
  await picker.getByRole('textbox', { name: 'CSS color', exact: true }).fill('oklch(0.7 0.1 200)');
  await page.keyboard.press('Enter');
  assert.equal((await values()).accent, 'oklch(0.7 0.1 200)');
  await page.keyboard.press('Escape');
  // Image popover: clicks inside it register instead of closing it.
  await page.getByRole('button', { name: /^Choose cover image/ }).click();
  await page.getByRole('button', { name: 'Remove cover image', exact: true }).click();
  assert.equal((await values()).cover, '');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Choose cover image/ }).click();
  await page.getByRole('button', { name: 'Coral', exact: true }).click();
  assert.ok((await values()).cover.startsWith('data:image/'));
  await page.keyboard.press('Escape');
  // Shortcuts stay quiet while typing inside the shadow root and resume afterwards.
  const typed = await values();
  await page.getByRole('textbox', { name: 'Title', exact: true }).click();
  await page.keyboard.type('very');
  assert.equal((await values()).visible, typed.visible);
  assert.equal((await values()).radius, typed.radius);
  assert.ok((await values()).title.includes('very'));
  await page.locator('h1').click();
  await page.keyboard.down('r'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('r');
  assert.equal((await values()).radius, typed.radius + 1);
  // Store updates leave a field that is being edited alone.
  const axis = page.getByRole('spinbutton', { name: 'Position X', exact: true });
  await axis.click();
  await page.keyboard.type('0.5');
  await page.evaluate(() => window.demo.kit.setValue('scale', 1.2));
  assert.equal(await axis.inputValue(), '0.5');
  await page.keyboard.press('Enter');
  assert.equal((await values()).position.x, .5);
  // Timeline clip editor: portaled inside the owning shadow tree, styled, and open for inner clicks.
  await page.getByRole('button', { name: 'Edit Move', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Move', exact: true });
  await editor.waitFor();
  assert.equal(await inShadow(editor), true);
  assert.notEqual(await editor.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await editor.locator('.dialkit-timeline-popover-title').click();
  assert.equal(await editor.isVisible(), true);
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  assert.equal(await editor.count(), 0);
  // A transformed host is the containing block for fixed descendants, so the editor must render in the top layer for
  // its viewport coordinates to hold while the shadow tree keeps styling it; an outside click still dismisses it.
  await page.evaluate(() => { window.demoShadow.host.style.transform = 'translate(140px, 130px)'; });
  await page.getByRole('button', { name: 'Edit Move', exact: true }).click();
  await editor.waitFor();
  assert.deepEqual(await editor.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return [rect.left - parseFloat(el.style.left), rect.top - parseFloat(el.style.top), window.demoShadow.contains(el), getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'];
  }), [0, 0, true, true], 'clip editor must keep viewport coordinates under a transformed shadow host');
  // The viewport corner is outside both the editor and the clip, and the heading has scrolled out of view.
  await page.mouse.click(2, 2);
  assert.equal(await editor.count(), 0);
  await page.evaluate(() => { window.demoShadow.host.style.transform = ''; });
  await page.screenshot({ path: '/tmp/dialkit-vanilla-shadow.png', fullPage: true });
  await page.evaluate(() => Object.values(window.demo).forEach(value => value.destroy()));
  assert.equal(await page.locator('.dialkit-root').count(), 0);
  // Focus-only departures must dismiss popups without relying on pointerdown. Cover
  // document focus, local shadow focus, and focus into an enclosing shadow tree.
  for (const mode of ['light', 'shadow', 'nested']) {
    await page.goto(url + (mode === 'light' ? '?theme=dark' : '?shadow&theme=dark'));
    await page.waitForFunction(() => window.demo);
    if (mode !== 'light') await shadowStyles();
    if (mode === 'nested') await page.evaluate(() => {
      const outer = document.createElement('div');
      document.querySelector('main').append(outer);
      const tree = outer.attachShadow({ mode: 'open' });
      const sibling = document.createElement('button');
      sibling.textContent = 'Outer shadow focus target';
      tree.append(window.demoShadow.host, sibling);
    });
    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    for (const destination of [title, page.getByRole('button', { name: 'Open panel', exact: true }),
      ...(mode === 'nested' ? [page.getByRole('button', { name: 'Outer shadow focus target', exact: true })] : [])]) {
      await page.getByRole('button', { name: 'Pick accent color' }).click();
      const picker = page.getByRole('dialog', { name: 'Accent color picker', exact: true });
      await picker.getByRole('textbox', { name: 'CSS color', exact: true }).focus();
      assert.equal(await picker.count(), 1);
      await destination.focus();
      assert.equal(await picker.count(), 0, `${mode}: color picker must close on focus departure`);

      await page.getByRole('button', { name: /^Choose cover image/ }).click();
      await page.getByRole('button', { name: 'Coral', exact: true }).focus();
      assert.equal(await page.locator('.dialkit-image-popover').count(), 1);
      await destination.focus();
      assert.equal(await page.locator('.dialkit-image-popover').count(), 0, `${mode}: image picker must close on focus departure`);

      await page.getByRole('button', { name: 'Choice' }).click();
      await page.waitForFunction(() => (window.demoShadow ?? document).activeElement?.getAttribute('role') === 'option');
      await destination.focus();
      assert.equal(await page.getByRole('listbox').count(), 0, `${mode}: select must close on focus departure`);
    }
    await page.getByRole('button', { name: 'Edit Move', exact: true }).click();
    await page.getByRole('dialog', { name: 'Edit Move', exact: true }).waitFor();
    assert.equal(await editorAbovePanel(), true, `${mode}: clip editor must stay above the panel`);
    await page.evaluate(() => Object.values(window.demo).forEach(value => value.destroy()));
    assert.equal(await page.locator('.dialkit-root').count(), 0);
  }
  // Closed shadow roots hide their nodes from document listeners, so outside-click detection cannot see
  // into them; guards that resolve focus from an owned element still work there.
  await page.goto(url + '?inline&shadow=closed&theme=dark'); await page.waitForFunction(() => window.demo); await shadowStyles();
  await page.evaluate(() => { window.demo.kit.resetValues(); window.demoShadow.querySelector('.dialkit-pad-value').focus(); });
  await page.keyboard.type('0.5');
  await page.evaluate(() => window.demo.kit.setValue('scale', 1.2));
  assert.equal(await page.evaluate(() => window.demoShadow.querySelector('.dialkit-pad-value').value), '0.5');
  await page.keyboard.press('Enter');
  assert.equal((await values()).position.x, .5);
  await page.evaluate(() => Object.values(window.demo).forEach(value => value.destroy()));
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
  console.log('Vanilla browser integration passed (controls, presets, shortcuts, timeline, persistence, cleanup, shadow DOM).');
} finally { await browser.close(); }
