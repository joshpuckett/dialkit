import {
  createApp,
  defineComponent,
  h,
  shallowRef,
  type App,
  type ObjectDirective,
  type ShallowRef,
} from 'vue';
import { DialRoot, type DialMode, type DialPosition } from '../components/DialRoot';

export interface DialKitDirectiveOptions {
  position?: DialPosition;
  defaultOpen?: boolean;
  mode?: DialMode;
}

export type DialKitDirectiveValue = DialMode | DialKitDirectiveOptions | undefined;

type DirectiveState = {
  app: App;
  host: HTMLDivElement;
  props: ShallowRef<DialKitDirectiveOptions>;
};

const states = new WeakMap<HTMLElement, DirectiveState>();

function normalizeDirectiveValue(value: DialKitDirectiveValue): DialKitDirectiveOptions {
  if (!value) return {};
  if (value === 'inline' || value === 'popover') {
    return { mode: value };
  }
  return value;
}

function mountDialRoot(el: HTMLElement, value: DialKitDirectiveValue) {
  if (typeof window === 'undefined') return;

  const host = document.createElement('div');
  el.appendChild(host);

  const props = shallowRef<DialKitDirectiveOptions>(normalizeDirectiveValue(value));
  const RootHost = defineComponent({
    name: 'DialKitDirectiveHost',
    setup() {
      return () => h(DialRoot, props.value);
    },
  });

  const app = createApp(RootHost);
  app.mount(host);

  states.set(el, { app, host, props });
}

function unmountDialRoot(el: HTMLElement) {
  const state = states.get(el);
  if (!state) return;

  state.app.unmount();
  state.host.remove();
  states.delete(el);
}

export const vDialKit: ObjectDirective<HTMLElement, DialKitDirectiveValue> = {
  mounted(el, binding) {
    mountDialRoot(el, binding.value);
  },
  updated(el, binding) {
    const state = states.get(el);
    if (!state) {
      mountDialRoot(el, binding.value);
      return;
    }
    state.props.value = normalizeDirectiveValue(binding.value);
  },
  beforeUnmount(el) {
    unmountDialRoot(el);
  },
};
