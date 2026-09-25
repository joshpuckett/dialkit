import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { DialStore } from '../store/DialStore';
import type { DialStorePanelOptions } from '../store/DialStore';
import { TimelineStore, type TimelineTransport } from '../store/TimelineStore';
import { buildTimelineMeta, buildTimelineValues, computeStaticTimeline, parseTimelineConfig, resolveTimelineLoop, type DialTimelineOptions, type DialTimelineValues, type TimelineConfig } from '../timeline';
export type CreateDialTimelineOptions = DialTimelineOptions;
let nextId = 0;
/**
 * A timeline bound to a Lit host. Registered while the host is connected; each transport
 * tick and timing edit requests a host update, so `values` can be read in `render()`.
 */
export class DialTimelineController<T extends TimelineConfig> implements ReactiveController {
  readonly id: string;
  private parsed;
  private compiled;
  private connected = false;
  private stopValues?: () => void;
  private stopTransport?: () => void;
  private cache?: { compiled: ReturnType<typeof computeStaticTimeline>; transport: TimelineTransport; values: DialTimelineValues<T> };
  private readonly registration: DialStorePanelOptions;
  private readonly actions = {
    play: () => TimelineStore.play(this.id),
    pause: () => TimelineStore.pause(this.id),
    replay: () => TimelineStore.replay(this.id),
    seek: (time: number) => TimelineStore.seek(this.id, time),
  };
  constructor(private readonly host: ReactiveControllerHost, private readonly name: string, config: T, private readonly options: CreateDialTimelineOptions = {}) {
    this.id = options.id ?? `lit-timeline-${name}-${++nextId}`;
    this.parsed = parseTimelineConfig(config);
    this.compiled = computeStaticTimeline(this.parsed, DialStore.getValues(this.id));
    this.registration = { retainOnUnmount: options.id !== undefined, persist: options.persist, kind: 'timeline' };
    host.addController(this);
  }
  hostConnected() {
    if (this.connected)
      return;
    DialStore.registerPanel(this.id, this.name, this.parsed.dialConfig, undefined, this.registration);
    try {
      this.compiled = computeStaticTimeline(this.parsed, DialStore.getValues(this.id));
    } catch (error) {
      DialStore.unregisterPanel(this.id);
      throw error;
    }
    try {
      TimelineStore.register(this.meta(), { autoplay: this.options.autoplay ?? true });
    } catch (error) {
      // The store counts the registration before it notifies, so a throw here comes from a
      // subscriber after acquisition. Release both registrations even if that subscriber throws again.
      try {
        TimelineStore.unregister(this.id);
      } finally {
        DialStore.unregisterPanel(this.id);
      }
      throw error;
    }
    this.connected = true;
    this.stopValues = DialStore.subscribe(this.id, () => {
      this.compiled = computeStaticTimeline(this.parsed, DialStore.getValues(this.id));
      // Updating the meta notifies the transport subscription, which requests the host update.
      TimelineStore.update(this.meta());
    });
    this.stopTransport = TimelineStore.subscribe(this.id, () => this.host.requestUpdate());
    this.host.requestUpdate();
  }
  hostDisconnected() {
    if (!this.connected)
      return;
    this.connected = false;
    this.stopValues?.();
    this.stopTransport?.();
    this.stopValues = this.stopTransport = undefined;
    TimelineStore.unregister(this.id);
    DialStore.unregisterPanel(this.id);
  }
  private meta() {
    return buildTimelineMeta(this.id, this.name, this.compiled.duration, this.parsed, this.options.loop);
  }
  /** Sampled clip values plus transport state and controls, cached per frame and per timing edit. */
  get values(): DialTimelineValues<T> {
    const transport = TimelineStore.getTransport(this.id);
    if (!this.cache || this.cache.compiled !== this.compiled || this.cache.transport !== transport)
      this.cache = { compiled: this.compiled, transport, values: buildTimelineValues<T>(this.compiled.clips, transport, this.compiled.duration, resolveTimelineLoop(this.options.loop).start, this.actions) };
    return this.cache.values;
  }
  getValues(): DialTimelineValues<T> {
    return this.values;
  }
  play() {
    this.actions.play();
  }
  pause() {
    this.actions.pause();
  }
  replay() {
    this.actions.replay();
  }
  seek(time: number) {
    this.actions.seek(time);
  }
  updateConfig(next: T) {
    this.parsed = parseTimelineConfig(next);
    if (this.connected)
      DialStore.updatePanel(this.id, this.name, this.parsed.dialConfig, undefined, this.registration);
    else
      this.compiled = computeStaticTimeline(this.parsed, DialStore.getValues(this.id));
    this.host.requestUpdate();
  }
}
export function createDialTimeline<T extends TimelineConfig>(host: ReactiveControllerHost, name: string, config: T, options?: CreateDialTimelineOptions): DialTimelineController<T> {
  return new DialTimelineController(host, name, config, options);
}
