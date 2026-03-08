# dialkit

Real-time parameter tweaking for React, Solid, and Svelte.

## Quick Start

```bash
npm install dialkit motion
```

```tsx
// layout.tsx
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
        <DialRoot />
      </body>
    </html>
  );
}
```

```tsx
// component.tsx
import { useDialKit } from 'dialkit';

function Card() {
  const p = useDialKit('Card', {
    blur: [24, 0, 100],
    scale: 1.2,
    color: '#ff5500',
    visible: true,
  });

  return (
    <div style={{
      filter: `blur(${p.blur}px)`,
      transform: `scale(${p.scale})`,
      color: p.color,
      opacity: p.visible ? 1 : 0,
    }}>
      ...
    </div>
  );
}
```

---

## useDialKit

```tsx
const params = useDialKit(name, config, options?)
```

| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Panel title displayed in the UI |
| `config` | `DialConfig` | Parameter definitions (see Control Types below) |
| `options.onAction` | `(path: string) => void` | Callback when action buttons are clicked |

Returns a fully typed object matching your config shape with live values. Updating a control in the UI immediately updates the returned values.

---

## Control Types

### Slider

Numbers create sliders. There are three ways to define them:

**Explicit range** — `[default, min, max]`:
```tsx
blur: [24, 0, 100]
```

**Explicit range + step** — `[default, min, max, step]`:
```tsx
blur: [24, 0, 100, 5]    // snaps in increments of 5
```
When `step` is omitted, it's inferred from the range (see table below).

**Auto-inferred** — bare number:
```tsx
scale: 1.2
```
A single number auto-infers a reasonable min, max, and step:

| Value range | Inferred min/max | Step |
|-------------|-----------------|------|
| 0–1 | 0 to 1 | 0.01 |
| 0–10 | 0 to value &times; 3 | 0.1 |
| 0–100 | 0 to value &times; 3 | 1 |
| 100+ | 0 to value &times; 3 | 10 |

**Returns:** `number`

Sliders support click-to-snap (with spring animation), drag with rubber-band overflow, and direct text editing (hover the value for 800ms, then click to type).

### Toggle

```tsx
enabled: true
darkMode: false
```

Booleans create an Off/On segmented control.

**Returns:** `boolean`

### Text

```tsx
title: 'Hello'                                    // auto-detected from string
subtitle: { type: 'text', default: '', placeholder: 'Enter subtitle...' }
```

Non-hex strings are auto-detected as text inputs. Use the explicit form for a placeholder or to set a default.

**Returns:** `string`

### Color

```tsx
color: '#ff5500'                           // auto-detected from hex string
bg: { type: 'color', default: '#000' }     // explicit
```

Hex strings (`#RGB`, `#RRGGBB`, `#RRGGBBAA`) are auto-detected as color pickers. Each color control has a text display (click to edit the hex value), and a swatch button that opens the native color picker.

**Returns:** `string` (hex color)

### Select

```tsx
layout: {
  type: 'select',
  options: ['stack', 'fan', 'grid'],
  default: 'stack',
}
```

Options can be plain strings or `{ value, label }` objects for custom display text:

```tsx
shape: {
  type: 'select',
  options: [
    { value: 'portrait', label: 'Portrait' },
    { value: 'square', label: 'Square' },
    { value: 'landscape', label: 'Landscape' },
  ],
  default: 'portrait',
}
```

If `default` is omitted, the first option is selected.

**Returns:** `string` (the selected option's value)

### Spring

```tsx
// Time-based (simple mode)
spring: { type: 'spring', visualDuration: 0.3, bounce: 0.2 }

// Physics-based (advanced mode)
spring: { type: 'spring', stiffness: 200, damping: 25, mass: 1 }
```

Creates a visual spring editor with a live animation curve preview. The editor supports two modes, toggled in the UI:

- **Time** (simple) — `visualDuration` (0.1–1s) and `bounce` (0–1). Ideal for most animations.
- **Physics** (advanced) — `stiffness` (1–1000), `damping` (1–100), and `mass` (0.1–10). Full control over spring dynamics.

The returned config object is passed directly to Motion's `transition` prop:

```tsx
const p = useDialKit('Card', {
  spring: { type: 'spring', visualDuration: 0.5, bounce: 0.04 },
  x: [0, -200, 200],
});

<motion.div animate={{ x: p.x }} transition={p.spring} />
```

**Returns:** `SpringConfig` (pass directly to Motion)

### Action

```tsx
const p = useDialKit('Controls', {
  shuffle: { type: 'action' },
  reset: { type: 'action', label: 'Reset All' },
}, {
  onAction: (path) => {
    if (path === 'shuffle') shuffleItems();
    if (path === 'reset') resetToDefaults();
  },
});
```

Action buttons trigger callbacks without storing any value. The `label` defaults to the formatted key name (camelCase becomes Title Case). Multiple adjacent actions are grouped vertically.
Action buttons can be placed at the root or nested inside folders.

### Folder

Any nested plain object becomes a collapsible folder. Folders can nest arbitrarily deep.

```tsx
shadow: {
  blur: [10, 0, 50],
  opacity: [0.25, 0, 1],
  color: '#000000',
}

// Access nested values:
params.shadow.blur     // number
params.shadow.color    // string
```

Folders are open by default. Add `_collapsed: true` to start a folder closed. This is a reserved metadata key — it controls the UI only and won't appear in your returned values.

```tsx
shadow: {
  _collapsed: true,    // folder starts closed
  blur: [10, 0, 50],
  opacity: [0.25, 0, 1],
}
```

DialKit also supports dynamic config updates. If your config shape, defaults, options, or labels change over time, the panel updates while preserving current values where paths still exist.

Dynamic configs work with both inline objects and memoized configs — no special consumer action needed:

```tsx
const values = useDialKit('Controls', {
  style: { type: 'select', options: dynamicOptions },
});
```

---

## DialRoot

```tsx
<DialRoot position="top-right" />
```

| Prop | Type | Default |
|------|------|---------|
| `position` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` |
| `defaultOpen` | `boolean` | `true` |
| `mode` | `'popover' \| 'inline'` | `'popover'` |

Mount once at your app root. In the default `popover` mode, the panel renders via a portal on `document.body`. It collapses to a small icon button and expands to 280px wide on click.

### Inline mode

Use `mode="inline"` to render DialKit directly in your layout instead of as a floating popover. The panel fills its container and scrolls internally, which is useful for embedding in a sidebar or resizable panel. Inline mode works across all frameworks:

**React:**
```tsx
<aside style={{ width: 300, height: '100vh', overflow: 'hidden' }}>
  <DialRoot mode="inline" />
</aside>
```

**Solid:**
```tsx
<aside style={{ width: '300px', height: '100vh', overflow: 'hidden' }}>
  <DialRoot mode="inline" />
</aside>
```

**Svelte:**
```svelte
<aside style:width="300px" style:height="100vh" style:overflow="hidden">
  <DialRoot mode="inline" />
</aside>
```

In inline mode, the `position` prop is ignored and the collapse-to-icon behavior is disabled.

---

## Panel Toolbar

When the panel is open, the toolbar provides:

- **Presets** — A version dropdown for saving and loading parameter snapshots. Click "+" to save the current state as a new version. Select a version to load it. Changes auto-save to the active version. "Version 1" always represents the original defaults.
- **Copy** — Exports the current values as JSON to your clipboard.

---

## Full Example

```tsx
import { useDialKit } from 'dialkit';
import { motion } from 'motion/react';

function PhotoStack() {
  const p = useDialKit('Photo Stack', {
    // Text inputs
    title: 'Japan',
    subtitle: { type: 'text', default: 'December 2025', placeholder: 'Enter subtitle...' },

    // Color pickers
    accentColor: '#c41e3a',
    shadowTint: { type: 'color', default: '#000000' },

    // Select dropdown
    layout: { type: 'select', options: ['stack', 'fan', 'grid'], default: 'stack' },

    // Grouped sliders in a folder
    backPhoto: {
      offsetX: [239, 0, 400],
      offsetY: [0, 0, 150],
      scale: [0.7, 0.5, 0.95],
      overlayOpacity: [0.6, 0, 1],
    },

    // Spring config for Motion
    transitionSpring: { type: 'spring', visualDuration: 0.5, bounce: 0.04 },

    // Toggle
    darkMode: false,

    // Action buttons
    next: { type: 'action' },
    previous: { type: 'action' },
  }, {
    onAction: (action) => {
      if (action === 'next') goNext();
      if (action === 'previous') goPrevious();
    },
  });

  return (
    <motion.div
      animate={{ x: p.backPhoto.offsetX }}
      transition={p.transitionSpring}
      style={{ color: p.accentColor }}
    >
      <h1>{p.title}</h1>
      <p>{p.subtitle}</p>
    </motion.div>
  );
}
```

---

## Solid

DialKit also works with Solid. Import from `dialkit/solid` instead of `dialkit` — the API mirrors the React version, with `createDialKit` replacing `useDialKit` and `DialRoot` as a Solid component.

```bash
npm install dialkit solid-js
```

```tsx
// App.tsx
import { DialRoot } from 'dialkit/solid';
import 'dialkit/styles.css';

export default function App() {
  return (
    <>
      <MyComponent />
      <DialRoot />
    </>
  );
}
```

```tsx
// component.tsx
import { createDialKit } from 'dialkit/solid';

function Card() {
  const params = createDialKit('Card', {
    blur: [24, 0, 100],
    scale: 1.2,
    color: '#ff5500',
    visible: true,
  });

  return (
    <div style={{
      filter: `blur(${params().blur}px)`,
      transform: `scale(${params().scale})`,
      color: params().color,
      opacity: params().visible ? 1 : 0,
    }}>
      ...
    </div>
  );
}
```

`createDialKit` returns an accessor — call `params()` to read the current values. All control types, config shapes, and panel features (presets, copy, folders) work identically to the React version.

---

## Svelte

DialKit works with Svelte 5 (≥5.8.0). Import from `dialkit/svelte` — no extra dependencies needed.

```bash
npm install dialkit
```

```svelte
<!-- +layout.svelte -->
<script>
  import { DialRoot } from 'dialkit/svelte';
  let { children } = $props();
</script>

{@render children()}
<DialRoot />
```

```svelte
<!-- Card.svelte -->
<script>
  import { createDialKit } from 'dialkit/svelte';

  const params = createDialKit('Card', {
    blur: [24, 0, 100],
    scale: 1.2,
    color: '#ff5500',
    visible: true
  });
</script>

<div style:filter={`blur(${params.blur}px)`} style:color={params.color}>
  ...
</div>
```

`createDialKit` returns a reactive object — access values directly (e.g. `params.blur`). Styles are injected automatically by `DialRoot` (no CSS import needed). Cleanup is automatic when the component unmounts. All control types, presets, folders, and transitions match the React/Solid entries.

---

## Types

All config and value types are exported:

```tsx
import type {
  SpringConfig,
  ActionConfig,
  SelectConfig,
  ColorConfig,
  TextConfig,
  DialConfig,
  DialValue,
  ResolvedValues,
  ControlMeta,
  PanelConfig,
  Preset,
} from 'dialkit';
```

Return values are fully typed: `params.blur` infers as `number`, `params.color` as `string`, `params.spring` as `SpringConfig`, `params.shadow` as a nested object, etc.

---

## License

MIT
