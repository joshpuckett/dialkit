import { DialStore } from '../store/DialStore';
import type { ControlMeta, DialValue, SpringConfig, TransitionConfig } from '../store/DialStore';

export type MidiStatus = 'idle' | 'connecting' | 'connected' | 'unsupported' | 'denied' | 'error';

export type MidiMessageEventLike = {
  data: ArrayLike<number>;
};

export type MidiInputLike = {
  readonly id: string;
  readonly name?: string | null;
  readonly manufacturer?: string | null;
  readonly state?: string;
  readonly connection?: string;
  addEventListener(type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void;
  removeEventListener(type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void;
  open?(): Promise<unknown>;
  close?(): Promise<unknown>;
};

export type MidiAccessLike = {
  readonly inputs: {
    values(): IterableIterator<MidiInputLike>;
  };
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
};

export type MidiInputInfo = {
  id: string;
  name: string | null;
  manufacturer: string | null;
  state: string | null;
  connection: string | null;
};

export type MidiBindingOptions = {
  /** Stable DialKit panel id (the `id` passed to useDialKit/createDialKit). */
  panelId: string;
  /** Dot path to a mappable control or compound numeric leaf, for example `transition.bounce`. */
  path: string;
  /** MIDI continuous-controller number, 0–127. */
  cc: number;
  /** MIDI channel, 1–16. Omit to accept every channel. */
  channel?: number;
  /** MIDI input id. Omit to accept every connected input. */
  inputId?: string;
  /** Output range. Defaults to the DialKit slider's current min/max. */
  min?: number;
  max?: number;
  /** Input CC range. Defaults to 0–127 and may be reversed. */
  midiMin?: number;
  midiMax?: number;
};

export type MidiBinding = Readonly<MidiBindingOptions & { id: string }>;

export type MidiLearnOptions = Omit<MidiBindingOptions, 'cc'>;

/**
 * Restricts which incoming message may complete a learn operation without
 * making the resulting binding device-specific. This is the appropriate filter
 * for UI-driven learning from a selected controller.
 */
export type MidiLearnSource = Readonly<{
  inputId?: string;
  channel?: number;
}>;

/** Opaque owner used only to protect shared mapping state during root cleanup. */
export type MidiMappingOwner = object | symbol;

/** The control scope currently in "map a control" mode. Null means every DialKit panel. */
export type MidiMappingState = Readonly<{ panelId: string | null }>;
export type MidiLearnWarning = Readonly<MidiLearnOptions & { message: string }>;

export type MidiControllerSnapshot = Readonly<{
  status: MidiStatus;
  inputs: readonly MidiInputInfo[];
  activeInputId: string | null;
  bindings: readonly MidiBinding[];
  learning: MidiLearnOptions | null;
  learningWarning: MidiLearnWarning | null;
  mapping: MidiMappingState | null;
  error: Error | null;
}>;

export type MidiControllerOptions = {
  /** Injection point for tests or non-window hosts. */
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
};

export const MIDI_CONTROLLER_DESCRIPTION = 'Select a controller, then map its controls to compatible parameters.';

export class MidiLearnCancelledError extends Error {
  constructor(message = 'MIDI learn cancelled') {
    super(message);
    this.name = 'MidiLearnCancelledError';
  }
}

export interface MidiController {
  connect(): Promise<boolean>;
  disconnect(): void;
  /** Whether the current DialKit panel schema exposes this path as a MIDI target. */
  canMapTarget(panelId: string, path: string): boolean;
  bind(options: MidiBindingOptions): MidiBinding;
  unbind(bindingOrId: MidiBinding | string): boolean;
  unbindTarget(panelId: string, path: string): number;
  unbindAll(): void;
  learn(options: MidiLearnOptions, source?: MidiLearnSource): Promise<MidiBinding>;
  cancelLearn(): boolean;
  /** Select the connected input used by the mapping UI. */
  selectInput(inputId: string): boolean;
  /** The current mapping for a target, if any. There is at most one per target. */
  getBindingForTarget(panelId: string, path: string): MidiBinding | undefined;
  /** Enter "map a control" mode. Omit panelId to reveal affordances across the DialKit root. */
  startMapping(panelId?: string, ownerToken?: MidiMappingOwner): void;
  /** Leave mapping mode and settle any pending learn. */
  stopMapping(ownerToken?: MidiMappingOwner): void;
  getSnapshot(): MidiControllerSnapshot;
  subscribe(listener: () => void): () => void;
}

type PendingLearn = {
  options: MidiLearnOptions;
  source: MidiLearnSource;
  resolve: (binding: MidiBinding) => void;
  reject: (error: Error) => void;
};

type InputRegistration = {
  input: MidiInputLike;
  listener: (event: MidiMessageEventLike) => void;
};

let nextBindingId = 1;

/**
 * Creates a framework-neutral Web MIDI controller for DialKit controls.
 * Calling this function is SSR-safe; browser permission is requested only by `connect()`.
 */
export function createMidiController(options: MidiControllerOptions = {}): MidiController {
  let status: MidiStatus = 'idle';
  let error: Error | null = null;
  let access: MidiAccessLike | null = null;
  let connectPromise: Promise<boolean> | null = null;
  let connectionEpoch = 0;
  let pendingLearn: PendingLearn | null = null;
  let learningWarning: MidiLearnWarning | null = null;
  let mapping: MidiMappingState | null = null;
  let mappingOwner: MidiMappingOwner | null = null;
  let activeInputId: string | null = null;

  const listeners = new Set<() => void>();
  const bindings = new Map<string, MidiBinding>();
  const lastRawValues = new Map<string, number>();
  const inputRegistrations = new Map<string, InputRegistration>();
  const pendingInputs = new Map<string, { input: MidiInputLike; token: symbol }>();
  type SyncResult = { candidateCount: number; openedCount: number; firstError: Error | null };
  let snapshot: MidiControllerSnapshot = Object.freeze({
    status,
    inputs: Object.freeze([]),
    activeInputId,
    bindings: Object.freeze([]),
    learning: null,
    learningWarning: null,
    mapping: null,
    error,
  });

  const reportSubscriberError = (reason: unknown) => {
    const reportError = (globalThis as { reportError?: (error: unknown) => void }).reportError;
    if (typeof reportError === 'function') reportError(reason);
    else console.error('DialKit MIDI subscriber failed', reason);
  };

  const notify = () => {
    snapshot = Object.freeze({
      status,
      inputs: Object.freeze(Array.from(inputRegistrations.values(), ({ input }) => inputInfo(input))),
      activeInputId,
      bindings: Object.freeze(Array.from(bindings.values())),
      learning: pendingLearn ? Object.freeze({ ...pendingLearn.options }) : null,
      learningWarning: learningWarning ? Object.freeze({ ...learningWarning }) : null,
      mapping: mapping ? Object.freeze({ ...mapping }) : null,
      error,
    });
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (reason) {
        reportSubscriberError(reason);
      }
    });
  };

  const stateChangeListener = () => {
    const epoch = connectionEpoch;
    void syncInputs().then((result) => {
      if (epoch !== connectionEpoch || !access || status === 'connecting') return;
      if (result.firstError) {
        // MIDI permission remains usable and any successfully opened inputs keep
        // working, but expose the failed port so the UI can offer a retry.
        error = result.firstError;
      } else {
        error = null;
      }
      status = 'connected';
      notify();
    });
  };

  const handleMessage = (input: MidiInputLike, event: MidiMessageEventLike) => {
    const message = parseControlChange(event.data);
    if (!message) {
      const channel = getChannelVoiceChannel(event.data);
      if (pendingLearn && channel !== null && learnMatches(pendingLearn.source, input.id, channel)) {
        learningWarning = {
          ...pendingLearn.options,
          message: 'Use a compatible control that sends MIDI CC.',
        };
        notify();
      }
      return;
    }

    if (pendingLearn && learnMatches(pendingLearn.source, input.id, message.channel)) {
      const learn = pendingLearn;
      const learnEpoch = connectionEpoch;
      const previousBindings = Array.from(bindings.values()).filter(
        (binding) => binding.panelId === learn.options.panelId && binding.path === learn.options.path
      );
      let learned: MidiBinding | null = null;
      let previousValue: DialValue | undefined;
      let target: MidiTarget | null = null;
      const rollback = () => {
        if (learned) {
          bindings.delete(learned.id);
          lastRawValues.delete(learned.id);
        }
        for (const binding of previousBindings) bindings.set(binding.id, binding);
        if (previousValue !== undefined && target) {
          try {
            target.restore(previousValue);
          } catch (reason) {
            reportSubscriberError(reason);
          }
        }
        notify();
      };

      try {
        target = getMidiTarget(learn.options.panelId, learn.options.path);
        if (target.kind !== 'continuous' && message.value < 64) {
          learningWarning = {
            ...learn.options,
            message: 'Press a button that sends a MIDI CC value of 64 or higher.',
          };
          notify();
          return;
        }
        // Device-agnostic by default: a learned mapping binds the CC only, never the
        // input id or channel of the controller that happened to send it. Any explicit
        // input/channel filter in the learn options is preserved via the spread.
        learned = bind({
          ...learn.options,
          cc: message.cc,
        });
        if (bindings.get(learned.id) !== learned) {
          const replacementExists = Array.from(bindings.values()).some(
            (binding) => binding.panelId === learn.options.panelId && binding.path === learn.options.path
          );
          if (!replacementExists) {
            for (const binding of previousBindings) bindings.set(binding.id, binding);
          }
          if (pendingLearn === learn) {
            pendingLearn = null;
            learningWarning = null;
            notify();
            learn.reject(new Error('MIDI learned binding was removed before completion'));
          }
          return;
        }
        if (pendingLearn !== learn || connectionEpoch !== learnEpoch || status !== 'connected') {
          rollback();
          return;
        }

        previousValue = target.read();
        lastRawValues.set(learned.id, message.value);
        if (target.kind === 'continuous') {
          target.write(scaleMidiValue(message.value, learned, target));
        }
        if (pendingLearn !== learn || connectionEpoch !== learnEpoch || status !== 'connected') {
          rollback();
          return;
        }

        pendingLearn = null;
        learningWarning = null;
        notify();
        learn.resolve(learned);
      } catch (reason) {
        if (learned) rollback();
        if (pendingLearn === learn) {
          pendingLearn = null;
          learningWarning = null;
          notify();
          learn.reject(toError(reason));
        }
      }
      return;
    }

    applyMessage(input.id, message.channel, message.cc, message.value);
  };

  function syncInputs(): Promise<SyncResult> {
    return syncInputsNow();
  }

  async function syncInputsNow(): Promise<SyncResult> {
    if (!access) return { candidateCount: 0, openedCount: 0, firstError: null };
    const activeAccess = access;
    const current = new Map<string, MidiInputLike>();
    for (const input of access.inputs.values()) current.set(input.id, input);

    for (const [id, registration] of inputRegistrations) {
      const next = current.get(id);
      if (!next || next !== registration.input || next.state === 'disconnected') {
        registration.input.removeEventListener('midimessage', registration.listener);
        void registration.input.close?.().catch(() => undefined);
        inputRegistrations.delete(id);
      }
    }
    for (const [id, pending] of pendingInputs) {
      if (current.get(id) !== pending.input || pending.input.state === 'disconnected') pendingInputs.delete(id);
    }

    const candidates = Array.from(current.values()).filter((input) => input.state !== 'disconnected');
    let firstError: Error | null = null;
    await Promise.all(candidates.map(async (input) => {
      if (inputRegistrations.get(input.id)?.input === input) return;
      if (pendingInputs.get(input.id)?.input === input) return;
      const ownership = { input, token: Symbol(input.id) };
      pendingInputs.set(input.id, ownership);
      try {
        await input.open?.();
      } catch (reason) {
        if (pendingInputs.get(input.id) === ownership) {
          pendingInputs.delete(input.id);
          firstError ??= toError(reason);
          await input.close?.().catch(() => undefined);
        } else {
          const newer = pendingInputs.get(input.id);
          const newerRegistration = inputRegistrations.get(input.id)?.input === input;
          if ((!newer || newer.input !== input) && !newerRegistration) {
            await input.close?.().catch(() => undefined);
          }
        }
        return;
      }
      if (pendingInputs.get(input.id) !== ownership) {
        const newer = pendingInputs.get(input.id);
        const newerRegistration = inputRegistrations.get(input.id)?.input === input;
        if ((!newer || newer.input !== input) && !newerRegistration) {
          void input.close?.().catch(() => undefined);
        }
        return;
      }
      pendingInputs.delete(input.id);
      if (
        access !== activeAccess
        || Array.from(activeAccess.inputs.values()).find((candidate) => candidate.id === input.id) !== input
        || input.state === 'disconnected'
      ) {
        void input.close?.().catch(() => undefined);
        return;
      }
      const currentRegistration = inputRegistrations.get(input.id);
      if (currentRegistration?.input === input) return;
      if (currentRegistration) {
        currentRegistration.input.removeEventListener('midimessage', currentRegistration.listener);
        void currentRegistration.input.close?.().catch(() => undefined);
      }
      const listener = (event: MidiMessageEventLike) => handleMessage(input, event);
      input.addEventListener('midimessage', listener);
      inputRegistrations.set(input.id, { input, listener });
    }));

    if (activeInputId && !inputRegistrations.has(activeInputId)) activeInputId = null;

    let interruptedLearn: PendingLearn | null = null;
    const learnInputId = pendingLearn?.source.inputId;
    if (learnInputId && !inputRegistrations.has(learnInputId)) {
      interruptedLearn = pendingLearn;
      pendingLearn = null;
      learningWarning = null;
    }

    notify();
    interruptedLearn?.reject(new MidiLearnCancelledError('Selected MIDI controller disconnected while learning'));
    return { candidateCount: candidates.length, openedCount: inputRegistrations.size, firstError };
  }

  function bind(bindingOptions: MidiBindingOptions): MidiBinding {
    validateBinding(bindingOptions);
    getMidiTarget(bindingOptions.panelId, bindingOptions.path);

    for (const [id, existing] of bindings) {
      if (existing.panelId === bindingOptions.panelId && existing.path === bindingOptions.path) {
        bindings.delete(id);
        lastRawValues.delete(id);
      }
    }

    const binding: MidiBinding = Object.freeze({
      ...bindingOptions,
      id: `midi-${nextBindingId++}`,
    });
    bindings.set(binding.id, binding);
    notify();
    return binding;
  }

  function applyMessage(inputId: string, channel: number, cc: number, rawValue: number): void {
    for (const binding of bindings.values()) {
      if (binding.cc !== cc) continue;
      if (binding.channel !== undefined && binding.channel !== channel) continue;
      if (binding.inputId !== undefined && binding.inputId !== inputId) continue;

      const target = findMidiTarget(binding.panelId, binding.path);
      if (!target) continue;
      if (target.kind === 'continuous') {
        target.write(scaleMidiValue(rawValue, binding, target));
        continue;
      }

      const previous = lastRawValues.get(binding.id) ?? 0;
      lastRawValues.set(binding.id, rawValue);
      if (previous < 64 && rawValue >= 64) target.activate();
    }
  }

  const controller: MidiController = {
    async connect(): Promise<boolean> {
      if (connectPromise) return connectPromise;
      if (status === 'connected' && access) {
        if (!error) return true;
        const epoch = connectionEpoch;
        const retry = syncInputs()
          .then((inputs) => {
            if (epoch !== connectionEpoch || !access) return false;
            error = inputs.firstError;
            status = 'connected';
            notify();
            return inputs.openedCount > 0 || inputs.candidateCount === 0;
          })
          .finally(() => {
            if (epoch === connectionEpoch) connectPromise = null;
          });
        connectPromise = retry;
        return retry;
      }

      const requestAccess = options.requestMIDIAccess ?? getBrowserMidiRequest();
      if (!requestAccess) {
        status = 'unsupported';
        error = null;
        notify();
        return false;
      }

      const epoch = ++connectionEpoch;
      status = 'connecting';
      error = null;

      let accessRequest: Promise<MidiAccessLike>;
      try {
        accessRequest = Promise.resolve(requestAccess());
      } catch (reason) {
        accessRequest = Promise.reject(reason);
      }

      const pending = accessRequest
        .then((nextAccess) => {
          if (epoch !== connectionEpoch) return false;
          access = nextAccess;
          access.addEventListener('statechange', stateChangeListener);
          return syncInputs().then((inputs) => {
            if (epoch !== connectionEpoch) return false;
            if (inputs.candidateCount > 0 && inputs.openedCount === 0 && inputs.firstError) {
              throw inputs.firstError;
            }
            status = 'connected';
            error = inputs.firstError;
            notify();
            return epoch === connectionEpoch && status === 'connected' && access === nextAccess;
          });
        })
        .catch((reason: unknown) => {
          if (epoch !== connectionEpoch) return false;
          for (const { input, listener } of inputRegistrations.values()) {
            input.removeEventListener('midimessage', listener);
            void input.close?.().catch(() => undefined);
          }
          inputRegistrations.clear();
          pendingInputs.clear();
          access?.removeEventListener('statechange', stateChangeListener);
          access = null;
          error = toError(reason);
          status = isPermissionError(error) ? 'denied' : 'error';
          notify();
          return false;
        })
        .finally(() => {
          if (epoch === connectionEpoch) connectPromise = null;
        });
      connectPromise = pending;

      notify();
      return pending;
    },

    disconnect(): void {
      connectionEpoch += 1;
      connectPromise = null;
      lastRawValues.clear();
      if (pendingLearn) {
        const { reject } = pendingLearn;
        pendingLearn = null;
        learningWarning = null;
        reject(new MidiLearnCancelledError('MIDI disconnected while learning'));
      }
      const inputsToClose = new Set<MidiInputLike>();
      for (const { input, listener } of inputRegistrations.values()) {
        input.removeEventListener('midimessage', listener);
        inputsToClose.add(input);
      }
      for (const { input } of pendingInputs.values()) inputsToClose.add(input);
      inputRegistrations.clear();
      pendingInputs.clear();
      for (const input of inputsToClose) void input.close?.().catch(() => undefined);
      access?.removeEventListener('statechange', stateChangeListener);
      access = null;
      status = 'idle';
      error = null;
      activeInputId = null;
      mapping = null;
      mappingOwner = null;
      notify();
    },

    canMapTarget(panelId: string, path: string): boolean {
      return findMidiTarget(panelId, path) !== null;
    },

    bind,

    unbind(bindingOrId: MidiBinding | string): boolean {
      const id = typeof bindingOrId === 'string' ? bindingOrId : bindingOrId.id;
      const removed = bindings.delete(id);
      if (removed) lastRawValues.delete(id);
      if (removed) notify();
      return removed;
    },

    unbindTarget(panelId: string, path: string): number {
      let removed = 0;
      for (const [id, binding] of bindings) {
        if (binding.panelId === panelId && binding.path === path) {
          bindings.delete(id);
          lastRawValues.delete(id);
          removed += 1;
        }
      }
      if (removed > 0) notify();
      return removed;
    },

    unbindAll(): void {
      if (bindings.size === 0) return;
      bindings.clear();
      lastRawValues.clear();
      notify();
    },

    learn(learnOptions: MidiLearnOptions, learnSource: MidiLearnSource = {}): Promise<MidiBinding> {
      if (status !== 'connected') {
        return Promise.reject(new Error('Connect MIDI before starting learn mode'));
      }
      validateLearnOptions(learnOptions);
      validateLearnSource(learnSource);
      getMidiTarget(learnOptions.panelId, learnOptions.path);
      const source: MidiLearnSource = Object.freeze({
        inputId: learnSource.inputId ?? learnOptions.inputId,
        channel: learnSource.channel ?? learnOptions.channel,
      });
      if (source.inputId !== undefined && !inputRegistrations.has(source.inputId)) {
        return Promise.reject(new Error(`MIDI learn source is not connected: ${source.inputId}`));
      }
      if (pendingLearn) {
        pendingLearn.reject(new MidiLearnCancelledError('Superseded by another MIDI learn request'));
      }
      return new Promise<MidiBinding>((resolve, reject) => {
        pendingLearn = { options: { ...learnOptions }, source, resolve, reject };
        learningWarning = null;
        notify();
      });
    },

    cancelLearn(): boolean {
      if (!pendingLearn) return false;
      const { reject } = pendingLearn;
      pendingLearn = null;
      learningWarning = null;
      notify();
      reject(new MidiLearnCancelledError());
      return true;
    },

    selectInput(inputId: string): boolean {
      if (!inputRegistrations.has(inputId)) return false;
      if (activeInputId === inputId) return true;
      const stale = pendingLearn;
      pendingLearn = null;
      learningWarning = null;
      activeInputId = inputId;
      notify();
      stale?.reject(new MidiLearnCancelledError('Active MIDI controller changed'));
      return true;
    },

    getBindingForTarget(panelId: string, path: string): MidiBinding | undefined {
      for (const binding of bindings.values()) {
        if (binding.panelId === panelId && binding.path === path) return binding;
      }
      return undefined;
    },

    startMapping(panelId?: string, ownerToken?: MidiMappingOwner): void {
      const scope = panelId ?? null;
      if (mapping?.panelId === scope) {
        if (ownerToken !== undefined) mappingOwner = ownerToken;
        return;
      }
      // Switching the mapped panel abandons a learn that targeted the old one.
      const stale = pendingLearn;
      pendingLearn = null;
      learningWarning = null;
      mapping = { panelId: scope };
      mappingOwner = ownerToken ?? null;
      notify();
      stale?.reject(new MidiLearnCancelledError('MIDI mapping target changed'));
    },

    stopMapping(ownerToken?: MidiMappingOwner): void {
      if (ownerToken !== undefined && mappingOwner !== ownerToken) return;
      if (!mapping && !pendingLearn) return;
      const stale = pendingLearn;
      pendingLearn = null;
      learningWarning = null;
      mapping = null;
      mappingOwner = null;
      notify();
      stale?.reject(new MidiLearnCancelledError('MIDI mapping stopped'));
    },

    getSnapshot(): MidiControllerSnapshot {
      return snapshot;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return controller;
}

let sharedController: MidiController | null = null;

/**
 * Returns the process-wide shared MIDI controller. Every DialKit root that opts in
 * with `midi` (without passing its own controller) reuses this instance, so a single
 * Web MIDI connection and one set of mappings back the whole app. Mounting or
 * unmounting a root never disconnects the others — roots only subscribe, they never
 * call `disconnect()`. SSR-safe: creation requests no browser permission.
 */
export function getSharedMidiController(): MidiController {
  return (sharedController ??= createMidiController());
}

/** Settles one Escape keypress for the panel or root that owns the active MIDI UI state. */
export function handleMidiEscape(
  event: KeyboardEvent,
  controller: MidiController,
  panelId: string | null,
  menuOpen: boolean,
  closeMenu: () => void
): boolean {
  const handledEvent = event as KeyboardEvent & { __dialkitMidiEscapeHandled?: boolean };
  if (handledEvent.__dialkitMidiEscapeHandled) return false;

  const current = controller.getSnapshot();
  const ownsLearning = panelId === null ? current.learning !== null : current.learning?.panelId === panelId;
  const ownsMapping = panelId === null ? current.mapping !== null : current.mapping?.panelId === panelId;
  if (current.learning && !ownsLearning) return false;
  if (current.mapping && !ownsMapping) return false;

  if (ownsLearning) {
    handledEvent.__dialkitMidiEscapeHandled = true;
    controller.cancelLearn();
    return true;
  }
  if (ownsMapping) {
    handledEvent.__dialkitMidiEscapeHandled = true;
    controller.stopMapping();
    if (menuOpen) closeMenu();
    return true;
  }
  if (menuOpen) {
    handledEvent.__dialkitMidiEscapeHandled = true;
    closeMenu();
    return true;
  }
  return false;
}

export type MidiBadgeState = 'select' | 'listening' | 'warning' | 'bound';

/**
 * Pure view helper: the mapping badge to show on a numeric control, derived from a
 * snapshot. Shared by every framework adapter so the four slider badges stay
 * identical. Returns null when no badge should be shown.
 */
export function midiTargetBadge(
  snapshot: MidiControllerSnapshot,
  panelId: string,
  path: string
): { state: MidiBadgeState; cc: number | null } | null {
  const { learning } = snapshot;
  if (snapshot.learningWarning?.panelId === panelId && snapshot.learningWarning.path === path) {
    return { state: 'warning', cc: null };
  }
  if (learning && learning.panelId === panelId && learning.path === path) {
    return { state: 'listening', cc: null };
  }
  const binding = snapshot.bindings.find((entry) => entry.panelId === panelId && entry.path === path);
  if (binding) return { state: 'bound', cc: binding.cc };
  if (snapshot.mapping && (snapshot.mapping.panelId === null || snapshot.mapping.panelId === panelId)) {
    return { state: 'select', cc: null };
  }
  return null;
}

export type MidiConnectionAction = 'map' | 'retry';

/**
 * Pure view helper: the connection status line + primary action for the MIDI menu,
 * derived from a snapshot. Shared by every framework adapter. When connected, the
 * label uses the active input's Web MIDI manufacturer/name metadata when available.
 */
export function midiConnectionView(snapshot: MidiControllerSnapshot): {
  status: MidiStatus;
  label: string;
  action: MidiConnectionAction | null;
  actionLabel: string | null;
  connected: boolean;
  deviceCount: number;
  activeInputLabel: string | null;
} {
  const deviceCount = snapshot.inputs.length;
  const activeInput = snapshot.inputs.find((input) => input.id === snapshot.activeInputId);
  const activeInputLabel = activeInput ? midiInputDisplayName(activeInput) ?? 'MIDI controller' : null;
  const firstDeviceName = (activeInput ? [activeInput] : snapshot.inputs)
    .map(midiInputDisplayName)
    .find((name): name is string => name !== null);
  switch (snapshot.status) {
    case 'connected':
      return {
        status: snapshot.status,
        label: deviceCount === 0
          ? 'No controllers'
          : !activeInput
            ? `${deviceCount} controller${deviceCount === 1 ? '' : 's'} detected`
            : deviceCount === 1
              ? firstDeviceName ?? '1 controller'
            : firstDeviceName
              ? `${firstDeviceName} +${deviceCount - 1}`
              : `${deviceCount} controllers`,
        action: snapshot.error ? 'retry' : null,
        actionLabel: snapshot.error ? 'Retry unavailable controllers' : null,
        connected: true,
        deviceCount,
        activeInputLabel,
      };
    case 'connecting':
      return { status: snapshot.status, label: 'Connecting…', action: null, actionLabel: null, connected: false, deviceCount, activeInputLabel: null };
    case 'denied':
      return { status: snapshot.status, label: 'MIDI permission was denied.', action: 'retry', actionLabel: 'Try Again', connected: false, deviceCount, activeInputLabel: null };
    case 'error':
      return { status: snapshot.status, label: 'Could not access MIDI.', action: 'retry', actionLabel: 'Try Again', connected: false, deviceCount, activeInputLabel: null };
    case 'unsupported':
      return { status: snapshot.status, label: 'Web MIDI is not supported in this browser.', action: null, actionLabel: null, connected: false, deviceCount, activeInputLabel: null };
    case 'idle':
    default:
      return { status: snapshot.status, label: 'No controller access', action: 'map', actionLabel: 'Allow MIDI access', connected: false, deviceCount, activeInputLabel: null };
  }
}

export function scaleMidiValue(rawValue: number, binding: MidiBindingOptions, control: Pick<ControlMeta, 'min' | 'max' | 'step'>): number {
  const controlMin = control.min ?? 0;
  const controlMax = control.max ?? 1;
  const midiMin = binding.midiMin ?? 0;
  const midiMax = binding.midiMax ?? 127;
  const clampedMidi = clamp(rawValue, Math.min(midiMin, midiMax), Math.max(midiMin, midiMax));
  const normalized = (clampedMidi - midiMin) / (midiMax - midiMin);
  const outputMin = binding.min ?? controlMin;
  const outputMax = binding.max ?? controlMax;
  const scaled = outputMin + normalized * (outputMax - outputMin);
  const clampedOutput = clamp(scaled, Math.min(controlMin, controlMax), Math.max(controlMin, controlMax));

  if (!control.step || control.step <= 0) return clampedOutput;
  const snapped = controlMin + Math.round((clampedOutput - controlMin) / control.step) * control.step;
  return clamp(roundForStep(snapped, control.step), Math.min(controlMin, controlMax), Math.max(controlMin, controlMax));
}

function getBrowserMidiRequest(): (() => Promise<MidiAccessLike>) | null {
  const nav = (globalThis as { navigator?: { requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<unknown> } }).navigator;
  if (!nav?.requestMIDIAccess) return null;
  return () => nav.requestMIDIAccess!({ sysex: false }) as Promise<MidiAccessLike>;
}

function parseControlChange(data: ArrayLike<number>): { channel: number; cc: number; value: number } | null {
  if (data.length < 3) return null;
  const statusByte = Number(data[0]);
  const cc = Number(data[1]);
  const value = Number(data[2]);
  if (!Number.isFinite(statusByte) || (statusByte & 0xf0) !== 0xb0) return null;
  if (!Number.isFinite(cc) || !Number.isFinite(value)) return null;
  return {
    channel: (statusByte & 0x0f) + 1,
    cc: clamp(Math.trunc(cc), 0, 127),
    value: clamp(value, 0, 127),
  };
}

function getChannelVoiceChannel(data: ArrayLike<number>): number | null {
  if (data.length < 1) return null;
  const statusByte = Number(data[0]);
  return Number.isFinite(statusByte) && statusByte >= 0x80 && statusByte <= 0xef
    ? (statusByte & 0x0f) + 1
    : null;
}

function validateBinding(options: MidiBindingOptions): void {
  validateLearnOptions(options);
  if (!Number.isInteger(options.cc) || options.cc < 0 || options.cc > 127) {
    throw new RangeError('MIDI CC must be an integer from 0 to 127');
  }
}

function validateLearnOptions(options: MidiLearnOptions): void {
  if (!options.panelId || !options.path) throw new Error('MIDI mappings require panelId and path');
  if (options.channel !== undefined && (!Number.isInteger(options.channel) || options.channel < 1 || options.channel > 16)) {
    throw new RangeError('MIDI channel must be an integer from 1 to 16');
  }
  for (const [name, value] of Object.entries({ min: options.min, max: options.max, midiMin: options.midiMin, midiMax: options.midiMax })) {
    if (value !== undefined && !Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  }
  const midiMin = options.midiMin ?? 0;
  const midiMax = options.midiMax ?? 127;
  if (midiMin < 0 || midiMin > 127 || midiMax < 0 || midiMax > 127) {
    throw new RangeError('midiMin and midiMax must be between 0 and 127');
  }
  if (midiMin === midiMax) throw new RangeError('midiMin and midiMax must be different');
}

function validateLearnSource(source: MidiLearnSource): void {
  if (source.inputId !== undefined && !source.inputId) {
    throw new Error('MIDI learn source inputId must not be empty');
  }
  if (source.channel !== undefined && (!Number.isInteger(source.channel) || source.channel < 1 || source.channel > 16)) {
    throw new RangeError('MIDI learn source channel must be an integer from 1 to 16');
  }
}

type MidiTargetKind = 'continuous' | 'toggle' | 'action';

type MidiTarget = Pick<ControlMeta, 'min' | 'max' | 'step'> & {
  kind: MidiTargetKind;
  read(): DialValue | undefined;
  write(value: number): void;
  restore(value: DialValue): void;
  activate(): void;
};

const compoundTargetRanges: Record<string, { min: number; max: number; step: number }> = {
  bounce: { min: 0, max: 1, step: 0.05 },
  duration: { min: 0.1, max: 2, step: 0.05 },
  stiffness: { min: 1, max: 1000, step: 10 },
  damping: { min: 1, max: 100, step: 1 },
  mass: { min: 0.1, max: 10, step: 0.1 },
  x1: { min: 0, max: 1, step: 0.01 },
  y1: { min: -1, max: 2, step: 0.01 },
  x2: { min: 0, max: 1, step: 0.01 },
  y2: { min: -1, max: 2, step: 0.01 },
};

const easingLeafIndexes: Partial<Record<string, 0 | 1 | 2 | 3>> = {
  x1: 0,
  y1: 1,
  x2: 2,
  y2: 3,
};

function getMidiTarget(panelId: string, path: string): MidiTarget {
  const target = findMidiTarget(panelId, path);
  if (!target) throw new Error(`DialKit MIDI target not found: ${panelId}.${path}`);
  return target;
}

function findMidiTarget(panelId: string, path: string): MidiTarget | null {
  const controls = DialStore.getPanel(panelId)?.controls;
  if (!controls) return null;
  const control = findControl(controls, path);
  if (control?.type === 'slider') {
    return {
      kind: 'continuous',
      min: control.min,
      max: control.max,
      step: control.step,
      read: () => DialStore.getValue(panelId, path),
      write: (value) => DialStore.updateValue(panelId, path, value),
      restore: (value) => DialStore.updateValue(panelId, path, value),
      activate: () => undefined,
    };
  }
  if (control?.type === 'toggle') {
    return {
      kind: 'toggle',
      read: () => DialStore.getValue(panelId, path),
      write: () => undefined,
      restore: (value) => DialStore.updateValue(panelId, path, value),
      activate: () => DialStore.updateValue(panelId, path, !Boolean(DialStore.getValue(panelId, path))),
    };
  }
  if (control?.type === 'action') {
    return {
      kind: 'action',
      read: () => undefined,
      write: () => undefined,
      restore: () => undefined,
      activate: () => DialStore.triggerAction(panelId, path),
    };
  }
  if (control?.type === 'select' && control.options && control.options.length > 1) {
    const optionValues = control.options.map((option) => typeof option === 'string' ? option : option.value);
    return {
      kind: 'continuous',
      min: 0,
      max: optionValues.length - 1,
      step: 1,
      read: () => DialStore.getValue(panelId, path),
      write: (value) => DialStore.updateValue(panelId, path, optionValues[Math.round(value)]),
      restore: (value) => DialStore.updateValue(panelId, path, value),
      activate: () => undefined,
    };
  }

  const separator = path.lastIndexOf('.');
  if (separator < 0) return null;
  const parentPath = path.slice(0, separator);
  const leaf = path.slice(separator + 1);
  const range = compoundTargetRanges[leaf];
  if (!range) return null;
  const parent = findControl(controls, parentPath);
  if (!parent || (parent.type !== 'spring' && parent.type !== 'transition')) return null;

  const getCompound = () => DialStore.getValue(panelId, parentPath) as TransitionConfig | undefined;
  const currentCompound = getCompound();
  const targetRange = leaf === 'duration' && currentCompound?.type === 'spring'
    ? { ...range, max: 1 }
    : range;
  return {
    kind: 'continuous',
    ...targetRange,
    read: () => getCompound(),
    write: (value) => {
      const current = getCompound();
      if (!current || typeof current !== 'object') return;
      const easingIndex = easingLeafIndexes[leaf];
      if (easingIndex !== undefined) {
        if (current.type !== 'easing') return;
        const ease = [...current.ease] as [number, number, number, number];
        ease[easingIndex] = value;
        DialStore.updateValue(panelId, parentPath, { ...current, ease });
        return;
      }
      if (leaf === 'duration') {
        if (current.type === 'easing') {
          DialStore.updateValue(panelId, parentPath, { ...current, duration: value });
        } else if (current.visualDuration !== undefined) {
          DialStore.updateValue(panelId, parentPath, { ...current, visualDuration: value });
        }
        return;
      }
      if (current.type !== 'spring') return;
      const isPhysicsLeaf = leaf === 'stiffness' || leaf === 'damping' || leaf === 'mass';
      if (isPhysicsLeaf && current.stiffness === undefined) return;
      if (leaf === 'bounce' && current.visualDuration === undefined) return;
      DialStore.updateValue(panelId, parentPath, { ...current, [leaf]: value } as SpringConfig);
    },
    restore: (value) => DialStore.updateValue(panelId, parentPath, value),
    activate: () => undefined,
  };
}

function findControl(controls: ControlMeta[], path: string): ControlMeta | null {
  for (const control of controls) {
    if (control.path === path) return control;
    if (control.children) {
      const found = findControl(control.children, path);
      if (found) return found;
    }
  }
  return null;
}

function learnMatches(options: MidiLearnSource, inputId: string, channel: number): boolean {
  return (options.inputId === undefined || options.inputId === inputId)
    && (options.channel === undefined || options.channel === channel);
}

function inputInfo(input: MidiInputLike): MidiInputInfo {
  return {
    id: input.id,
    name: input.name ?? null,
    manufacturer: input.manufacturer ?? null,
    state: input.state ?? null,
    connection: input.connection ?? null,
  };
}

export function midiInputDisplayName(input: Pick<MidiInputInfo, 'name' | 'manufacturer'>): string | null {
  const name = input.name?.trim() || null;
  const manufacturer = input.manufacturer?.trim() || null;
  if (!name) return manufacturer;
  if (!manufacturer || name.toLocaleLowerCase().includes(manufacturer.toLocaleLowerCase())) return name;
  return `${manufacturer} ${name}`;
}

function isPermissionError(error: Error): boolean {
  return error.name === 'NotAllowedError' || error.name === 'SecurityError';
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundForStep(value: number, step: number): number {
  return Number(value.toPrecision(15));
}
