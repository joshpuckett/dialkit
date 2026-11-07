import { SPRING_DEFAULTS } from '../../store/DialStore';
import type { SpringConfig } from '../../store/DialStore';
import { springParams, springProgress } from '../../transition-math';

interface SpringVisualizationProps {
  spring: SpringConfig;
  isSimpleMode: boolean;
}

export function SpringVisualization(props: SpringVisualizationProps) {
  const width = 256;
  const height = 140;

  const pathData = () => {
    // Same param mapping and closed-form curve as timeline scrubbing, so the
    // preview shows exactly the physics that plays.
    const params = props.isSimpleMode
      ? springParams({ type: 'spring', visualDuration: props.spring.visualDuration, bounce: props.spring.bounce })
      : springParams({ type: 'spring', stiffness: props.spring.stiffness ?? SPRING_DEFAULTS.stiffness, damping: props.spring.damping, mass: props.spring.mass });

    const duration = 2;
    const steps = 100;
    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const time = (i / steps) * duration;
      points.push([time, springProgress(time, params)]);
    }

    const values = points.map(([, value]) => value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue;

    return points
      .map(([time, value], i) => {
        const x = (time / duration) * width;
        const normalizedValue = (value - minValue) / (valueRange || 1);
        const y = height - (normalizedValue * height * 0.6 + height * 0.2);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const gridLines = () => {
    const lines: ReturnType<typeof createLine>[] = [];
    for (let i = 1; i < 4; i++) {
      const x = (width / 4) * i;
      const y = (height / 4) * i;
      lines.push(
        createLine(x, 0, x, height),
        createLine(0, y, width, y),
      );
    }
    return lines;
  };

  function createLine(x1: number, y1: number, x2: number, y2: number) {
    return (
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} class="dialkit-spring-viz">
      {gridLines()}
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="rgba(255, 255, 255, 0.15)"
        stroke-width="1"
        stroke-dasharray="4,4"
      />
      <path
        d={pathData()}
        fill="none"
        stroke="rgba(255, 255, 255, 0.6)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
