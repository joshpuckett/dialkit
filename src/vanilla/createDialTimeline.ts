import { DialStore } from '../store/DialStore';
import { TimelineStore } from '../store/TimelineStore';
import { buildTimelineMeta, buildTimelineValues, computeStaticTimeline, parseTimelineConfig, resolveTimelineLoop, type DialTimelineOptions, type DialTimelineValues, type TimelineConfig } from '../timeline';
export type CreateDialTimelineOptions = DialTimelineOptions;
/** Options `updateConfig` can change. A key set to undefined clears that option. */
export interface DialTimelineUpdateOptions extends Omit<DialTimelineOptions, 'id'> {
  name?: string;
}
export interface DialTimelineController<T extends TimelineConfig> {
  readonly id: string;
  readonly values: DialTimelineValues<T>;
  getValues(): DialTimelineValues<T>;
  subscribe(listener: (values: DialTimelineValues<T>) => void, immediate?: boolean): () => void;
  play(): void;
  pause(): void;
  replay(): void;
  seek(time: number): void;
  updateConfig(config: T, options?: DialTimelineUpdateOptions): void;
  destroy(): void;
}
let nextId = 0;
export function createDialTimeline<T extends TimelineConfig>(name: string, config: T, options: CreateDialTimelineOptions = {}): DialTimelineController<T> {
  // Not derived from the name: renaming a timeline must not discard its tuned values.
  const id = options.id ?? `vanilla-timeline-${++nextId}`;
  // 2.1's generated id, so data it saved for a timeline without an id still loads.
  const legacyId = `vanilla-timeline-${name}-${nextId}`;
  let currentName = name;
  let parsed = parseTimelineConfig(config);
  let settings: DialTimelineOptions = options;
  let destroyed = false;
  // `persist` is always an explicit key, so removing the option removes persistence.
  const registration = () => ({ retainOnUnmount: options.id !== undefined, legacyId, persist: settings.persist, kind: 'timeline' as const });
  DialStore.registerPanel(id, currentName, parsed.dialConfig, undefined, registration());
  let compiled = computeStaticTimeline(parsed, DialStore.getValues(id));
  const meta = () => buildTimelineMeta(id, currentName, compiled.duration, parsed, settings.loop);
  TimelineStore.register(meta(), { autoplay: settings.autoplay ?? true });
  const actions = {
    play() {
      if (!destroyed)
        TimelineStore.play(id);
    },
    pause() {
      if (!destroyed)
        TimelineStore.pause(id);
    },
    replay() {
      if (!destroyed)
        TimelineStore.replay(id);
    },
    seek(time: number) {
      if (!destroyed)
        TimelineStore.seek(id, time);
    },
  };
  const listeners = new Set<(values: DialTimelineValues<T>) => void>();
  const getValues = () => buildTimelineValues<T>(compiled.clips, TimelineStore.getTransport(id), compiled.duration, resolveTimelineLoop(settings.loop).start, actions);
  let notified = false;
  const notify = () => {
    notified = true;
    const values = getValues();
    listeners.forEach(listener => listener(values));
  };
  const stopValues = DialStore.subscribe(id, () => {
    compiled = computeStaticTimeline(parsed, DialStore.getValues(id));
    notified = false;
    TimelineStore.update(meta());
    // An edit that leaves the meta alone doesn't touch the transport, and a paused
    // timeline has no tick to carry it, yet the values did change.
    if (!notified)
      notify();
  });
  const stopTransport = TimelineStore.subscribe(id, notify);
  return {
    id, ...actions,
    get values() {
      return getValues();
    },
    getValues,
    subscribe(listener, immediate = true) {
      if (destroyed)
        return () => {
        };
      listeners.add(listener);
      if (immediate)
        listener(getValues());
      return () => {
        listeners.delete(listener);
      };
    },
    updateConfig(next, nextOptions = {}) {
      if (destroyed)
        return;
      const { name: nextName, ...rest } = nextOptions;
      const wasAutoplay = settings.autoplay ?? true;
      currentName = nextName ?? currentName;
      parsed = parseTimelineConfig(next);
      settings = { ...settings, ...rest };
      // The store's subscription above recompiles and pushes the new meta.
      DialStore.updatePanel(id, currentName, parsed.dialConfig, undefined, registration());
      const autoplay = settings.autoplay ?? true;
      if (autoplay !== wasAutoplay) {
        if (autoplay)
          TimelineStore.play(id);
        else
          TimelineStore.pause(id);
      }
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      listeners.clear();
      stopValues();
      stopTransport();
      TimelineStore.unregister(id);
      DialStore.unregisterPanel(id);
    },
  };
}
