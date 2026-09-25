# DialKit reference

[Quick start](https://github.com/joshpuckett/dialkit#quick-start) · [Timeline guide](https://github.com/joshpuckett/dialkit/blob/main/docs/timeline.md)

Import APIs and types from the entry for your adapter: `dialkit`, `dialkit/solid`, `dialkit/svelte`, `dialkit/vue`, `dialkit/lit`, or `dialkit/vanilla`.

## Controls

A `DialConfig` maps keys to control definitions. Keys become labels, with camelCase converted to words. Nested objects become folders; their values retain the same paths.

### Sliders

```ts
import type { DialConfig } from "dialkit";

const config = {
  radius: [24, 0, 64],       // [default, min, max]
  spacing: [16, 0, 64, 2],   // [default, min, max, step]
  scale: 1.2,               // Infer the range and step
} satisfies DialConfig;
```

When a tuple omits its step, DialKit uses `0.01` for ranges up to 1, `0.1` up to 10, `1` up to 100, and `10` above 100. Bare numbers use these ranges:

| Starting value | Minimum | Maximum | Step |
| --- | --- | --- | --- |
| 0–1 | 0 | 1 | 0.01 |
| Greater than 1, up to 10 | 0 | Value × 3 | 0.1 |
| Greater than 10, up to 100 | 0 | Value × 3 | 1 |
| Greater than 100 | 0 | Value × 3 | 10 |
| Negative | Value × 3 | −Value × 3 | 1 |

Click or drag to adjust a slider. Focus it and press Enter to type a value, or hover over its number briefly and click. Values are clamped to the range.

### Text and selects

```ts
import type { DialConfig } from "dialkit";

const config = {
  title: "Hello",
  notes: { type: "text", default: "", placeholder: "Add a note…" },
  layout: {
    type: "select",
    options: [
      { value: "stack", label: "Stacked" },
      { value: "grid", label: "Grid" },
    ],
    default: "stack",
  },
} satisfies DialConfig;
```

Text fields grow up to five lines, then scroll. Enter inserts a line break. Use the explicit `text` form when a string should remain text, including strings that look like colors.

Select options accept strings or `{ value, label }` objects. The default is the first option's value, or `""` for an empty list. Empty selects are disabled.

### Colors

```ts
import type { DialConfig } from "dialkit";

const config = {
  accent: "#a78bfa",
  highlight: "oklch(0.7 0.2 145 / 0.8)",
  background: { type: "color", default: "color(display-p3 1 0.35 0.15)" },
} satisfies DialConfig;
```

Hex, RGB, HSL, OKLCH, and Display P3 strings are detected automatically. Hex accepts 3, 4, 6, or 8 digits. Use an explicit color config for `transparent`.

The picker offers Hex, OKLCH, and Display P3 output, with hue and opacity controls. Converting to a smaller gamut reduces chroma while preserving lightness and hue. RGB and HSL text is accepted as entered; subsequent picker edits use hex. Named colors, CSS variables, relative colors, and `calc()` expressions are not parsed.

### Images

```ts
import type { DialConfig } from "dialkit";

const config = {
  cover: {
    type: "image",
    options: [
      { value: "/images/coast.jpg", label: "Coast" },
      { value: "/images/mountains.jpg", label: "Mountains" },
    ],
  },
  avatar: { type: "image" },
} satisfies DialConfig;
```

Options accept URLs or `{ value, label }` objects. `default` selects the initial URL; otherwise the first option is selected. An image control without options starts empty. Removing an image returns `""`.

Upload or drop an image up to 10 MB. DialKit reads it locally as a data URL and sends nothing to a server. Uploaded choices last for the control's lifetime. The selected value can be saved in a preset or persisted, subject to browser storage limits.

### XY pads

```ts
import type { DialConfig } from "dialkit";

const config = {
  position: { type: "pad" },
  timing: {
    type: "pad",
    x: [0.3, 0.1, 1, 0.01],
    y: [0.2, 0, 1, 0.01],
    labels: { x: "Duration", y: "Bounce" },
  },
} satisfies DialConfig;
```

Each axis uses `[default, min, max, step?]`. Omitted axes default to `[0, -1, 1, 0.01]`; an explicit tuple without a step divides its range into 200 intervals. Values are clamped and snapped to the step. Labels do not change the returned `{ x, y }` keys.

X increases to the right; Y increases upward. Clicks near grid intersections snap to them. Hold Shift while dragging to lock an axis. Home or a double-click restores the configured defaults; Escape cancels an active drag.

### Transitions

```ts
import type { DialConfig } from "dialkit";

const config = {
  spring: { type: "spring", visualDuration: 0.3, bounce: 0.2 },
  physics: { type: "spring", stiffness: 200, damping: 25, mass: 1 },
  easing: { type: "easing", duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
} satisfies DialConfig;
```

All three definitions open the same transition editor:

| Mode | Parameters |
| --- | --- |
| Easing | Duration and four Bézier coordinates; handles can be dragged or edited by keyboard |
| Time | `visualDuration` and `bounce` |
| Physics | `stiffness`, `damping`, and `mass` |

Switching modes restores the previous edits for that mode while the editor remains mounted. The returned type is `TransitionConfig`, a union of `SpringConfig` and `EasingConfig`, because users can switch between them.

### Actions and folders

```tsx
const values = useDialKit("Card", {
  replay: { type: "action", label: "Replay animation" },
  shadow: {
    _collapsed: true,
    blur: [12, 0, 40],
    reset: { type: "action" },
  },
}, {
  onAction(path) {
    if (path === "replay") replayAnimation();
    if (path === "shadow.reset") resetShadow();
  },
});
```

Actions call `onAction` with their full dot path. They are not writable values. Action buttons stack vertically, including inside `ButtonGroup`.

Folders can nest. `_collapsed: true` starts a folder closed; it is UI metadata and is omitted from resolved values. Use `defaultCollapsed` in panel options to close the entire panel.

## Controllers

Use `useDialKitController` in React and Vue, `createDialKitController` in Solid, Svelte, and vanilla, or `new DialKitController(host, name, config, options)` in Lit. Vanilla's `createDialKit` is an alias for its controller factory, and so is Lit's `createDialKit(host, ...)`.

| Member | Behavior |
| --- | --- |
| `values` | Resolved values: object in React/Svelte, accessor in Solid, computed ref in Vue, snapshot getter in vanilla and Lit |
| `getValues()` | Read the latest resolved snapshot |
| `setValue(path, value)` | Update one control using a dot path |
| `setValues(values)` | Apply a nested partial object in one update |
| `resetValues()` | Restore current config defaults and clear the active preset |
| `setOpen(open)` | Open or close this panel; opening also reveals its containing root |
| `getOpen()` | Read open state; `undefined` means the root default has not been initialized |

Programmatic edits update the active preset, or the base values when Version 1 is selected. `setValues` does not trigger actions. Update an XY pad as a pair: `setValue("position", { x: 0.5, y: -0.25 })`.

### Vanilla lifecycle

Vanilla controllers additionally expose:

| Member | Behavior |
| --- | --- |
| `id` | The registered panel ID |
| `subscribe(callback, immediate?)` | Receive snapshots; calls immediately by default and returns an unsubscribe function |
| `updateConfig(config)` | Reconcile new definitions while retaining compatible edits |
| `destroy()` | Release this registration and its subscriptions; safe to call twice |

Snapshots are plain objects. Read them again after updates or use a subscription. Destroying a root removes the UI; destroy its controllers separately to release their registrations.

### Lit lifecycle

`DialKitController` and `DialTimelineController` are [reactive controllers](https://lit.dev/docs/composition/controllers/). Pass the host element as the first argument, usually as a class field. The panel registers in `hostConnected()` and unregisters in `hostDisconnected()`, so moving or removing the element releases it, and a stable `id` retains its values across reconnects. Every store change calls `host.requestUpdate()`. While a timeline plays, that happens once per frame and re-renders the whole host, so keep animated regions in a small element and read `this.timeline.values` once per render.

| Member | Behavior |
| --- | --- |
| `id` | The registered panel ID |
| `values` | Snapshot getter, cached until the store changes (per frame for timelines); reading it repeatedly in `render()` is free |
| `updateConfig(config)` | Reconcile new definitions while retaining compatible edits |

Before the host connects, `values` resolves against what the store already holds for the ID: the config defaults for a new ID, or the in-memory values of a stable ID registered earlier. Values loaded from storage by `persist` arrive with the first update after connecting. `onAction` is read from the options object on each action, so it can be replaced later.

## Persistence

Pass a stable `id` to reconnect to a panel across mounts. Multiple registrations with the same ID share values. Keep their configs consistent.

`persist: true` saves values, presets, and the active preset to `localStorage` under `dialkit:${id}`. Use the object form to customize storage:

```tsx
const values = useDialKit("Card", { radius: [24, 0, 64] }, {
  id: "card",
  persist: {
    key: "my-app:card",
    storage: "sessionStorage",
    presets: false,
  },
});
```

`storage` defaults to `"localStorage"`; `presets` defaults to `true`. With `presets: false`, only values are persisted. Open state is retained in memory for stable IDs but is never written to storage.

The toolbar's **+** saves and selects a new version. Selecting **Version 1** restores the editable base values. The version menu can also delete saved versions. **Copy** places the values and a configuration-update instruction on the clipboard.

For custom preset interfaces, use `DialStore.savePreset`, `loadPreset`, `deletePreset`, `getPresets`, `getActivePresetId`, and `clearActivePreset`.

## Panel state

`defaultOpen` on the root supplies the initial state. A panel's `defaultCollapsed` overrides it when specified. Use `setOpen` for later changes. In vanilla, `root.update({ defaultOpen })` changes the default for panels registered afterwards without touching existing state.

For code that only has a panel ID:

```ts
import { DialStore } from "dialkit";

DialStore.setPanelOpen("card", true);
DialStore.togglePanelOpen("card");
DialStore.getPanelOpen("card");
```

`Folder` also accepts controlled `open` and `onOpenChange` (`@open-change` in Vue), or an initial `defaultOpen`. Inline roots fill their container, ignore `position`, and disable collapse-to-icon interaction.

## Keyboard

| Control | Keys |
| --- | --- |
| Panel or folder | Enter or Space toggles the focused header |
| Slider | Arrows adjust one step; Shift + Arrow or Page Up/Down adjusts ten; Home/End goes to the bounds |
| Numeric editor | Enter opens it from a slider; Enter commits, Escape cancels, Tab commits and advances |
| XY pad | Arrows adjust axes; Shift + Arrow adjusts ten steps; Home resets; Escape cancels a drag |
| Select or preset menu | Enter, Space, or Up/Down opens; arrows, Home/End, and typing navigate; Enter/Space selects; Escape closes |
| Segmented control | Arrows select a segment; Home/End selects the first/last |
| Color picker | Tab moves between controls; arrows adjust the focused control; Escape closes |
| Image picker | Arrows move through images; Enter/Space selects; Escape closes |
| Bézier handles | Arrows move by 0.01; Shift + Arrow by 0.1; Escape cancels a drag |

Menus return focus to their trigger on selection or Escape. Tab and Shift + Tab resume the owning panel's tab order.

### Assigned shortcuts

Shortcut keys use control paths, including nested paths such as `"shadow.blur"`:

```ts
const shortcuts = {
  radius: { key: "r", mode: "fine" },
  "shadow.blur": { key: "b", modifier: "alt", interaction: "drag" },
  visible: { key: "v" },
};
```

| Option | Values | Default |
| --- | --- | --- |
| `key` | A trigger key; optional for `scroll-only` | — |
| `modifier` | `"alt"`, `"shift"`, `"meta"` | None |
| `interaction` | `"scroll"`, `"drag"`, `"move"`, `"scroll-only"` | `"scroll"` |
| `mode` | `"fine"`, `"normal"`, `"coarse"` | `"normal"` |

For sliders, hold the key and scroll, drag horizontally, or move the pointer according to `interaction`. `scroll-only` needs no key. Arrow keys also adjust a slider while its assigned key is held. Toggles flip on the assigned key press.

`normal` uses the slider's step. `fine` uses 1% of its range; `coarse` uses 10%. Shortcut badges show the assigned key and interaction. Shortcuts are disabled while an input, button, or keyboard-operated control has focus.

## Custom layouts

Adapters export individual controls, including `Slider`, `Toggle`, `TextControl`, `SelectControl`, `ColorControl`, `ImageControl`, `DialPad`, `TransitionControl`, `Folder`, and `ButtonGroup`. `ControlRenderer` renders a control metadata tree. Keep custom controls inside an element with `class="dialkit-root"` and set `data-theme` to `"system"`, `"light"`, or `"dark"`.

In vanilla, each control takes a host element and props:

```js
import { mountSlider } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";

const host = document.querySelector(".dialkit-root");
const props = { label: "Radius", value: 24, min: 0, max: 64, step: 1, onChange };
const slider = mountSlider(host, props);

function onChange(value) {
  props.value = value;
  slider.update(props);
}

// When removing the control: slider.destroy();
```

The matching component name (`Slider` here) aliases the mount function in vanilla. For global assigned shortcuts in a custom vanilla layout without a root, mount `mountShortcutListener()` and destroy it with the layout.

`dialkit/lit` exports the same mount functions. Mount them after the first render into an element without template bindings, so Lit leaves its children alone, and destroy them in `disconnectedCallback()`. Mount from `connectedCallback()` rather than `firstUpdated()`, which runs only once, so a moved or re-inserted element gets its controls back. When the layout renders inside a shadow root, add `dialKitStyles` to `static styles`:

```ts
import { LitElement, html } from "lit";
import { dialKitStyles, mountSlider } from "dialkit/lit";

class Tuner extends LitElement {
  static styles = [dialKitStyles];
  slider?: ReturnType<typeof mountSlider>;

  connectedCallback() {
    super.connectedCallback();
    this.updateComplete.then(() => {
      if (!this.isConnected || this.slider) return;
      const host = this.renderRoot.querySelector<HTMLElement>(".dialkit-root")!;
      this.slider = mountSlider(host, { label: "Radius", value: 24, min: 0, max: 64, step: 1, onChange: () => {} });
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.slider?.destroy();
    this.slider = undefined;
  }

  render() {
    return html`<div class="dialkit-root" data-theme="dark"></div>`;
  }
}
```

Vue also exports `vDialKit` for mounting a root with a directive, such as `<aside v-dial-kit="'inline'" />`.

## Types

Types are exported from the same entry as the adapter. TypeScript infers values from inline configs; use `satisfies` to preserve types for a separate config:

```ts
import type { DialConfig, ResolvedValues } from "dialkit";

const config = {
  radius: [24, 0, 64],
  position: { type: "pad" },
} satisfies DialConfig;

type Values = ResolvedValues<typeof config>;
```

The public types include control configs, `TransitionConfig`, `DialKitController`, `DialKitValueUpdates`, `ControlMeta`, `PanelConfig`, and `Preset`. Timeline config and value types are exported alongside them.
