import { defineComponent, inject, onMounted, onUnmounted, provide, ref, type InjectionKey, type Ref } from 'vue';
import { mountShortcutListener, subscribeShortcut } from '../../shortcut-listener';

export interface ShortcutState {
  activePanelId: Ref<string | null>;
  activePath: Ref<string | null>;
}

export const ShortcutKey: InjectionKey<ShortcutState> = Symbol('DialKitShortcut');

export function useShortcutContext(): ShortcutState {
  return inject(ShortcutKey, {
    activePanelId: ref(null),
    activePath: ref(null),
  });
}

export const ShortcutListener = defineComponent({
  name: 'DialKitShortcutListener',
  setup(_, { slots }) {
    const activePanelId = ref<string | null>(null);
    const activePath = ref<string | null>(null);

    provide(ShortcutKey, { activePanelId, activePath });

    // Every root shares one window listener, so two roots never apply a shortcut twice.
    let stop: (() => void) | undefined;
    onMounted(() => {
      const listener = mountShortcutListener();
      const unsubscribe = subscribeShortcut((target) => {
        activePanelId.value = target?.panelId ?? null;
        activePath.value = target?.path ?? null;
      });
      stop = () => {
        unsubscribe();
        listener.destroy();
      };
    });

    onUnmounted(() => stop?.());

    return () => slots.default?.();
  },
});
