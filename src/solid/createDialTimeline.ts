import { createEffect, createMemo, createSignal, createUniqueId, onCleanup, untrack, type Accessor } from 'solid-js';
import { isServer } from 'solid-js/web';
import { DialStore } from '../store/DialStore';
import { TimelineStore } from '../store/TimelineStore';
import {
  buildTimelineMeta,
  buildTimelineValues,
  computeStaticTimeline,
  parseTimelineConfig,
  resolveTimelineLoop,
  type DialTimelineOptions,
  type DialTimelineValues,
  type TimelineConfig,
} from '../timeline';

export type CreateDialTimelineOptions = DialTimelineOptions;

export function createDialTimeline<T extends TimelineConfig>(
  name: string | Accessor<string>,
  config: T,
  options?: CreateDialTimelineOptions
): Accessor<DialTimelineValues<T>> {
  const instanceId = createUniqueId();
  const hasStableId = options?.id !== undefined;
  // Not derived from the name: renaming a timeline must not discard its tuned values.
  const panelId = options?.id ?? `dialkit-${instanceId}`;
  const serializedConfig = createMemo(() => JSON.stringify(config));
  const parsed = createMemo(() => {
    serializedConfig();
    return untrack(() => parseTimelineConfig(config));
  });
  const [flatValues, setFlatValues] = createSignal(DialStore.getValues(panelId));
  const [transport, setTransport] = createSignal(TimelineStore.getTransport(panelId));
  const staticTimeline = createMemo(() => computeStaticTimeline(parsed(), flatValues()));
  const timelineDuration = createMemo(() => staticTimeline().duration);
  const loopStart = () => resolveTimelineLoop(options?.loop).start;

  const play = () => TimelineStore.play(panelId);
  const pause = () => TimelineStore.pause(panelId);
  const replay = () => TimelineStore.replay(panelId);
  const seek = (time: number) => TimelineStore.seek(panelId, time);

  if (!isServer) {
    onCleanup(DialStore.subscribe(panelId, () => {
      setFlatValues(DialStore.getValues(panelId));
    }));
    onCleanup(TimelineStore.subscribe(panelId, () => {
      setTransport(TimelineStore.getTransport(panelId));
    }));
  }

  // One effect, in the order React's effects run: the panel first, then the
  // transport, whose duration depends on the values the panel just reconciled.
  // Registering once and updating after keeps the playhead through every change.
  let registered = false;
  let panelSignature: string | undefined;
  createEffect(() => {
    const currentName = typeof name === 'function' ? name() : name;
    const currentParsed = parsed();
    const persist = options?.persist;
    const loop = options?.loop;
    const nextSignature = JSON.stringify([currentName, serializedConfig(), persist]);
    const firstRun = !registered;
    registered = true;

    if (nextSignature !== panelSignature) {
      panelSignature = nextSignature;
      // legacyId is 2.1's generated id, so data it saved for a timeline without an id still loads.
      const panelOptions = { retainOnUnmount: hasStableId, legacyId: `${currentName}-${instanceId}`, persist, kind: 'timeline' as const };
      untrack(() => {
        if (firstRun) DialStore.registerPanel(panelId, currentName, currentParsed.dialConfig, undefined, panelOptions);
        else DialStore.updatePanel(panelId, currentName, currentParsed.dialConfig, undefined, panelOptions);
      });
    }

    const meta = buildTimelineMeta(panelId, currentName, timelineDuration(), currentParsed, loop);
    untrack(() => {
      if (firstRun) TimelineStore.register(meta, { autoplay: options?.autoplay ?? true });
      else TimelineStore.update(meta);
    });
  });
  onCleanup(() => {
    if (!registered) return;
    TimelineStore.unregister(panelId);
    DialStore.unregisterPanel(panelId);
  });

  return createMemo(() => {
    const currentStatic = staticTimeline();
    return buildTimelineValues<T>(
      currentStatic.clips,
      transport(),
      currentStatic.duration,
      loopStart(),
      { play, pause, replay, seek }
    );
  });
}
