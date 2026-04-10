import { useDialKit, withVisibility } from 'dialkit';

/**
 * Conditional visibility demo
 *
 * Controls are wrapped with `withVisibility(control, rule)` to show/hide them
 * based on the value of other controls in the same panel. The store watches
 * the value changes and automatically re-filters the control tree.
 */
export function ConditionalVisibility() {
  const values = useDialKit('Conditional', {
    // Master switch
    layoutMode: {
      type: 'select' as const,
      options: [
        { value: 'grid', label: 'Grid' },
        { value: 'sphere', label: 'Sphere' },
        { value: 'stack', label: 'Stack' },
      ],
      default: 'grid',
    },

    // Grid-only controls (is-array form)
    gapH: withVisibility([12, 0, 40], { field: 'layoutMode', is: ['grid'] }),
    gapV: withVisibility([12, 0, 40], { field: 'layoutMode', is: 'grid' }),

    // Sphere-only control
    sphereRadius: withVisibility([1, 0.5, 5, 0.1], { field: 'layoutMode', is: 'sphere' }),

    // Hidden only on stack mode (not rule)
    scatter: withVisibility([0, 0, 1, 0.01], { field: 'layoutMode', not: 'stack' }),

    // Transition control — exercises the Easing/Time/Physics mode swap
    // animation inside TransitionControl (separate from the visibility
    // feature, but uses the same motion pattern).
    tween: { type: 'spring' as const, visualDuration: 0.3, bounce: 0.2 },

    // Debug toggle + nested folder — kept at the bottom so conditional
    // controls appear directly under their master switch.
    debugMode: false,
    debug: withVisibility(
      {
        _collapsed: false,
        showStats: true,
        verboseLogs: false,
        tintColor: { type: 'color' as const, default: '#ff0080' },
      },
      { field: 'debugMode', is: true }
    ),
  });

  const bgColor =
    values.layoutMode === 'grid'
      ? '#1a1a2e'
      : values.layoutMode === 'sphere'
        ? '#2d1a2e'
        : '#1a2e1a';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bgColor,
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        padding: '4rem',
        transition: 'background 0.3s ease',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Conditional Visibility</h1>
      <p style={{ maxWidth: 520, opacity: 0.75, lineHeight: 1.55 }}>
        Open the panel and switch <strong>layoutMode</strong> between Grid, Sphere, and
        Stack. Toggle <strong>debugMode</strong> on and off. Controls appear and disappear
        based on the values of other controls in the same panel — wired with a single{' '}
        <code>withVisibility()</code> call per control.
      </p>

      <pre
        style={{
          marginTop: '2rem',
          padding: '1rem 1.25rem',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.6,
          maxWidth: 520,
          overflow: 'auto',
        }}
      >
        {JSON.stringify(values, null, 2)}
      </pre>
    </div>
  );
}
