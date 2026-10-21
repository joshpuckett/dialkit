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
    for (const kind of ["", "-timeline"]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/${framework}${kind}.html`);
      const trigger = page.getByRole("button", { name: /^Versions: / });
      const open = async () => {
        await trigger.press("ArrowDown");
        await page.getByRole("menu").waitFor();
      };
      const create = async () => {
        await open();
        await page
          .getByRole("menuitem", { name: "New version", exact: true })
          .press("Enter");
      };
      assert.equal(await trigger.isEnabled(), true);
      assert.equal(
        await page
          .getByRole("button", { name: "Add preset", exact: true })
          .count(),
        0,
      );
      await create();
      assert.equal((await trigger.innerText()).trim(), "Version 2");
      assert.equal(await trigger.getAttribute("aria-label"), "Versions: Version 2");
      assert.equal(await trigger.getAttribute("aria-expanded"), "false");
      if (!kind) {
        await page
          .getByRole("textbox", { name: "Title", exact: true })
          .fill("Saved");
        await open();
        await page
          .getByRole("menuitemradio", { name: "Version 1", exact: true })
          .press("Enter");
        assert.equal(
          await page
            .getByRole("textbox", { name: "Title", exact: true })
            .inputValue(),
          "Original",
        );
        await open();
        await page
          .getByRole("menuitemradio", { name: "Version 2", exact: true })
          .press("Enter");
        assert.equal(
          await page
            .getByRole("textbox", { name: "Title", exact: true })
            .inputValue(),
          "Saved",
        );
      }
      await create();
      assert.equal((await trigger.innerText()).trim(), "Version 3");
      await open();
      await page
        .getByRole("menuitem", { name: "Delete Version 2", exact: true })
        .press("Enter");
      await page
        .getByRole("menuitem", { name: "New version", exact: true })
        .press("Enter");
      assert.equal((await trigger.innerText()).trim(), "Version 4");
      await open();
      for (const name of ["Version 3", "Version 4"]) {
        await page
          .getByRole("menuitem", { name: `Delete ${name}`, exact: true })
          .press("Enter");
      }
      assert.equal(await trigger.isEnabled(), true);
      await page
        .getByRole("menuitem", { name: "New version", exact: true })
        .press("Enter");
      assert.equal((await trigger.innerText()).trim(), "Version 2");
      await open();
      await page
        .getByRole("menuitemradio", { name: "Version 2", exact: true })
        .press("Escape");
      assert.equal(await trigger.getAttribute("aria-expanded"), "false");
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
      );
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `${framework}${kind}: version lifecycle and keyboard checks passed`,
      );
    }
  }
  for (const framework of ["react", "solid", "vue", "svelte", "vanilla"]) {
    for (const layout of ["", "multiple"]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/${framework}.html?${layout}`);
      const panel = page.locator(".dialkit-panel");
      const toggle = page.locator(
        ".dialkit-folder-root > .dialkit-folder-header .dialkit-folder-header-top",
      );
      const focusInside = () =>
        page.waitForFunction(() =>
          document.querySelector(".dialkit-panel")?.contains(document.activeElement),
        );
      await toggle.waitFor();
      assert.equal(await toggle.count(), 1);
      assert.equal(await panel.getAttribute("role"), "region");
      assert.equal(await toggle.getAttribute("aria-label"), layout ? "DialKit" : "Fixture");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await toggle.getAttribute("aria-keyshortcuts"), "Control+.");
      const copy = page.getByRole("button", { name: "Copy parameters", exact: true });
      assert.equal(await copy.count(), layout ? 2 : 1);
      assert.equal(await copy.first().getAttribute("type"), "button");

      // Escape inside the numeric editor cancels the edit without closing the panel.
      const slider = panel.getByRole("slider").first();
      await slider.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.type("55");
      await page.keyboard.press("Escape");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "slider");

      await page.evaluate(() => {
        const outside = document.createElement("button");
        outside.textContent = "Outside";
        document.querySelector("h1").after(outside);
      });
      const outside = page.getByRole("button", { name: "Outside", exact: true });
      await outside.focus();
      await page.keyboard.press("Control+.");
      await focusInside();
      await page.keyboard.press("Escape");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await outside.evaluate((el) => el === document.activeElement), true);

      await page.keyboard.press("Control+.");
      await focusInside();
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Control+.");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await outside.evaluate((el) => el === document.activeElement), true);

      await page.waitForTimeout(600);
      await toggle.focus();
      const before = await panel.boundingBox();
      await page.keyboard.press("Alt+ArrowLeft");
      const moved = await panel.boundingBox();
      assert.equal(Math.round(moved.x), Math.round(before.x) - 10);
      assert.equal(Math.round(moved.y), Math.round(before.y));
      await page.keyboard.press("Alt+Shift+ArrowUp");
      assert.equal(Math.round((await panel.boundingBox()).y), 0);
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      await toggle.press("Enter");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`${framework} ${layout || "single"}: panel keyboard checks passed`);
    }

    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/${framework}.html?inline`);
    const header = page.locator(
      ".dialkit-folder-root > .dialkit-folder-header .dialkit-folder-header-top",
    );
    await header.waitFor();
    for (const name of ["role", "tabindex", "aria-label", "aria-expanded"]) {
      assert.equal(await header.getAttribute(name), null, `inline header ${name}`);
    }
    await page.keyboard.press("Control+.");
    await page.waitForFunction(() =>
      document.querySelector(".dialkit-panel")?.contains(document.activeElement),
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() =>
        document.querySelector(".dialkit-panel").contains(document.activeElement),
      ),
      true,
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${framework} inline: panel keyboard checks passed`);
  }
} finally {
  await browser.close();
}
