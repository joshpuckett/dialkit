import { SpringConfig } from '../store/DialStore';
import { springParams, springProgress } from '../transition-math';

interface SpringVisualizationProps {
  spring: SpringConfig;
  isSimpleMode: boolean;
}

export function SpringVisualization({ spring, isSimpleMode }: SpringVisualizationProps) {
  const width = 256;
  const height = 140;

  // Same param mapping and closed-form curve as timeline scrubbing, so the
  // preview shows exactly the physics that plays.
  const params = isSimpleMode
    ? springParams({ type: 'spring', visualDuration: spring.visualDuration ?? 0.3, bounce: spring.bounce ?? 0.2 })
    : springParams({ type: 'spring', stiffness: spring.stiffness ?? 400, damping: spring.damping ?? 17, mass: spring.mass ?? 1 });

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
      <line key={`v-${i}`} x1={x} y1={0} x2={x} y2={height} stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />,
      <line key={`h-${i}`} x1={0} y1={y} x2={width} y2={y} stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="dialkit-spring-viz" aria-hidden="true">
      {gridLines}
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth="1"
        strokeDasharray="4,4"
      />
      <path
        d={pathData}
        fill="none"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
