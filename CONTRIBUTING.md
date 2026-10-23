# Contributing to DialKit

Thanks for contributing.

## Development setup

1. Fork and clone the repo.
2. Install dependencies with `npm i`.
3. Run `npm run typecheck` and `npm run build` before opening a PR.

## Toolbar browser checks

After `npm run build`, run `node scripts/build-toolbar-fixtures.mjs` and serve `.toolbar-fixtures` on port 3011 (for example, `python3 -m http.server 3011 --directory .toolbar-fixtures`). The fixtures cover panels and timelines in all five frameworks; append `?theme=dark` to inspect dark mode.

With Playwright and Chrome installed, run `node scripts/test-toolbar-browser.mjs` to check version creation, selection, deletion, numbering, and keyboard focus. `DIALKIT_PLAYWRIGHT` can point to an existing Playwright installation, and `DIALKIT_FIXTURE_URL` overrides the server URL.

For sticky headers, run `node scripts/build-control-fixtures.mjs` and open `/control-fixtures/react.html?multiple&scroll` in the example app (or use `solid`, `vue`, `svelte`, or `vanilla`). Open the panel, then scroll through both sections: the root header stays visible, each section's title and toolbar pin below it, and the next section pushes the previous one away. Ordinary property folders scroll normally. Append `&inline` to check an embedded panel in the page's scroll area, and `&shadow` to mount the app inside an open shadow root.

Collapse the second section, scroll the first to its top, then collapse it. The version/copy toolbar should fold with the properties, and the visible panel should start shrinking on the same frame, even when its contents exceed the viewport. The bottom edge stays fixed by default; append `&position=top-right` to check that the top edge stays fixed instead. Controls remain opaque and the title rows remain visible, with no empty intermediate panel.

Also collapse both sections while scrolled down, reverse a collapse before it finishes, and toggle the other section during a collapse. Each transition should continue from its current size and settle without a delayed scroll reset.

## Project notes

- `src/styles/theme.css` is copied to `dist/styles.css` during build via `tsup` `onSuccess`.
- `example/photostack` imports `dialkit/styles.css`, which resolves to `dist/styles.css`.
- `ButtonGroup` actions should remain vertically stacked.

## Pull request guidelines

- Keep PRs single-responsibility and small.
- Include a short summary of what changed and why.
- Add validation notes (for example: `npm run typecheck`, `npm run build`).
- Update `README.md` when behavior or API docs change.
