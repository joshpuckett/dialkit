import { defineComponent, inject, onMounted, onUnmounted, provide, ref, type InjectionKey, type Ref } from 'vue';
import { mountShortcutListener, subscribeShortcut } from '../../shortcut-utils';

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

    let listener: ReturnType<typeof mountShortcutListener> | undefined;
    let stop: (() => void) | undefined;

    onMounted(() => {
      listener = mountShortcutListener();
      stop = subscribeShortcut((target) => {
        activePanelId.value = target?.panelId ?? null;
        activePath.value = target?.path ?? null;
      });
    });

    onUnmounted(() => {
      stop?.();
      listener?.destroy();
    });

    return () => slots.default?.();
  },
});
