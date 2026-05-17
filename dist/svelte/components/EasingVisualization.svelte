<script lang="ts">
  import type { EasingConfig } from 'dialkit/store';

  let { easing } = $props<{ easing: EasingConfig }>();

  export const easingPresets: Record<string, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    easeIn: [0.42, 0, 1, 1],
    easeOut: [0, 0, 0.58, 1],
    easeInOut: [0.42, 0, 0.58, 1],
  };

  const s = 200;
  const pad = 10;
  const inner = s - pad * 2;
  const unit = inner / 2;

  const toSvg = (nx: number, ny: number) => ({
    x: pad + (nx + 0.5) * unit,
    y: pad + (1.5 - ny) * unit,
  });

  const points = $derived.by(() => {
    const ease = easing.ease;
    const start = toSvg(0, 0);
    const end = toSvg(1, 1);
    const p1 = toSvg(ease[0], ease[1]);
    const p2 = toSvg(ease[2], ease[3]);

    return {
      start,
      end,
      curvePath: `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`,
    };
  });
</script>

<svg viewBox={`0 0 ${s} ${s}`} preserveAspectRatio="xMidYMid slice" class="dialkit-spring-viz dialkit-easing-viz">
  <line
    x1={points.start.x}
    y1={points.start.y}
    x2={points.end.x}
    y2={points.end.y}
    stroke="rgba(255, 255, 255, 0.15)"
    stroke-width="1"
    stroke-dasharray="4,4"
  />

  <path d={points.curvePath} fill="none" stroke="rgba(255, 255, 255, 0.6)" stroke-width="2" stroke-linecap="round" />
</svg>
