import { computed, onMounted, onUnmounted, shallowRef, watch, type ComputedRef } from 'vue';
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

export type UseDialTimelineOptions = DialTimelineOptions;

let timelineInstance = 0;

export function useDialTimeline<T extends TimelineConfig>(
  name: string,
  config: T,
  options?: UseDialTimelineOptions
): ComputedRef<DialTimelineValues<T>> {
  const hasStableId = options?.id !== undefined;
  // Not derived from the name: renaming a panel must not discard its tuned values.
  const panelId = options?.id ?? `dialkit-timeline-${++timelineInstance}`;
  // 2.1's generated id, so data it saved for a timeline without an id still loads.
  const legacyId = `${name}-${timelineInstance}`;
  const serializedConfig = computed(() => JSON.stringify(config));
  const serializedPersist = computed(() => JSON.stringify(options?.persist));
  const serializedLoop = computed(() => JSON.stringify(options?.loop));
  const parsed = computed(() => {
    serializedConfig.value;
    return parseTimelineConfig(config);
  });
  const flatValues = shallowRef(DialStore.getValues(panelId));
  const transport = shallowRef(TimelineStore.getTransport(panelId));
  const staticTimeline = computed(() => computeStaticTimeline(parsed.value, flatValues.value));
  const meta = computed(() => {
    serializedLoop.value;
    return buildTimelineMeta(
      panelId,
      name,
      staticTimeline.value.duration,
      parsed.value,
      options?.loop
    );
  });
  let mounted = false;
  let unsubscribeValues: (() => void) | undefined;
  let unsubscribeTransport: (() => void) | undefined;

  const play = () => TimelineStore.play(panelId);
  const pause = () => TimelineStore.pause(panelId);
  const replay = () => TimelineStore.replay(panelId);
  const seek = (time: number) => TimelineStore.seek(panelId, time);

  watch([serializedConfig, serializedPersist], () => {
    if (!mounted) return;
    DialStore.updatePanel(panelId, name, parsed.value.dialConfig, undefined, {
      retainOnUnmount: hasStableId,
      legacyId,
      persist: options?.persist,
      kind: 'timeline',
    });
    flatValues.value = DialStore.getValues(panelId);
  });

  watch(meta, (nextMeta) => {
    if (mounted) TimelineStore.update(nextMeta);
  });

  onMounted(() => {
    unsubscribeValues = DialStore.subscribe(panelId, () => {
      flatValues.value = DialStore.getValues(panelId);
    });
    unsubscribeTransport = TimelineStore.subscribe(panelId, () => {
      transport.value = TimelineStore.getTransport(panelId);
    });

    DialStore.registerPanel(panelId, name, parsed.value.dialConfig, undefined, {
      retainOnUnmount: hasStableId,
      legacyId,
      persist: options?.persist,
      kind: 'timeline',
    });
    flatValues.value = DialStore.getValues(panelId);
    TimelineStore.register(meta.value, { autoplay: options?.autoplay ?? true });
    transport.value = TimelineStore.getTransport(panelId);
    mounted = true;
  });

  onUnmounted(() => {
    if (!mounted) return;
    mounted = false;
    unsubscribeValues?.();
    unsubscribeTransport?.();
    TimelineStore.unregister(panelId);
    DialStore.unregisterPanel(panelId);
  });

  return computed(() => {
    const currentStatic = staticTimeline.value;
    return buildTimelineValues<T>(
      currentStatic.clips,
      transport.value,
      currentStatic.duration,
      resolveTimelineLoop(options?.loop).start,
      { play, pause, replay, seek }
    );
  });
}
