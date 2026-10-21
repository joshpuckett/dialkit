import type { SpringConfig } from '../../store/DialStore';

interface SpringVisualizationProps {
  spring: SpringConfig;
  isSimpleMode: boolean;
}

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

  for (let i = 0; i <= steps; i++) {
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

export function SpringVisualization(props: SpringVisualizationProps) {
  const width = 256;
  const height = 140;

  const params = () => {
    let stiffness: number;
    let damping: number;
    let mass: number;

    if (props.isSimpleMode) {
      const visualDuration = props.spring.visualDuration ?? 0.3;
      const bounce = props.spring.bounce ?? 0.2;
      mass = 1;
      stiffness = Math.pow((2 * Math.PI) / visualDuration, 2);
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

    const pathData = points
      .map(([time, value], i) => {
        const x = (time / duration) * width;
        const normalizedValue = (value - minValue) / (valueRange || 1);
        const y = height - (normalizedValue * height * 0.6 + height * 0.2);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    return pathData;
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
    <svg viewBox={`0 0 ${width} ${height}`} class="dialkit-spring-viz" aria-hidden="true">
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
        d={params()}
        fill="none"
        stroke="rgba(255, 255, 255, 0.6)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
