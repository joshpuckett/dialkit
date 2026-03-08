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
    const size = 200;
    const pad = 10;
    const inner = size - pad * 2;
    const unit = inner / 2;

    const curve = computed(() => {
      const [x1, y1, x2, y2] = props.easing.ease;
      const toSvg = (nx: number, ny: number) => ({
        x: pad + (nx + 0.5) * unit,
        y: pad + (1.5 - ny) * unit,
      });
      const start = toSvg(0, 0);
      const end = toSvg(1, 1);
      const p1 = toSvg(x1, y1);
      const p2 = toSvg(x2, y2);
      return `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`;
    });

    return () => h('svg', {
      viewBox: `0 0 ${size} ${size}`,
      preserveAspectRatio: 'xMidYMid slice',
      class: 'dialkit-spring-viz dialkit-easing-viz',
    }, [
      h('line', {
        x1: pad + (0 + 0.5) * unit,
        y1: pad + (1.5 - 0) * unit,
        x2: pad + (1 + 0.5) * unit,
        y2: pad + (1.5 - 1) * unit,
        stroke: 'rgba(255, 255, 255, 0.15)',
        'stroke-width': 1,
        'stroke-dasharray': '4,4',
      }),
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
