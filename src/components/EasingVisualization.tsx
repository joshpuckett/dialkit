import { EasingConfig } from '../store/DialStore';

interface EasingVisualizationProps {
  easing: EasingConfig;
}

const easingPresets: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

export function EasingVisualization({ easing }: EasingVisualizationProps) {
  const ease = easing.ease;

  const s = 200;
  const pad = 10;
  const inner = s - pad * 2;
  const unit = inner / 2; // [-0.5, 1.5] = 2 units on each axis

  // Equal scaling on both axes → 45° diagonal. [0,1] centered in [-0.5, 1.5].
  const toSvg = (nx: number, ny: number) => ({
    x: pad + (nx + 0.5) * unit,
    y: pad + (1.5 - ny) * unit,
  });

  const start = toSvg(0, 0);
  const end = toSvg(1, 1);
  const p1 = toSvg(ease[0], ease[1]);
  const p2 = toSvg(ease[2], ease[3]);

  const curvePath = `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`;

  return (
    <svg
      viewBox={`0 0 ${s} ${s}`}
      preserveAspectRatio="xMidYMid slice"
      className="dialkit-spring-viz dialkit-easing-viz"
    >
      <line
        x1={start.x} y1={start.y} x2={end.x} y2={end.y}
        style={{ stroke: 'var(--dial-viz-line)' }}
        strokeWidth="1"
        strokeDasharray="4,4"
      />

      <path d={curvePath} fill="none" style={{ stroke: 'var(--dial-viz-curve)' }} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export { easingPresets };
