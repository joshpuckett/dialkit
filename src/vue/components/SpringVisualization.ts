import { defineComponent, h, computed, type PropType } from 'vue';
import type { SpringConfig } from '../../store/DialStore';

function generateSpringCurve(
  stiffness: number,
  damping: number,
  mass: number,
  duration: number
): [number, number][] {
  const points: [number, number][] = [];
  const steps = 100;
  const dt = duration / steps;

  let position = 0;
  let velocity = 0;
  const target = 1;

  for (let i = 0; i <= steps; i += 1) {
    const time = i * dt;
    points.push([time, position]);

    const springForce = -stiffness * (position - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * dt;
    position += velocity * dt;
  }

  return points;
}

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
      let stiffness: number;
      let damping: number;
      let mass: number;

      if (props.isSimpleMode) {
        const visualDuration = props.spring.visualDuration ?? 0.3;
        const bounce = props.spring.bounce ?? 0.2;
        mass = 1;
        stiffness = ((2 * Math.PI) / visualDuration) ** 2;
        const dampingRatio = 1 - bounce;
        damping = 2 * dampingRatio * Math.sqrt(stiffness * mass);
      } else {
        stiffness = props.spring.stiffness ?? 400;
        damping = props.spring.damping ?? 17;
        mass = props.spring.mass ?? 1;
      }

      const duration = 2;
      const points = generateSpringCurve(stiffness, damping, mass, duration);
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
