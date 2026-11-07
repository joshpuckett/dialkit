import { defineComponent, h, computed, type PropType } from 'vue';
import { SPRING_DEFAULTS } from '../../store/DialStore';
import type { SpringConfig } from '../../store/DialStore';
import { springParams, springProgress } from '../../transition-math';

export const SpringVisualization = defineComponent({
  name: 'DialKitSpringVisualization',
  props: {
    spring: {
      type: Object as PropType<SpringConfig>,
      required: true,
    },
    isSimpleMode: {
      type: Boolean,
      required: true,
    },
  },
  setup(props) {
    const width = 256;
    const height = 140;

    const pathData = computed(() => {
      // Same param mapping and closed-form curve as timeline scrubbing, so the
      // preview shows exactly the physics that plays.
      const params = props.isSimpleMode
        ? springParams({ type: 'spring', visualDuration: props.spring.visualDuration, bounce: props.spring.bounce })
        : springParams({ type: 'spring', stiffness: props.spring.stiffness ?? SPRING_DEFAULTS.stiffness, damping: props.spring.damping, mass: props.spring.mass });

      const duration = 2;
      const steps = 100;
      const points: [number, number][] = [];
      for (let i = 0; i <= steps; i += 1) {
        const time = (i / steps) * duration;
        points.push([time, springProgress(time, params)]);
      }

      const values = points.map(([, value]) => value);
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      const valueRange = maxValue - minValue;

      return points
        .map(([time, value], index) => {
          const x = (time / duration) * width;
          const normalizedValue = (value - minValue) / (valueRange || 1);
          const y = height - (normalizedValue * height * 0.6 + height * 0.2);
          return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
    });

    return () => h('svg', { viewBox: `0 0 ${width} ${height}`, class: 'dialkit-spring-viz' }, [
      ...Array.from({ length: 3 }).flatMap((_, index) => {
        const lineIndex = index + 1;
        const x = (width / 4) * lineIndex;
        const y = (height / 4) * lineIndex;
        return [
          h('line', { x1: x, y1: 0, x2: x, y2: height, stroke: 'rgba(255, 255, 255, 0.08)', 'stroke-width': 1 }),
          h('line', { x1: 0, y1: y, x2: width, y2: y, stroke: 'rgba(255, 255, 255, 0.08)', 'stroke-width': 1 }),
        ];
      }),
      h('line', {
        x1: 0,
        y1: height / 2,
        x2: width,
        y2: height / 2,
        stroke: 'rgba(255, 255, 255, 0.15)',
        'stroke-width': 1,
        'stroke-dasharray': '4,4',
      }),
      h('path', {
        d: pathData.value,
        fill: 'none',
        stroke: 'rgba(255, 255, 255, 0.6)',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    ]);
  },
});
