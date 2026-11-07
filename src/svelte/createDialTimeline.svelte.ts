import { untrack } from 'svelte';
import { DialStore } from 'dialkit/store';
import {
  TimelineStore,
  buildTimelineMeta,
  buildTimelineValues,
  computeStaticTimeline,
  parseTimelineConfig,
  resolveTimelineLoop,
} from 'dialkit/timeline';
import type {
  DialTimelineOptions,
  DialTimelineValues,
  TimelineConfig,
} from 'dialkit/timeline';

export type CreateDialTimelineOptions = DialTimelineOptions;

let timelineInstance = 0;

export function createDialTimeline<T extends TimelineConfig>(
  name: string,
  config: T,
  options?: CreateDialTimelineOptions
): DialTimelineValues<T> {
  const hasStableId = options?.id !== undefined;
  // Not derived from the name: renaming a timeline must not discard its tuned values.
  const panelId = options?.id ?? `dialkit-timeline-${++timelineInstance}`;
  // 2.1's generated id, so data it saved for a timeline without an id still loads.
  const legacyId = `${name}-${timelineInstance}`;
  const serializedConfig = $derived(JSON.stringify(config));
  const serializedPersist = $derived(JSON.stringify(options?.persist));
  // Reparsed only when the config's content changes, which keeps `clips` stable.
  const parsed = $derived.by(() => {
    void serializedConfig;
    return untrack(() => parseTimelineConfig(config));
  });
  let flatValues = $state(DialStore.getValues(panelId));
  let transport = $state(TimelineStore.getTransport(panelId));
  const staticTimeline = $derived(computeStaticTimeline(parsed, flatValues));
  const actions = {
    play: () => TimelineStore.play(panelId),
    pause: () => TimelineStore.pause(panelId),
    replay: () => TimelineStore.replay(panelId),
    seek: (time: number) => TimelineStore.seek(panelId, time),
  };
  const resolved = $derived(buildTimelineValues<T>(
    staticTimeline.clips,
    transport,
    staticTimeline.duration,
    resolveTimelineLoop(options?.loop).start,
    actions
  ));
  const panelOptions = () => ({
    retainOnUnmount: hasStableId,
    legacyId,
    persist: options?.persist,
    kind: 'timeline' as const,
  });

  // Registered once per id. Everything later goes through the updates below,
  // because registering again would reset the playhead.
  $effect(() => {
    untrack(() => {
      DialStore.registerPanel(panelId, name, parsed.dialConfig, undefined, panelOptions());
      const initialValues = DialStore.getValues(panelId);
      flatValues = initialValues;
      const initialStatic = computeStaticTimeline(parsed, initialValues);
      TimelineStore.register(
        buildTimelineMeta(panelId, name, initialStatic.duration, parsed, options?.loop),
        { autoplay: options?.autoplay ?? true }
      );
      transport = TimelineStore.getTransport(panelId);
    });

    const unsubscribeValues = DialStore.subscribe(panelId, () => {
      flatValues = DialStore.getValues(panelId);
    });
    const unsubscribeTransport = TimelineStore.subscribe(panelId, () => {
      transport = TimelineStore.getTransport(panelId);
    });

    return () => {
      unsubscribeValues();
      unsubscribeTransport();
      TimelineStore.unregister(panelId);
      DialStore.unregisterPanel(panelId);
    };
  });

  // The first run only records the dependencies: the effect above has just
  // registered this same state.
  let registered = false;
  $effect(() => {
    const { dialConfig } = parsed;
    void serializedPersist;
    if (!registered) {
      registered = true;
      return;
    }
    untrack(() => DialStore.updatePanel(panelId, name, dialConfig, undefined, panelOptions()));
  });

  $effect(() => {
    const meta = buildTimelineMeta(panelId, name, staticTimeline.duration, parsed, options?.loop);
    untrack(() => TimelineStore.update(meta));
  });

  return reactiveProxy(() => resolved) as DialTimelineValues<T>;
}

function reactiveProxy(read: () => unknown, path: PropertyKey[] = []): unknown {
  const nested = new Map<PropertyKey, unknown>();
  return new Proxy({}, {
    get(_target, key) {
      const value = readPath(read(), [...path, key]);
      if (typeof value !== 'object' || value === null) return value;
      if (!nested.has(key)) nested.set(key, reactiveProxy(read, [...path, key]));
      return nested.get(key);
    },
    ownKeys() {
      const value = readPath(read(), path);
      return typeof value === 'object' && value !== null ? Reflect.ownKeys(value) : [];
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  });
}

function readPath(source: unknown, path: PropertyKey[]): unknown {
  return path.reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return Reflect.get(value, key);
  }, source);
}
