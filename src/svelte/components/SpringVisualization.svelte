<script lang="ts">
  import type { SpringConfig } from 'dialkit/store';

  let { spring, isSimpleMode } = $props<{ spring: SpringConfig; isSimpleMode: boolean }>();

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

  const width = 256;
  const height = 140;

  const pathData = $derived.by(() => {
    let stiffness: number;
    let damping: number;
    let mass: number;

    if (isSimpleMode) {
      const visualDuration = spring.visualDuration ?? 0.3;
      const bounce = spring.bounce ?? 0.2;
      mass = 1;
      stiffness = Math.pow((2 * Math.PI) / visualDuration, 2);
      const dampingRatio = 1 - bounce;
      damping = 2 * dampingRatio * Math.sqrt(stiffness * mass);
    } else {
      stiffness = spring.stiffness ?? 400;
      damping = spring.damping ?? 17;
      mass = spring.mass ?? 1;
    }

    const duration = 2;
    const points = generateSpringCurve(stiffness, damping, mass, duration);
    const values = points.map(([, v]) => v);
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
  });

  const gridLines = $derived.by(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 1; i < 4; i++) {
      const x = (width / 4) * i;
      const y = (height / 4) * i;
      lines.push({ x1: x, y1: 0, x2: x, y2: height });
      lines.push({ x1: 0, y1: y, x2: width, y2: y });
    }
    return lines;
  });
</script>

<svg viewBox={`0 0 ${width} ${height}`} class="dialkit-spring-viz">
  {#each gridLines as line}
    <line
      x1={line.x1}
      y1={line.y1}
      x2={line.x2}
      y2={line.y2}
      stroke="rgba(255, 255, 255, 0.08)"
      stroke-width="1"
    />
  {/each}

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
    d={pathData}
    fill="none"
    stroke="rgba(255, 255, 255, 0.6)"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
