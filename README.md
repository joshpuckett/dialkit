# dialkit

Real-time parameter tweaking for React + Motion.

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
  const { params } = useDialKit('Card', {
    blur: [24, 0, 100],
    scale: 1.2,
    color: '#ff5500',
    visible: true,
  });

  return (
    <div style={{
      filter: `blur(${params.blur}px)`,
      transform: `scale(${params.scale})`,
      color: params.color,
      opacity: params.visible ? 1 : 0,
    }}>
      ...
    </div>
  );
}
```

---

## useDialKit

```tsx
const { params, setParams } = useDialKit(name, config, options?)
```

| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Panel title displayed in the UI |
| `config` | `DialConfig` | Parameter definitions (see Control Types below) |
| `options.onAction` | `(path: string) => void` | Callback when action buttons are clicked |

Returns `{ params, setParams }`:

- **`params`** — A fully typed object matching your config shape with live values. Updating a control in the UI immediately updates the returned values. The reference is stable (shallow-compared) to prevent unnecessary re-renders.
- **`setParams(path, value)`** — Update a value programmatically. The path is type-safe — only valid config keys are accepted.

---

## Control Types

### Slider

```tsx
blur: [24, 0, 100]      // [default, min, max] — explicit range
scale: 1.2              // auto-infers range from value
```

Numbers create sliders. With a tuple `[default, min, max]` you set the range explicitly. A bare number auto-infers a reasonable range:

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
const { params } = useDialKit('Card', {
  spring: { type: 'spring', visualDuration: 0.5, bounce: 0.04 },
  x: [0, -200, 200],
});

<motion.div animate={{ x: params.x }} transition={params.spring} />
```

**Returns:** `SpringConfig` (pass directly to Motion)

### Action

```tsx
const { params } = useDialKit('Controls', {
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

### Monitor

```tsx
const { params, setParams } = useDialKit('Debug', {
  fps: { type: 'monitor' },
  renderCount: { type: 'monitor', defaultValue: 0 },
});

// Update from anywhere
setParams('fps', 60);
setParams('renderCount', count);
```

Monitors display read-only values in the panel. They're useful for exposing runtime data (FPS, counts, status) without a control. Use `setParams()` to push values programmatically. The `defaultValue` is shown before any `setParams()` call.

**Returns:** `string | number | boolean | undefined`

### Folder

```tsx
shadow: {
  blur: [10, 0, 50],
  opacity: [0.25, 0, 1],
  color: '#000000',
}
```

Any nested plain object becomes a collapsible folder. Folders can nest arbitrarily deep. Access nested values with dot notation on the returned object:

```tsx
params.shadow.blur     // number
params.shadow.color    // string
```

---

## DialRoot

```tsx
<DialRoot position="top-right" />
```

| Prop | Type | Default |
|------|------|---------|
| `position` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` |

Mount once at your app root. The panel renders via a portal on `document.body`. It collapses to a small icon button and expands to 280px wide on click.

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
  const { params, setParams } = useDialKit('Photo Stack', {
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

    // Read-only monitor
    fps: { type: 'monitor' },

    // Action buttons
    next: { type: 'action' },
    previous: { type: 'action' },
  }, {
    onAction: (action) => {
      if (action === 'next') goNext();
      if (action === 'previous') goPrevious();
    },
  });

  // Programmatically update monitor values
  setParams('fps', 60);

  return (
    <motion.div
      animate={{ x: params.backPhoto.offsetX }}
      transition={params.transitionSpring}
      style={{ color: params.accentColor }}
    >
      <h1>{params.title}</h1>
      <p>{params.subtitle}</p>
    </motion.div>
  );
}
```

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
  MonitorConfig,
  DialConfig,
  DialValue,
  ResolvedValues,
  ControlMeta,
  PanelConfig,
  Preset,
  UseDialResult,
} from 'dialkit';
```

Return values are fully typed: `params.blur` infers as `number`, `params.color` as `string`, `params.spring` as `SpringConfig`, `params.shadow` as a nested object, etc. The `setParams` function is also type-safe — it only accepts valid config paths.

---

## License

MIT
