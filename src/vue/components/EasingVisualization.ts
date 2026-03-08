import { defineComponent, h, computed, type PropType } from 'vue';
import type { EasingConfig } from '../../store/DialStore';

export const EasingVisualization = defineComponent({
  name: 'DialKitEasingVisualization',
  props: {
    easing: {
      type: Object as PropType<EasingConfig>,
      required: true,
    },
  },
  setup(props) {
    const width = 256;
    const height = 140;

    const curve = computed(() => {
      const [x1, y1, x2, y2] = props.easing.ease;
      return `M 0 ${height} C ${x1 * width} ${height - y1 * height}, ${x2 * width} ${height - y2 * height}, ${width} 0`;
    });

    return () => h('svg', { viewBox: `0 0 ${width} ${height}`, class: 'dialkit-spring-viz' }, [
      h('line', { x1: 0, y1: height, x2: width, y2: 0, stroke: 'rgba(255, 255, 255, 0.12)', 'stroke-width': 1, 'stroke-dasharray': '4,4' }),
      h('path', {
        d: curve.value,
        fill: 'none',
        stroke: 'rgba(255, 255, 255, 0.6)',
        'stroke-width': 2,
        'stroke-linecap': 'round',
      }),
    ]);
  },
});
