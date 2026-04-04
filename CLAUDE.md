# DialKit

## Build

- After editing styles in `src/styles/theme.css` or any component, run `npm run build` — the CSS is copied to `dist/styles.css` via tsup's `onSuccess` hook, not hot-reloaded.
- The example app (`example/`) imports `dialkit/styles.css` which resolves to `dist/styles.css`.
- After building, restart the example app dev server: `kill $(lsof -ti:3000) 2>/dev/null; cd example && npm run dev`
- You have permission to always run `npm run build` without asking.

## Style Rules

- Buttons in `ButtonGroup` must always stack vertically (never inline/row).
