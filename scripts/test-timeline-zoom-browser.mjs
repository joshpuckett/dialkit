// Run npm run build, then node scripts/build-toolbar-fixtures.mjs.
// Serve .toolbar-fixtures on port 3011, or set DIALKIT_FIXTURE_URL.
// DIALKIT_PLAYWRIGHT can point to an existing Playwright installation.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.DIALKIT_PLAYWRIGHT || "playwright"
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.DIALKIT_FIXTURE_URL || "http://127.0.0.1:3011";

// Dispatches a cancelable wheel over the timeline. A passive listener can't
// cancel it, so defaultPrevented shows whether the dock blocked scrolling.
function wheel(page, ratio, init) {
  return page.evaluate(
    ({ ratio, init }) => {
      const ruler = document.querySelector(".dialkit-timeline-ruler");
      const rect = ruler.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width * ratio,
        clientY: rect.top + rect.height / 2,
        ...init,
      });
      ruler.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { ratio, init },
  );
}

// The horizontal scroller mirrors the view: its content is laneWidth * zoom
// wide and scrollLeft is viewStart in pixels. It's hidden or removed at 1x.
const SCROLLER = ".dialkit-timeline-horizontal-scroll";

function view(page) {
  return page.evaluate((selector) => {
    const scroller = document.querySelector(selector);
    if (!scroller || scroller.clientWidth === 0) return { zoom: 1, start: 0 };
    const width = scroller.firstElementChild.getBoundingClientRect().width;
    return {
      zoom: width / scroller.clientWidth,
      start: scroller.scrollLeft / width,
    };
  }, SCROLLER);
}

try {
  for (const framework of ["react", "solid", "vue", "svelte", "vanilla"]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/${framework}-timeline.html`);
    await page.locator(".dialkit-timeline-ruler").waitFor();
    assert.match(
      await page.locator(".dialkit-timeline-ruler").getAttribute("title"),
      /Cmd-scroll to zoom/,
    );

    // Plain vertical wheel while unzoomed is left to the page.
    assert.equal(await wheel(page, 0.5, { deltaY: 100 }), false);
    assert.equal((await view(page)).zoom, 1);

    // Cmd + scroll down zooms in around the pointer.
    const ratio = 0.75;
    assert.equal(await wheel(page, ratio, { deltaY: 240, metaKey: true }), true);
    await page.waitForFunction((selector) => {
      const scroller = document.querySelector(selector);
      return scroller && scroller.clientWidth > 0 && scroller.scrollLeft > 0;
    }, SCROLLER);
    const zoomed = await view(page);
    assert.ok(Math.abs(zoomed.zoom - Math.E) < 0.02, `zoom ${zoomed.zoom}`);
    // The time under the pointer (75% of the timeline) stays put.
    const anchor = zoomed.start + ratio / zoomed.zoom;
    assert.ok(Math.abs(anchor - ratio) < 0.01, `anchor ${anchor}`);

    // Shift + scroll still pans the zoomed view.
    assert.equal(await wheel(page, 0.5, { deltaY: -40, shiftKey: true }), true);
    await page.waitForFunction(
      ({ selector, start }) => {
        const scroller = document.querySelector(selector);
        const width = scroller.firstElementChild.getBoundingClientRect().width;
        return scroller.scrollLeft / width < start - 0.001;
      },
      { selector: SCROLLER, start: zoomed.start },
    );
    assert.ok(Math.abs((await view(page)).zoom - zoomed.zoom) < 0.001);

    // Ctrl + scroll up zooms back out to the full range.
    assert.equal(
      await wheel(page, 0.2, { deltaY: -2000, ctrlKey: true }),
      true,
    );
    await page.locator(SCROLLER).waitFor({ state: "hidden" });

    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${framework}: Cmd/Ctrl-scroll timeline zoom checks passed`);
  }
} finally {
  await browser.close();
}
