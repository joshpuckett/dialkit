// Run npm run build, then node scripts/build-toolbar-fixtures.mjs.
// Serve .toolbar-fixtures on port 3011, or set DIALKIT_FIXTURE_URL.
// DIALKIT_PLAYWRIGHT can point to an existing Playwright installation.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.DIALKIT_PLAYWRIGHT || "playwright"
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.DIALKIT_FIXTURE_URL || "http://127.0.0.1:3011";
try {
  for (const framework of ["react", "solid", "vue", "svelte", "vanilla"]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/${framework}-timeline.html`);
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    const announced = async () => {
      await page.waitForTimeout(80);
      return page.evaluate(() => document.getElementById("dialkit-live-region")?.textContent);
    };

    const playhead = page.getByRole("slider", { name: "Timeline current time" });
    await playhead.focus();
    const value = () => playhead.getAttribute("aria-valuenow").then(Number);
    await playhead.press("Home");
    assert.equal(await value(), 0);
    await playhead.press("ArrowRight");
    assert.equal(await value(), 0.05);
    await playhead.press("Alt+ArrowRight");
    assert.equal(await value(), 0.06);
    await playhead.press("Shift+ArrowLeft");
    assert.equal(await value(), 0);
    await playhead.press("End");
    const duration = Number(await playhead.getAttribute("aria-valuemax"));
    assert.equal(await value(), duration);
    await playhead.press("ArrowLeft");
    assert.equal(
      await playhead.getAttribute("aria-valuetext"),
      `${(duration - 0.05).toFixed(2)} seconds of ${duration.toFixed(2)}`,
    );
    const width = await playhead.evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(width >= 24, `playhead hit area is ${width}px wide`);

    await playhead.press("Home");
    await playhead.press(" ");
    assert.equal(await announced(), "Playing");
    await playhead.press(" ");
    assert.match(await announced(), /^Paused at 0\.\d\d seconds$/);

    const clip = page.getByRole("button", { name: /^Enter, / });
    await clip.focus();
    assert.equal(await clip.getAttribute("aria-label"), "Enter, 0.00 to 0.50 seconds");
    await clip.press("Alt+ArrowLeft");
    assert.equal(await focused(), "Enter, 0.00 to 0.45 seconds");
    assert.equal(await announced(), "Enter 0.00 to 0.45 seconds");
    await clip.press("ArrowRight");
    assert.equal(await focused(), "Enter, 0.05 to 0.50 seconds");
    await clip.press("ArrowLeft");
    await clip.press("Alt+ArrowRight");
    assert.equal(await focused(), "Enter, 0.00 to 0.50 seconds");

    await clip.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Edit Enter" });
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelector(".dialkit-timeline-popover")?.contains(document.activeElement));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await focused(), "Enter, 0.00 to 0.50 seconds");

    await clip.press(" ");
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelector(".dialkit-timeline-popover")?.contains(document.activeElement));
    await page.keyboard.press("Shift+Tab");
    assert.equal(await focused(), "Close editor");
    await page.keyboard.press("Shift+Tab");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await focused(), "Enter, 0.00 to 0.50 seconds");

    const separator = page.getByRole("separator", { name: "Resize timeline height" });
    await separator.focus();
    const height = Number(await separator.getAttribute("aria-valuenow"));
    await separator.press("ArrowDown");
    assert.equal(Number(await separator.getAttribute("aria-valuenow")), height - 20);

    const chevron = page.getByRole("button", { name: "Collapse timeline" });
    assert.equal(await chevron.getAttribute("aria-expanded"), "true");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${framework}: timeline keyboard checks passed`);
  }
} finally {
  await browser.close();
}
