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
  for (const framework of ["react", "solid", "vue", "svelte", "lit", "vanilla"]) {
    for (const kind of ["", "-timeline"]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/${framework}${kind}.html`);
      const trigger = page.getByRole("button", {
        name: "Versions",
        exact: true,
      });
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
} finally {
  await browser.close();
}
