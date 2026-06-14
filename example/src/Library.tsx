import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Slider, SelectControl } from 'dialkit';
import type { ShortcutConfig } from 'dialkit';
import 'dialkit/styles.css';

type Theme = 'dark' | 'light';

/**
 * Mirrors DialStore.inferRange — so the "auto-inferred" cards show
 * exactly what a bare number would produce in useDialKit.
 */
function inferRange(value: number): { min: number; max: number; step: number } {
  if (value >= 0 && value <= 1) return { min: 0, max: 1, step: 0.01 };
  if (value >= 0 && value <= 10) return { min: 0, max: value * 3 || 10, step: 0.1 };
  if (value >= 0 && value <= 100) return { min: 0, max: value * 3 || 100, step: 1 };
  if (value >= 0) return { min: 0, max: value * 3 || 1000, step: 10 };
  return { min: value * 3, max: -value * 3, step: 1 };
}

type SliderVariant = {
  id: string;
  title: string;
  desc: string;
  code: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  shortcut?: ShortcutConfig;
  shortcutActive?: boolean;
};

const auto = (label: string, value: number): Omit<SliderVariant, 'id' | 'title' | 'desc' | 'code'> => {
  const { min, max, step } = inferRange(value);
  return { label, value, min, max, step };
};

const SLIDER_VARIANTS: SliderVariant[] = [
  {
    id: 'range',
    title: 'Continuous range',
    desc: 'Explicit [default, min, max]. Step is inferred from the range.',
    code: 'blur: [24, 0, 100]',
    label: 'blur',
    value: 24, min: 0, max: 100, step: 1,
  },
  {
    id: 'range-step',
    title: 'Range with step',
    desc: 'A fourth value sets an explicit step. Drag snaps in increments.',
    code: 'gap: [40, 0, 100, 5]',
    label: 'gap',
    value: 40, min: 0, max: 100, step: 5,
  },
  {
    id: 'bipolar',
    title: 'Bipolar range',
    desc: 'Negative min, positive max — the fill grows from the left edge.',
    code: 'offsetX: [0, -200, 200]',
    label: 'offsetX',
    value: 0, min: -200, max: 200, step: 10,
  },
  {
    id: 'discrete',
    title: 'Discrete steps',
    desc: 'Ten or fewer steps render hashmarks and click-to-snap.',
    code: 'sides: [3, 1, 8, 1]',
    label: 'sides',
    value: 3, min: 1, max: 8, step: 1,
  },
  {
    id: 'stepped',
    title: 'Coarse steps',
    desc: 'Large steps across a wide range — great for weights or counts.',
    code: 'weight: [400, 100, 900, 100]',
    label: 'weight',
    value: 400, min: 100, max: 900, step: 100,
  },
  {
    id: 'auto-fraction',
    title: 'Auto · fractional',
    desc: 'A bare number in 0–1 infers a 0→1 range with 0.01 steps.',
    code: 'opacity: 0.6   // → [0, 1], step 0.01',
    ...auto('opacity', 0.6),
  },
  {
    id: 'auto-small',
    title: 'Auto · small',
    desc: 'Values up to 10 infer 0 → value × 3 with 0.1 steps.',
    code: 'scale: 1.2   // → [0, 3.6], step 0.1',
    ...auto('scale', 1.2),
  },
  {
    id: 'auto-mid',
    title: 'Auto · medium',
    desc: 'Values up to 100 infer 0 → value × 3 with whole-number steps.',
    code: 'rotate: 45   // → [0, 135], step 1',
    ...auto('rotate', 45),
  },
  {
    id: 'auto-large',
    title: 'Auto · large',
    desc: 'Values over 100 infer 0 → value × 3 with steps of 10.',
    code: 'width: 320   // → [0, 960], step 10',
    ...auto('width', 320),
  },
  {
    id: 'shortcut',
    title: 'Shortcut pill',
    desc: 'A keyboard shortcut adds a pill showing key + interaction.',
    code: "radius: { key: 'b', mode: 'fine' }",
    label: 'radius',
    value: 16, min: 0, max: 64, step: 1,
    shortcut: { key: 'b', interaction: 'scroll', mode: 'fine' },
  },
  {
    id: 'shortcut-active',
    title: 'Shortcut · active',
    desc: 'The pill highlights while its key is held. Try S + drag.',
    code: "speed: { key: 's', interaction: 'drag', mode: 'coarse' }",
    label: 'speed',
    value: 1.5, min: 0, max: 3, step: 0.1,
    shortcut: { key: 's', interaction: 'drag', mode: 'coarse' },
    shortcutActive: true,
  },
];

type SelectOption = string | { value: string; label: string };

type SelectVariant = {
  id: string;
  title: string;
  desc: string;
  code: string;
  label: string;
  value: string;
  options: SelectOption[];
};

const SELECT_VARIANTS: SelectVariant[] = [
  {
    id: 'strings',
    title: 'String options',
    desc: 'Plain strings are auto Title-Cased for display.',
    code: "options: ['stack', 'fan', 'grid']",
    label: 'layout',
    value: 'stack',
    options: ['stack', 'fan', 'grid'],
  },
  {
    id: 'labels',
    title: 'Custom labels',
    desc: '{ value, label } pairs decouple the stored value from its display text.',
    code: "{ value: 'sq', label: 'Square' }",
    label: 'shape',
    value: 'portrait',
    options: [
      { value: 'portrait', label: 'Portrait' },
      { value: 'sq', label: 'Square' },
      { value: 'landscape', label: 'Landscape' },
    ],
  },
  {
    id: 'binary',
    title: 'Binary choice',
    desc: 'Two options work as a compact A / B switch.',
    code: "options: ['light', 'dark']",
    label: 'theme',
    value: 'dark',
    options: ['light', 'dark'],
  },
  {
    id: 'many',
    title: 'Many options',
    desc: 'Long lists flip above the trigger when space runs out.',
    code: "options: ['jan', 'feb', … 'dec']",
    label: 'month',
    value: 'jun',
    options: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  },
  {
    id: 'long',
    title: 'Long labels',
    desc: 'Overflowing values truncate with an ellipsis in the trigger.',
    code: "label: 'Ease In Out (Cubic)'",
    label: 'easing',
    value: 'in-out',
    options: [
      { value: 'linear', label: 'Linear' },
      { value: 'in', label: 'Ease In (Quad)' },
      { value: 'out', label: 'Ease Out (Quad)' },
      { value: 'in-out', label: 'Ease In Out (Cubic)' },
    ],
  },
];

export function Library() {
  const [theme, setTheme] = useState<Theme>('dark');

  const [numbers, setNumbers] = useState<Record<string, number>>(() =>
    Object.fromEntries(SLIDER_VARIANTS.map((v) => [v.id, v.value]))
  );
  const [selects, setSelects] = useState<Record<string, string>>(() =>
    Object.fromEntries(SELECT_VARIANTS.map((v) => [v.id, v.value]))
  );

  const setNumber = (id: string, value: number) =>
    setNumbers((prev) => ({ ...prev, [id]: value }));
  const setSelect = (id: string, value: string) =>
    setSelects((prev) => ({ ...prev, [id]: value }));

  return (
    <div className="dialkit-root lib-page" data-theme={theme}>
      <style>{CSS}</style>

      <header className="lib-header">
        <div className="lib-header-top">
          <Link to="/" className="lib-back">← Demo</Link>
          <div className="lib-theme-switch" role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                className="lib-theme-btn"
                data-active={String(theme === t)}
                onClick={() => setTheme(t)}
              >
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>

        <div className="lib-eyebrow">
          <span className="lib-dot" /> DialKit · Component Library
        </div>
        <h1 className="lib-title">Sliders &amp; Selectors</h1>
        <p className="lib-lead">
          Every slider and selector variant the kit ships with, live and interactive —
          an eagle-eye view of the controls you compose with <code>useDialKit</code>.
        </p>
      </header>

      <main className="lib-main">
        <Section
          index="01"
          title="Sliders"
          count={SLIDER_VARIANTS.length}
          hint="Drag to set · click to snap · hover the value 800ms then click to type."
        >
          {SLIDER_VARIANTS.map((v) => (
            <Card key={v.id} title={v.title} desc={v.desc} code={v.code}>
              <Slider
                label={v.label}
                value={numbers[v.id]}
                onChange={(value) => setNumber(v.id, value)}
                min={v.min}
                max={v.max}
                step={v.step}
                shortcut={v.shortcut}
                shortcutActive={v.shortcutActive}
              />
            </Card>
          ))}
        </Section>

        <Section
          index="02"
          title="Selectors"
          count={SELECT_VARIANTS.length}
          hint="Click a row to open its dropdown — it repositions to stay on screen."
        >
          {SELECT_VARIANTS.map((v) => (
            <Card key={v.id} title={v.title} desc={v.desc} code={v.code}>
              <SelectControl
                label={v.label}
                value={selects[v.id]}
                options={v.options}
                onChange={(value) => setSelect(v.id, value)}
              />
            </Card>
          ))}
        </Section>
      </main>

      <footer className="lib-footer">
        Built with the live DialKit components — the same code that renders inside the panel.
      </footer>
    </div>
  );
}

function Section({
  index,
  title,
  count,
  hint,
  children,
}: {
  index: string;
  title: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="lib-section">
      <div className="lib-section-head">
        <div className="lib-section-headline">
          <span className="lib-section-index">{index}</span>
          <h2 className="lib-section-title">{title}</h2>
          <span className="lib-section-count">{count}</span>
        </div>
        <p className="lib-section-hint">{hint}</p>
      </div>
      <div className="lib-grid">{children}</div>
    </section>
  );
}

function Card({
  title,
  desc,
  code,
  children,
}: {
  title: string;
  desc: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <article className="lib-card">
      <div className="lib-stage">{children}</div>
      <div className="lib-meta">
        <div className="lib-card-title">{title}</div>
        <p className="lib-card-desc">{desc}</p>
        <code className="lib-code">{code}</code>
      </div>
    </article>
  );
}

const CSS = `
.lib-page {
  --lib-bg: #161616;
  --lib-accent: #ff5a3c;
  height: 100vh;
  overflow-y: auto;
  background: var(--lib-bg);
  color: var(--dial-text-root);
  box-sizing: border-box;
}
.lib-page[data-theme="light"] {
  --lib-bg: #efefef;
}
.lib-page *, .lib-page *::before, .lib-page *::after { box-sizing: border-box; }

/* Soft accent glow behind the hero */
.lib-page::before {
  content: '';
  position: fixed;
  top: -180px;
  left: 50%;
  width: 900px;
  height: 420px;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, color-mix(in srgb, var(--lib-accent) 18%, transparent), transparent);
  pointer-events: none;
  z-index: 0;
}

.lib-header, .lib-main, .lib-footer {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto;
  padding-left: 28px;
  padding-right: 28px;
}

.lib-header { padding-top: 28px; padding-bottom: 24px; }

.lib-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 40px;
}

.lib-back {
  font-size: 13px;
  font-weight: 500;
  color: var(--dial-text-label);
  text-decoration: none;
  transition: color 0.15s;
}
.lib-back:hover { color: var(--dial-text-root); }

.lib-theme-switch {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  background: var(--dial-surface);
  border: 1px solid var(--dial-border);
  border-radius: 999px;
}
.lib-theme-btn {
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dial-text-label);
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.lib-theme-btn[data-active="true"] {
  background: var(--dial-surface-active);
  color: var(--dial-text-root);
}

.lib-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dial-text-tertiary);
}
.lib-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--lib-accent);
  box-shadow: 0 0 12px var(--lib-accent);
}

.lib-title {
  margin: 14px 0 0;
  font-size: clamp(34px, 6vw, 56px);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.02;
}

.lib-lead {
  margin: 16px 0 0;
  max-width: 580px;
  font-size: 16px;
  line-height: 1.55;
  color: var(--dial-text-section);
}
.lib-lead code {
  font-family: 'Geist Mono', monospace;
  font-size: 0.9em;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--dial-surface);
  color: var(--dial-text-root);
}

.lib-main { padding-bottom: 8px; }

.lib-section { padding-top: 36px; }

.lib-section-head {
  padding-bottom: 18px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--dial-surface-subtle);
}
.lib-section-headline {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.lib-section-index {
  font-family: 'Geist Mono', monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--lib-accent);
}
.lib-section-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.lib-section-count {
  font-family: 'Geist Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--dial-text-tertiary);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dial-surface);
}
.lib-section-hint {
  margin: 10px 0 0;
  font-size: 13.5px;
  color: var(--dial-text-tertiary);
}

.lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.lib-card {
  display: flex;
  flex-direction: column;
  background: var(--dial-glass-bg);
  border: 1px solid var(--dial-border);
  border-radius: 16px;
  padding: 14px;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.lib-card:hover {
  transform: translateY(-2px);
  border-color: var(--dial-border-hover);
  box-shadow: var(--dial-shadow);
}

/* Stage reproduces the panel's own padding so controls read exactly as they do in DialKit */
.lib-stage {
  padding: 4px 0 16px;
}

.lib-meta {
  border-top: 1px solid var(--dial-surface-subtle);
  padding-top: 14px;
}
.lib-card-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--dial-text-root);
}
.lib-card-desc {
  margin: 6px 0 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--dial-text-section);
  min-height: 38px;
}
.lib-code {
  display: block;
  font-family: 'Geist Mono', monospace;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dial-text-label);
  background: var(--dial-surface);
  border: 1px solid var(--dial-border);
  border-radius: 8px;
  padding: 8px 10px;
  white-space: pre;
  overflow-x: auto;
}
.lib-code::-webkit-scrollbar { height: 0; }

.lib-footer {
  padding: 40px 28px 56px;
  font-size: 12.5px;
  color: var(--dial-text-tertiary);
  text-align: center;
}

@media (max-width: 520px) {
  .lib-grid { grid-template-columns: 1fr; }
}
`;
