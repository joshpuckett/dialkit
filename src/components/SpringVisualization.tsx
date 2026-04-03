import { SpringConfig } from '../store/DialStore';

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

export function SpringVisualization({ spring, isSimpleMode }: SpringVisualizationProps) {
  const width = 256;
  const height = 140;

  let stiffness: number;
  let damping: number;
  let mass: number;

  if (isSimpleMode) {
    const visualDuration = spring.visualDuration ?? 0.3;
    const bounce = spring.bounce ?? 0.2;
    mass = 1;

    stiffness = (2 * Math.PI) / visualDuration;
    stiffness = Math.pow(stiffness, 2);

    const dampingRatio = 1 - bounce;
    damping = 2 * dampingRatio * Math.sqrt(stiffness * mass);
  } else {
    stiffness = spring.stiffness ?? 400;
    damping = spring.damping ?? 17;
    mass = spring.mass ?? 1;
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

  const gridLines = [];
  for (let i = 1; i < 4; i++) {
    const x = (width / 4) * i;
    const y = (height / 4) * i;
    gridLines.push(
      <line key={`v-${i}`} x1={x} y1={0} x2={x} y2={height} style={{ stroke: 'var(--dial-viz-grid)' }} strokeWidth="1" />,
      <line key={`h-${i}`} x1={0} y1={y} x2={width} y2={y} style={{ stroke: 'var(--dial-viz-grid)' }} strokeWidth="1" />
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="dialkit-spring-viz">
      {gridLines}
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        style={{ stroke: 'var(--dial-viz-line)' }}
        strokeWidth="1"
        strokeDasharray="4,4"
      />
      <path
        d={pathData}
        fill="none"
        style={{ stroke: 'var(--dial-viz-curve)' }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
