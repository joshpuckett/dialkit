# DialKit Timeline

Define an animation in code, then tune its values, timing, and curves in the dock. Bind each clip's `current` values while editing so the UI follows the playhead during playback and scrubbing.

See the [quick start](https://github.com/joshpuckett/dialkit#timeline) for a complete React example. Every adapter uses the same config and timing model.

## Setup

| Adapter | Function | Read values | Dock |
| --- | --- | --- | --- |
| React | `useDialTimeline` | `timeline.card.current` | `<DialTimeline />` |
| Solid | `createDialTimeline` | `timeline().card.current` | `<DialTimeline />` |
| Svelte | `createDialTimeline` | `timeline.card.current` | `<DialTimeline />` |
| Vue | `useDialTimeline` | `timeline.value.card.current` in script | `<DialTimeline />` |
| Vanilla | `createDialTimeline` | `timeline.values.card.current` | `createDialTimelineRoot()` |

Import from your adapter's entry. Mount one dock to display all registered timelines. Import `dialkit/styles.css`, or `dialkit/vanilla/styles.css` for vanilla. Svelte's `DialRoot` injects styles; import the stylesheet yourself when using the Svelte dock without it.

```ts
useDialTimeline(name, config, options);
```

| Option | Purpose | Default |
| --- | --- | --- |
| `id` | Stable ID for retaining values across mounts | Generated |
| `persist` | Save timing edits and presets; accepts the panel storage options | `false` |
| `autoplay` | Play on mount | `true` |
| `loop` | Wrap to 0 with `true`, or to a time with `{ from: seconds }` | `false` |

The returned values include `time`, `playing`, `duration`, and the methods `play()`, `pause()`, `replay()`, and `seek(seconds)`. `replay()` starts from 0. In vanilla, these methods also live on the controller; use `subscribe(callback)` for frame updates and `destroy()` for cleanup.

The names `time`, `playing`, `duration`, `play`, `pause`, `replay`, and `seek` are reserved at the top level.

## Clips

Every clip requires `at`, its start time in seconds. Choose one shape:

- `from` and `to` for a single transition.
- `from` and `steps` for a sequence.
- `props` for properties with independent timing.
- Only `at` and optional `duration` for a timing marker with no animated values.

```ts
import type { TimelineConfig } from "dialkit";

const config = {
  card: {
    at: 0.4,
    duration: 0.7,
    from: { y: 24, scale: 0.95, opacity: 0 },
    to: { y: 0, scale: 1, opacity: 1 },
    transition: { type: "spring", bounce: 0.2 },
  },
} satisfies TimelineConfig;
```

`from` and `to` become editable controls in the clip editor. Numeric ranges account for common properties such as position, rotation, scale, and opacity, and expand to include the supplied values.

For time-based springs and easings, the bar sets the duration: resizing it retimes the transition. For physics springs, duration is derived from the spring's settling time. Those bars show `~` and are resized by editing their physics.

When `duration` is omitted, DialKit uses the transition's duration or spring settling time. A clip with values but no transition uses `{ type: "spring", bounce: 0.2 }`.

### Clip values

| Field | Meaning |
| --- | --- |
| `at`, `duration` | Current timing in seconds |
| `loop` | `"off"` or `"repeat"` |
| `started` | The playhead has reached the clip |
| `active` | The playhead is inside a cycle of the clip |
| `done` | The clip has ended; looping clips end with the timeline |
| `progress` | Progress from 0 to 1 in the current cycle |
| `step` | Current step index for a sequence |
| `from`, `to` | Resolved endpoints; `to` is the final merged state of a sequence |
| `current` | Values sampled at the playhead |
| `animate` | `from` before the clip starts, then `to` |
| `transition` | Effective transition for a single-curve clip |
| `css` | CSS duration and timing function for a single-curve clip |

`animate` and `css` can drive endpoint-based animations. Use `current` for a preview that responds to scrubbing.

## Sequences

Each step becomes a segment in the clip's row. Its `to` values animate from the previous state; unspecified properties hold their previous values.

```ts
import type { TimelineConfig } from "dialkit";

const config = {
  path: {
    at: 0,
    from: { x: -70, y: 0 },
    transition: { type: "easing", duration: 0.8, ease: [0.65, 0, 0.35, 1] },
    steps: [
      { duration: 0.8, to: { x: 0, y: 36 } },
      { duration: 0.8, to: { x: 70, y: 0 } },
      { duration: 0.8, to: { x: -70 } },
    ],
  },
} satisfies TimelineConfig;
```

Declare every animated property in `from`. Each step can supply its own transition; otherwise it inherits the clip's transition. The clip duration is the sum of its steps. Drag a segment boundary to resize the step on its left, or click a segment to edit its values and curve.

## Property tracks

Use `props` when properties need different durations, curves, or delays:

```ts
import type { TimelineConfig } from "dialkit";

const config = {
  float: {
    at: 0,
    loop: true,
    props: {
      y: {
        from: -9,
        steps: [
          { duration: 0.6, to: 9 },
          { duration: 0.6, to: -9 },
        ],
      },
      scale: {
        from: 0.94,
        delay: 0.12,
        steps: [
          { duration: 0.8, to: 1.06 },
          { duration: 0.8, to: 0.94 },
        ],
      },
    },
  },
} satisfies TimelineConfig;
```

Each property has its own `from`/`to` or `steps`, transition, and duration. `delay` offsets it from the clip's `at`. When looping, each track repeats at its own period.

Click the composite bar to expand the property rows. Drag a property's bar to edit its delay. `props` cannot be combined with clip-level `from`, `to`, or `steps`; reserved clip field names cannot be used as track names.

## Groups

Nest clips one level to group them into a collapsible layer. The returned values follow the same nesting:

```ts
import type { TimelineConfig } from "dialkit";

const config = {
  circle: {
    enter: { at: 0, duration: 0.5 },
    pulse: { at: 0.5, duration: 1 },
  },
} satisfies TimelineConfig;

// React: timeline.circle.enter.progress
```

Groups organize the editor. Your app decides how values from different clips combine on an element.

## Loops and duration

A clip's `loop: true` repeats its cycle until the timeline ends. To return to its starting state, write a sequence whose last step reaches that state. There is no mirror mode.

The timeline's `loop` option controls the playhead:

```tsx
const timeline = useDialTimeline("Hero", config, { loop: { from: 1.4 } });
```

`true` wraps to 0. `{ from: 1.4 }` plays the introduction once, then wraps to 1.4 seconds. Looping clips retain their phase across wraps. Seeking returns to the first-pass state at that time.

A top-level `duration` sets the minimum editing window. Otherwise the timeline fits its content. It grows if edits make a clip extend past the current end.

For event-driven playback, set `autoplay: false` and call `replay()` from your app's event handler.

## Dock

The dock sits at the bottom of the viewport and works independently of the parameter panel. Timeline controls do not appear in `DialRoot`.

| Option | Default | Purpose |
| --- | --- | --- |
| `theme` | `"system"` | `"system"`, `"light"`, or `"dark"` |
| `defaultVisible` | `true` | Initial dock visibility |
| `visible` | Uncontrolled | Set visibility from the host app |
| `onVisibilityChange` | — | Receive visibility changes; `@visibility-change` in Vue |
| `defaultOpen` | `true` | Start timeline sections expanded |
| `productionEnabled` | Development only; always enabled in vanilla | Render the editor |

The toolbar includes play/pause, replay, presets, Copy, and collapse. When `DialRoot` is also mounted, its timeline button shows or hides the dock. Visibility does not affect playback. In vanilla, use `dock.setVisible(boolean)` or controlled `dock.update({ visible, onVisibilityChange })`.

| Gesture | Effect |
| --- | --- |
| Drag the ruler or playhead | Seek; pause during the drag and resume afterward if previously playing |
| Drag the collapsed overview | Scrub the full timeline |
| Alt/Option + drag the ruler | Zoom around the starting point |
| Shift + drag | Reset to the full timescale and seek |
| Horizontal scroll while zoomed | Pan the visible range |
| Drag a clip | Change its start time |
| Drag clip edges or segment boundaries | Change duration |
| Click a clip or segment | Edit values and transition |
| Drag the dock's top edge | Resize its height |

### Keyboard

| Control | Keys |
| --- | --- |
| Timeline | Space plays or pauses when focus is in the dock but not on a button or field |
| Playhead | Arrows move 0.05 s; Shift + Arrow moves 0.5 s; Alt/Option + Arrow moves 0.01 s; Home/End goes to the start/end. Playback pauses |
| Clip or segment | Enter or Space edits it, or expands a property clip; Left/Right moves it 0.05 s (Shift: 0.5 s); Alt/Option + Left/Right changes its duration |
| Property track | Left/Right changes its delay |
| Clip editor | Opens with focus on its first control; Escape, Close, or tabbing past either end returns focus to the clip |
| Dock's top edge | Up/Down resizes by 20 px; Shift + Up/Down by 100 px |

Edits follow the same limits as dragging, and the new timing is announced to screen readers.

## Apply the result

**Copy** exports an instruction containing the tuned timings, transitions, and values. It preserves the `current` bindings while the animation is being edited and includes a production handoff comment.

Before removing DialKit, replace those sampled bindings with your production animation code. Hiding or removing the dock alone leaves the timeline running. DialKit samples springs and Bézier curves for scrubbing; its spring preview is not guaranteed to match every frame of another animation runtime.

`formatClock(seconds, tenths?)` is available from `dialkit`, `dialkit/vanilla`, and `dialkit/timeline` for custom clock displays.
