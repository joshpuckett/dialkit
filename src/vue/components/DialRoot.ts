import { defineComponent, h, onMounted, onUnmounted, ref, Teleport } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { Panel } from './Panel';
import { ShortcutListener } from './ShortcutListener';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';

declare const process: { env?: { NODE_ENV?: string } } | undefined;

const isDevDefault = typeof process !== 'undefined' && process?.env?.NODE_ENV
  ? process.env.NODE_ENV !== 'production'
  : typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE
    ? (import.meta as any).env.MODE !== 'production'
    : true;

export const DialRoot = defineComponent({
  name: 'DialKitDialRoot',
  props: {
    position: {
      type: String as () => DialPosition,
      default: 'top-right',
    },
    defaultOpen: {
      type: Boolean,
      default: true,
    },
    mode: {
      type: String as () => DialMode,
      default: 'popover',
    },
    productionEnabled: {
      type: Boolean,
      default: isDevDefault,
    },
  },
  setup(props) {
    const panels = ref<PanelConfig[]>([]);
    const mounted = ref(false);
    let unsubscribe: (() => void) | undefined;

    onMounted(() => {
      mounted.value = true;
      panels.value = DialStore.getPanels();
      unsubscribe = DialStore.subscribeGlobal(() => {
        panels.value = DialStore.getPanels();
      });
    });

    onUnmounted(() => {
      unsubscribe?.();
    });

    const renderContent = () => h(ShortcutListener, null, {
      default: () => h('div', { class: 'dialkit-root', 'data-mode': props.mode }, [
        h('div', {
          class: 'dialkit-panel',
          'data-position': props.mode === 'inline' ? undefined : props.position,
          'data-mode': props.mode,
        }, panels.value.map((panel) => h(Panel, {
          key: panel.id,
          panel,
          defaultOpen: props.mode === 'inline' || props.defaultOpen,
          inline: props.mode === 'inline',
        }))),
      ]),
    });

    return () => {
      if (!props.productionEnabled || !mounted.value || typeof window === 'undefined' || panels.value.length === 0) {
        return null;
      }

      if (props.mode === 'inline') {
        return renderContent();
      }

      return h(Teleport, { to: 'body' }, renderContent());
    };
  },
});
