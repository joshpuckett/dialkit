import { CSSProperties } from 'react';
import { useDialKit, DialRoot } from 'dialkit';
import 'dialkit/styles.css';

const features = [
  'Light and dark mode. System preference detection',
  'Keyboard shortcuts for sliders and toggles',
  'Draggable repositioning of collapsed trigger',
  'Vue 3 adapter with Composition API',
  'Svelte 5 support with runes-based components',
  'Solid adapter aligned with React animation',
  'Inline mode for embedding in layouts',
  'Easing curve editor. Easing / Time / Physics',
  'Interaction types: scroll, drag, move, scroll-only',
  'Dynamic config updates with memoization',
  'Preset manager with portal dropdown',
  'Production guard. Dev-only rendering',
  'DialStore extracted to dedicated subpath export',
  'Explicit slider step values',
  'Folder _collapsed option for default state',
  'Segmented control pill alignment fix',
  'Select dropdown clip-path fix (#4)',
  'Nested action button support',
  'Icon refactor resolving issue #19',
  'Panel trigger fix resolving issue #17',
  'Svelte slots to snippets migration',
  'Vue directive export renamed to vDialKit',
  'Spring-animated segmented control pill',
  'Instant panel open. Spring expand for folders',
  'Slider rubber band clipping fix',
  'Floating point noise fix in slider rounding',
  'Preset base values tracking + clear restore',
  'Slider handle scale dodge on active',
  'defaultOpen prop for panel state control',
  'React 19 useSyncExternalStore compatibility',
];

function ReleaseContent() {
  const values = useDialKit('Release', {
    Typography: {
      fontSize: [910, 200, 1000, 10],
      fontWeight: [900, 100, 900, 100],
    },
    Displacement: {
      scale: [7.2, 0, 12, 1],
      baseFrequencyX: [0.250, 0.001, 0.250, 0.001],
      baseFrequencyY: [0.250, 0.001, 0.250, 0.001],
      numOctaves: [3, 1, 8, 1],
      seed: [0, 0, 100, 1],
    },
    Noise: {
      opacity: [1, 0, 1, 0.01],
      frequency: [0.31, 0.01, 2, 0.01],
    },
  }, {
    shortcuts: {
      'Displacement.scale': { key: 's', mode: 'coarse' },
    },
  });

  const scrollDuration = features.length * 1.5;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes scroll-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}</style>

      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="version-fx" x="-20%" y="-20%" width="140%" height="140%">
            {/* Step 1: Displacement */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${(values as any).Displacement.baseFrequencyX} ${(values as any).Displacement.baseFrequencyY}`}
              numOctaves={(values as any).Displacement.numOctaves}
              seed={(values as any).Displacement.seed}
              result="dispNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="dispNoise"
              scale={(values as any).Displacement.scale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />

            {/* Step 2: Generate grain noise */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency={(values as any).Noise.frequency}
              numOctaves={4}
              seed={0}
              result="grain"
            />
            <feColorMatrix in="grain" type="saturate" values="0" result="bwGrain" />

            {/* Step 3: Remap grain intensity — range [1-opacity, 1] so 0 opacity = no effect */}
            <feComponentTransfer in="bwGrain" result="subtleGrain">
              <feFuncR type="linear" slope={-(values as any).Noise.opacity} intercept="1" />
              <feFuncG type="linear" slope={-(values as any).Noise.opacity} intercept="1" />
              <feFuncB type="linear" slope={-(values as any).Noise.opacity} intercept="1" />
            </feComponentTransfer>

            {/* Step 4: Clip grain to displaced text shape, then multiply blend */}
            <feComposite in="subtleGrain" in2="displaced" operator="in" result="clippedGrain" />
            <feBlend in="displaced" in2="clippedGrain" mode="multiply" />
          </filter>
        </defs>
      </svg>

      <div style={styles.featureList}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          animation: `scroll-up ${scrollDuration}s linear infinite`,
        }}>
          {/* Render list twice for seamless loop */}
          {[...features, ...features].map((f, i) => (
            <div key={i} style={styles.featureLine}>{f}</div>
          ))}
        </div>
      </div>

      <div
        style={{
          ...styles.versionNumber,
          fontSize: (values as any).Typography.fontSize,
          fontWeight: (values as any).Typography.fontWeight,
          filter: 'url(#version-fx)',
        }}
      >
        <span style={{ marginRight: '-0.05em' }}>1</span><span style={{ display: 'inline-block', transform: 'translateX(-0.05em)' }}>.</span>2
      </div>

    </div>
  );
}

export function Release() {
  return (
    <>
      <ReleaseContent />
      <DialRoot position="top-right" theme="light" />
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#f2f2f2',
    fontFamily: 'Helvetica, Arial, sans-serif',
  },
  featureList: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  featureLine: {
    fontSize: 32,
    fontWeight: 500,
    lineHeight: 1.35,
    color: '#000',
    letterSpacing: 0,
    whiteSpace: 'nowrap',
  },
  versionNumber: {
    position: 'absolute',
    right: -20,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 800,
    fontWeight: 700,
    lineHeight: 0.85,
    color: '#FF1300',
    zIndex: 2,
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
  },
};
