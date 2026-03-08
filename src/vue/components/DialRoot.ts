import { defineComponent, h, onMounted, onUnmounted, ref, Teleport } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig } from '../../store/DialStore';
import { Panel } from './Panel';

export type DialPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type DialMode = 'popover' | 'inline';

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

    const renderContent = () => h('div', { class: 'dialkit-root', 'data-mode': props.mode }, [
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
    ]);

    return () => {
      if (!mounted.value || typeof window === 'undefined' || panels.value.length === 0) {
        return null;
      }

      if (props.mode === 'inline') {
        return renderContent();
      }

      return h(Teleport, { to: 'body' }, renderContent());
    };
  },
});
