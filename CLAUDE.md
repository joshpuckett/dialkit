# DialKit

## Build

- Styles live in `src/styles/styles.css` and are copied to `dist/styles.css` via tsup's `publicDir`. Changes are picked up automatically during `npm run dev`.
- The example app (`example/photostack`) imports `dialkit/styles.css` which resolves to `dist/styles.css`.

## Style Rules

- Buttons in `ButtonGroup` must always stack vertically (never inline/row).
