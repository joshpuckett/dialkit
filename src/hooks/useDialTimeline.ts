import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { TimelineStore } from '../store/TimelineStore';
import { computeStaticTimeline, parseTimelineConfig } from '../timeline-core';
import type { DialTimelineValues, TimelineConfig } from '../timeline-core';
import {
  buildTimelineMeta,
  buildTimelineValues,
  resolveTimelineLoop,
  type DialTimelineOptions,
} from '../timeline/adapter';
import { useDialStorePanel, useSerialized } from './useDialStorePanel';

export type {
  TimelineClipConfig,
  TimelineClipCss,
  TimelineClipLoop,
  TimelineClipValues,
  TimelineConfig,
  TimelineGroupConfig,
  TimelineGroupValues,
  TimelinePropConfig,
  TimelinePropStepConfig,
  TimelineStepConfig,
  TimelineStepValues,
  DialTimelineValues,
} from '../timeline-core';

export type UseDialTimelineOptions = DialTimelineOptions;

export function useDialTimeline<T extends TimelineConfig>(
  name: string,
  config: T,
  options?: UseDialTimelineOptions
): DialTimelineValues<T> {
  const serializedConfig = useSerialized(config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parsed = useMemo(() => parseTimelineConfig(config), [serializedConfig]);

  // Clip values live in DialStore under the timeline's panel id, so presets,
  // persistence, reset, and copy all work on timing data for free.
  const { panelId, flatValues } = useDialStorePanel(name, parsed.dialConfig, {
    id: options?.id,
    persist: options?.persist,
    kind: 'timeline',
  });

  // Edit-time pass: resolve all stored values and let live, emergent durations
  // (notably physics springs) extend the authored timeline window. This only
  // re-runs when a value is edited — never merely because the clock ticks.
  const staticTimeline = useMemo(
    () => computeStaticTimeline(parsed, flatValues),
    [parsed, flatValues]
  );
  const timelineDuration = staticTimeline.duration;
  const staticClips = staticTimeline.clips;

  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const { enabled: loopEnabled, start: loopStart } = resolveTimelineLoop(options?.loop);

  const buildMeta = useCallback(
    () => buildTimelineMeta(
      panelId,
      name,
      timelineDuration,
      parsedRef.current,
      loopEnabled ? { from: loopStart } : false
    ),
    [panelId, name, timelineDuration, loopEnabled, loopStart]
  );

  // Transport registration mirrors the panel lifecycle: register on mount,
  // push structure changes without resetting the playhead. The register
  // effect reads buildMeta through a ref so meta changes (loop, structure)
  // flow through update() below instead of re-registering — a re-register
  // would reset the playhead.
  const buildMetaRef = useRef(buildMeta);
  buildMetaRef.current = buildMeta;
  useEffect(() => {
    TimelineStore.register(buildMetaRef.current(), { autoplay: optionsRef.current?.autoplay ?? true });
    return () => TimelineStore.unregister(panelId);
  }, [panelId]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    TimelineStore.update(buildMeta());
  }, [buildMeta, parsed]);

  const subscribeTransport = useCallback(
    (callback: () => void) => TimelineStore.subscribe(panelId, callback),
    [panelId]
  );
  const getTransport = useCallback(() => TimelineStore.getTransport(panelId), [panelId]);
  const transport = useSyncExternalStore(subscribeTransport, getTransport, getTransport);

  const play = useCallback(() => TimelineStore.play(panelId), [panelId]);
  const pause = useCallback(() => TimelineStore.pause(panelId), [panelId]);
  const replay = useCallback(() => TimelineStore.replay(panelId), [panelId]);
  const seek = useCallback((time: number) => TimelineStore.seek(panelId, time), [panelId]);

  // Frame pass: only the time-dependent fields, sampling cached curve params.
  return useMemo(
    () => buildTimelineValues<T>(staticClips, transport, timelineDuration, loopStart, {
      play,
      pause,
      replay,
      seek,
    }),
    [staticClips, transport, timelineDuration, loopStart, play, pause, replay, seek]
  );
}
