import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Slider,
  SelectControl,
  Toggle,
  TextControl,
  ColorControl,
  ButtonGroup,
  Folder,
  SpringControl,
  SpringVisualization,
  TransitionControl,
  EasingVisualization,
  ShortcutsMenu,
  DialRoot,
  DialStore,
  useDialKit,
} from 'dialkit';
import type { ShortcutConfig, SpringConfig, TransitionConfig, EasingConfig } from 'dialkit';
import 'dialkit/styles.css';

type Theme = 'dark' | 'light';

/* Mirrors DialStore.inferRange so "auto-inferred" cards match useDialKit exactly. */
function inferRange(value: number): { min: number; max: number; step: number } {
  if (value >= 0 && value <= 1) return { min: 0, max: 1, step: 0.01 };
  if (value >= 0 && value <= 10) return { min: 0, max: value * 3 || 10, step: 0.1 };
  if (value >= 0 && value <= 100) return { min: 0, max: value * 3 || 100, step: 1 };
  if (value >= 0) return { min: 0, max: value * 3 || 1000, step: 10 };
  return { min: value * 3, max: -value * 3, step: 1 };
}

// ── Slider variants ───────────────────────────────────────────────
type SliderVariant = {
  id: string; title: string; desc: string; code: string;
  label: string; value: number; min: number; max: number; step: number;
  shortcut?: ShortcutConfig; shortcutActive?: boolean;
  unit?: string;
  formatValue?: (value: number) => string;
  renderIcon?: (value: number) => ReactNode;
};

const auto = (label: string, value: number): Omit<SliderVariant, 'id' | 'title' | 'desc' | 'code'> => {
  const { min, max, step } = inferRange(value);
  return { label, value, min, max, step };
};

/** A volume glyph whose wave count tracks the value — demonstrates `valueIcon`. */
const volumeIcon = (v: number): ReactNode => {
  const waves = v <= 0 ? 0 : v < 50 ? 1 : 2;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6 H5 L8.5 3 V13 L5 10 H3 Z" fill="currentColor" stroke="none" />
      {waves >= 1 && <path d="M10.5 6.2 Q11.7 8 10.5 9.8" />}
      {waves >= 2 && <path d="M12.4 4.8 Q14.3 8 12.4 11.2" />}
      {waves === 0 && <path d="M10.5 6 L13.5 10 M13.5 6 L10.5 10" />}
    </svg>
  );
};

const SLIDER_VARIANTS: SliderVariant[] = [
  { id: 'range', title: 'Continuous range', desc: 'Explicit [default, min, max]. Step is inferred from the range.', code: 'blur: [24, 0, 100]', label: 'blur', value: 24, min: 0, max: 100, step: 1 },
  { id: 'range-step', title: 'Range with step', desc: 'A fourth value sets an explicit step. Drag snaps in increments.', code: 'gap: [40, 0, 100, 5]', label: 'gap', value: 40, min: 0, max: 100, step: 5 },
  { id: 'bipolar', title: 'Bipolar range', desc: 'Negative min, positive max — the fill grows from the left edge.', code: 'offsetX: [0, -200, 200]', label: 'offsetX', value: 0, min: -200, max: 200, step: 10 },
  { id: 'discrete', title: 'Discrete steps', desc: 'Ten or fewer steps render hashmarks and click-to-snap.', code: 'sides: [3, 1, 8, 1]', label: 'sides', value: 3, min: 1, max: 8, step: 1 },
  { id: 'stepped', title: 'Coarse steps', desc: 'Large steps across a wide range — great for weights or counts.', code: 'weight: [400, 100, 900, 100]', label: 'weight', value: 400, min: 100, max: 900, step: 100 },
  { id: 'auto-fraction', title: 'Auto · fractional', desc: 'A bare number in 0–1 infers a 0→1 range with 0.01 steps.', code: 'opacity: 0.6   // → [0, 1], step 0.01', ...auto('opacity', 0.6) },
  { id: 'auto-small', title: 'Auto · small', desc: 'Values up to 10 infer 0 → value × 3 with 0.1 steps.', code: 'scale: 1.2   // → [0, 3.6], step 0.1', ...auto('scale', 1.2) },
  { id: 'auto-mid', title: 'Auto · medium', desc: 'Values up to 100 infer 0 → value × 3 with whole-number steps.', code: 'rotate: 45   // → [0, 135], step 1', ...auto('rotate', 45) },
  { id: 'auto-large', title: 'Auto · large', desc: 'Values over 100 infer 0 → value × 3 with steps of 10.', code: 'width: 320   // → [0, 960], step 10', ...auto('width', 320) },
  { id: 'shortcut', title: 'Shortcut pill', desc: 'A keyboard shortcut adds a pill showing key + interaction.', code: "radius: { key: 'b', mode: 'fine' }", label: 'radius', value: 16, min: 0, max: 64, step: 1, shortcut: { key: 'b', interaction: 'scroll', mode: 'fine' } },
  { id: 'shortcut-active', title: 'Shortcut · active', desc: 'The pill highlights while its key is held. Try S + drag.', code: "speed: { key: 's', interaction: 'drag' }", label: 'speed', value: 1.5, min: 0, max: 3, step: 0.1, shortcut: { key: 's', interaction: 'drag', mode: 'coarse' }, shortcutActive: true },
  { id: 'unit-percent', title: 'Unit · percent', desc: 'A `unit` string is appended after the value as a muted suffix.', code: "opacity: [70, 0, 100], unit: '%'", label: 'opacity', value: 70, min: 0, max: 100, step: 1, unit: '%' },
  { id: 'unit-seconds', title: 'Unit · seconds', desc: 'Units pair with any range — here a fractional duration in seconds.', code: "duration: [3.6, 0, 10, 0.1], unit: 's'", label: 'duration', value: 3.6, min: 0, max: 10, step: 0.1, unit: 's' },
  { id: 'unit-pixels', title: 'Unit · pixels', desc: 'Pixel suffixes read naturally for sizes, radii and offsets.', code: "radius: [16, 0, 64], unit: 'px'", label: 'radius', value: 16, min: 0, max: 64, step: 1, unit: 'px' },
  { id: 'format-custom', title: 'Custom format', desc: 'A `formatValue` callback owns the full label — here a multiplier.', code: "formatValue: (v) => `${v.toFixed(1)}×`", label: 'zoom', value: 1.5, min: 0.5, max: 4, step: 0.1, formatValue: (v) => `${v.toFixed(1)}×` },
  { id: 'format-degrees', title: 'Format · degrees', desc: 'Formatters can round and add any glyph the unit prop can’t express.', code: "formatValue: (v) => `${Math.round(v)}°`", label: 'angle', value: 45, min: 0, max: 360, step: 1, formatValue: (v) => `${Math.round(v)}°` },
  { id: 'icon-value', title: 'Icon value', desc: 'A `valueIcon` node replaces the text — it reacts to the value and is not editable.', code: 'valueIcon: <VolumeGlyph value={v} />', label: 'volume', value: 65, min: 0, max: 100, step: 1, renderIcon: volumeIcon },
];

// ── Select variants ───────────────────────────────────────────────
type SelectOption = string | { value: string; label: string };
type SelectVariant = { id: string; title: string; desc: string; code: string; label: string; value: string; options: SelectOption[] };

const SELECT_VARIANTS: SelectVariant[] = [
  { id: 'strings', title: 'String options', desc: 'Plain strings are auto Title-Cased for display.', code: "options: ['stack', 'fan', 'grid']", label: 'layout', value: 'stack', options: ['stack', 'fan', 'grid'] },
  { id: 'labels', title: 'Custom labels', desc: '{ value, label } pairs decouple the stored value from its display text.', code: "{ value: 'sq', label: 'Square' }", label: 'shape', value: 'portrait', options: [{ value: 'portrait', label: 'Portrait' }, { value: 'sq', label: 'Square' }, { value: 'landscape', label: 'Landscape' }] },
  { id: 'binary', title: 'Binary choice', desc: 'Two options work as a compact A / B switch.', code: "options: ['light', 'dark']", label: 'theme', value: 'dark', options: ['light', 'dark'] },
  { id: 'many', title: 'Many options', desc: 'Long lists flip above the trigger when space runs out.', code: "options: ['jan', … 'dec']", label: 'month', value: 'jun', options: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] },
  { id: 'long', title: 'Long labels', desc: 'Overflowing values truncate with an ellipsis in the trigger.', code: "label: 'Ease In Out (Cubic)'", label: 'easing', value: 'in-out', options: [{ value: 'linear', label: 'Linear' }, { value: 'in', label: 'Ease In (Quad)' }, { value: 'out', label: 'Ease Out (Quad)' }, { value: 'in-out', label: 'Ease In Out (Cubic)' }] },
];

// ── Toggle / Text / Color variants ────────────────────────────────
type ToggleVariant = { id: string; title: string; desc: string; code: string; label: string; value: boolean; shortcut?: ShortcutConfig };
const TOGGLE_VARIANTS: ToggleVariant[] = [
  { id: 'off', title: 'Off state', desc: 'A boolean renders an Off / On segmented control.', code: 'visible: false', label: 'visible', value: false },
  { id: 'on', title: 'On state', desc: 'The active segment animates with a spring-driven pill.', code: 'darkMode: true', label: 'darkMode', value: true },
  { id: 'toggle-shortcut', title: 'With shortcut', desc: 'Toggles accept a key shortcut — shown as a pill on the label.', code: "grid: { key: 'g' }", label: 'grid', value: true, shortcut: { key: 'g' } },
];

const TEXT_VARIANTS = [
  { id: 'text-value', title: 'With value', desc: 'Non-hex strings auto-detect as text inputs.', code: "title: 'Japan'", label: 'title', value: 'Japan', placeholder: undefined as string | undefined },
  { id: 'text-placeholder', title: 'With placeholder', desc: 'The explicit form adds a placeholder and default.', code: "{ type: 'text', placeholder: '…' }", label: 'subtitle', value: '', placeholder: 'Enter subtitle…' },
] as const;

const COLOR_VARIANTS = [
  { id: 'hex6', title: 'Six-digit hex', desc: 'Hex strings auto-detect as color pickers with a live swatch.', code: "accent: '#c41e3a'", label: 'accent', value: '#c41e3a' },
  { id: 'hex3', title: 'Shorthand hex', desc: 'Three-digit hex is expanded for the native picker.', code: "ink: '#09f'", label: 'ink', value: '#09f' },
  { id: 'hex8', title: 'With alpha', desc: 'Eight-digit hex carries an alpha channel.', code: "tint: '#00000080'", label: 'tint', value: '#00000080' },
] as const;

/** Finds a registered panel's id by name — needed to wire the store-coupled
 *  components (SpringControl, TransitionControl, ShortcutsMenu) to a live panel. */
function useLivePanelId(name: string): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setId(DialStore.getPanels().find((p) => p.name === name)?.id ?? null);
    sync();
    return DialStore.subscribeGlobal(sync);
  }, [name]);
  return id;
}

const LIVE_PANEL = 'Playground';

export function Library() {
  const [theme, setTheme] = useState<Theme>('dark');

  const [numbers, setNumbers] = useState<Record<string, number>>(() => Object.fromEntries(SLIDER_VARIANTS.map((v) => [v.id, v.value])));
  const [selects, setSelects] = useState<Record<string, string>>(() => Object.fromEntries(SELECT_VARIANTS.map((v) => [v.id, v.value])));
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => Object.fromEntries(TOGGLE_VARIANTS.map((v) => [v.id, v.value])));
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(TEXT_VARIANTS.map((v) => [v.id, v.value])));
  const [colors, setColors] = useState<Record<string, string>>(() => Object.fromEntries(COLOR_VARIANTS.map((v) => [v.id, v.value])));
  const [lastAction, setLastAction] = useState('—');

  // Standalone Folder demo state
  const [folderBlur, setFolderBlur] = useState(14);
  const [folderShadow, setFolderShadow] = useState(true);

  // Store-coupled building blocks (wired to the live panel below)
  const [springVal, setSpringVal] = useState<SpringConfig>({ type: 'spring', visualDuration: 0.5, bounce: 0.25 });
  const [transitionVal, setTransitionVal] = useState<TransitionConfig>({ type: 'spring', visualDuration: 0.4, bounce: 0.2 });
  const easingPreview: EasingConfig = { type: 'easing', duration: 0.4, ease: [0.65, -0.4, 0.35, 1.4] };

  // The real, live panel — registers into DialStore and powers the preview.
  const p = useDialKit(LIVE_PANEL, {
    size: [120, 60, 200],
    radius: [28, 0, 100],
    color: '#6366f1',
    label: 'Press',
    variant: { type: 'select' as const, options: ['solid', 'outline', 'ghost'], default: 'solid' },
    glow: true,
    spring: { type: 'spring' as const, visualDuration: 0.5, bounce: 0.3 },
    shadow: {
      blur: [24, 0, 80],
      opacity: [0.35, 0, 1],
    },
  }, {
    shortcuts: {
      size: { key: 's', mode: 'coarse' },
      glow: { key: 'g' },
      radius: { interaction: 'scroll-only' },
    },
  });

  const liveId = useLivePanelId(LIVE_PANEL);

  const setNumber = (id: string, v: number) => setNumbers((s) => ({ ...s, [id]: v }));
  const setSelect = (id: string, v: string) => setSelects((s) => ({ ...s, [id]: v }));
  const setToggle = (id: string, v: boolean) => setToggles((s) => ({ ...s, [id]: v }));
  const setText = (id: string, v: string) => setTexts((s) => ({ ...s, [id]: v }));
  const setColor = (id: string, v: string) => setColors((s) => ({ ...s, [id]: v }));

  // Live preview styling derived from the panel values
  const previewStyle = (() => {
    const solid = p.variant === 'solid';
    const ghost = p.variant === 'ghost';
    return {
      width: p.size,
      height: p.size,
      borderRadius: p.radius,
      background: solid ? p.color : ghost ? 'transparent' : 'transparent',
      border: solid ? 'none' : `2px solid ${p.color}`,
      color: solid ? '#fff' : p.color,
      boxShadow: p.glow ? `0 0 ${p.shadow.blur}px ${withAlpha(p.color, p.shadow.opacity)}` : 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 15,
      fontWeight: 600,
      transition: 'all 0.2s ease',
    } as const;
  })();

  return (
    <div className="dialkit-root lib-page" data-theme={theme}>
      <style>{CSS}</style>

      <header className="lib-header">
        <div className="lib-header-top">
          <Link to="/" className="lib-back">← Demo</Link>
          <div className="lib-theme-switch" role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} className="lib-theme-btn" data-active={String(theme === t)} onClick={() => setTheme(t)}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>

        <div className="lib-eyebrow"><span className="lib-dot" /> DialKit · Component Library</div>
        <h1 className="lib-title">The Whole Kit</h1>
        <p className="lib-lead">
          Every control DialKit ships with, live and interactive — sliders, selectors, toggles,
          text, color, actions, structure, motion, and the real panel itself. One eagle-eye view
          of everything you compose with <code>useDialKit</code>.
        </p>
      </header>

      <main className="lib-main">
        <Section index="01" title="Sliders" count={SLIDER_VARIANTS.length} hint="Drag to set · click to snap · hover the value 800ms then click to type.">
          {SLIDER_VARIANTS.map((v) => (
            <Card key={v.id} title={v.title} desc={v.desc} code={v.code}>
              <Slider label={v.label} value={numbers[v.id]} onChange={(val) => setNumber(v.id, val)} min={v.min} max={v.max} step={v.step} shortcut={v.shortcut} shortcutActive={v.shortcutActive} unit={v.unit} formatValue={v.formatValue} valueIcon={v.renderIcon?.(numbers[v.id])} />
            </Card>
          ))}
        </Section>

        <Section index="02" title="Selectors" count={SELECT_VARIANTS.length} hint="Click a row to open its dropdown — it repositions to stay on screen.">
          {SELECT_VARIANTS.map((v) => (
            <Card key={v.id} title={v.title} desc={v.desc} code={v.code}>
              <SelectControl label={v.label} value={selects[v.id]} options={v.options} onChange={(val) => setSelect(v.id, val)} />
            </Card>
          ))}
        </Section>

        <Section index="03" title="Toggles" count={TOGGLE_VARIANTS.length} hint="A boolean becomes an Off / On segmented control with a spring pill.">
          {TOGGLE_VARIANTS.map((v) => (
            <Card key={v.id} title={v.title} desc={v.desc} code={v.code}>
              <Toggle label={v.label} checked={toggles[v.id]} onChange={(val) => setToggle(v.id, val)} shortcut={v.shortcut} />
            </Card>
          ))}
        </Section>

        <Section index="04" title="Text" count={TEXT_VARIANTS.length} hint="Inline text inputs — click to edit, with optional placeholder.">
          {TEXT_VARIANTS.map((v) => (
            <Card key={v.id} title={v.title} desc={v.desc} code={v.code}>
              <TextControl label={v.label} value={texts[v.id]} onChange={(val) => setText(v.id, val)} placeholder={v.placeholder} />
            </Card>
          ))}
        </Section>

        <Section index="05" title="Color" count={COLOR_VARIANTS.length} hint="Click the hex to type, or the swatch to open the native picker.">
          {COLOR_VARIANTS.map((v) => (
            <Card key={v.id} title={v.title} desc={v.desc} code={v.code}>
              <ColorControl label={v.label} value={colors[v.id]} onChange={(val) => setColor(v.id, val)} />
            </Card>
          ))}
        </Section>

        <Section index="06" title="Actions & Structure" count={4} hint="Action buttons fire callbacks; folders group controls; visualizations preview motion.">
          <Card title="Action button" desc="A single { type: 'action' } fires a callback with no stored value." code="shuffle: { type: 'action' }">
            <ButtonGroup buttons={[{ label: 'Shuffle', onClick: () => setLastAction('shuffle') }]} />
            <ActionLog value={lastAction} />
          </Card>
          <Card title="Button group" desc="Adjacent actions stack into a single vertical group." code="next / previous / reset">
            <ButtonGroup buttons={[
              { label: 'Next', onClick: () => setLastAction('next') },
              { label: 'Previous', onClick: () => setLastAction('previous') },
              { label: 'Reset', onClick: () => setLastAction('reset') },
            ]} />
            <ActionLog value={lastAction} />
          </Card>
          <Card title="Folder" desc="Any nested object becomes a collapsible folder. Click the header to toggle." code="shadow: { blur, opacity }">
            <Folder title="shadow" defaultOpen>
              <Slider label="blur" value={folderBlur} onChange={setFolderBlur} min={0} max={60} step={1} />
              <Toggle label="enabled" checked={folderShadow} onChange={setFolderShadow} />
            </Folder>
          </Card>
          <Card title="Easing curve" desc="EasingVisualization plots a cubic-bézier curve, overshoot included." code="{ type: 'easing', ease: […] }">
            <div className="lib-viz"><EasingVisualization easing={easingPreview} /></div>
          </Card>
        </Section>

        <Section index="07" title="Motion editors" count={2} hint="Spring and transition editors with a live animation-curve preview. Toggle their modes.">
          {liveId ? (
            <>
              <Card title="SpringControl" desc="Time (visualDuration + bounce) or Physics (stiffness, damping, mass)." code="{ type: 'spring', bounce: 0.25 }">
                <SpringControl panelId={liveId} path="__demo.spring" label="spring" spring={springVal} onChange={setSpringVal} />
              </Card>
              <Card title="TransitionControl" desc="Adds an Easing mode on top of Time and Physics — switch between all three." code="{ type: 'easing' | 'spring' }">
                <TransitionControl panelId={liveId} path="__demo.transition" label="transition" value={transitionVal} onChange={setTransitionVal} />
              </Card>
            </>
          ) : (
            <div className="lib-viz"><SpringVisualization spring={springVal} isSimpleMode /></div>
          )}
        </Section>

        <section className="lib-section">
          <div className="lib-section-head">
            <div className="lib-section-headline">
              <span className="lib-section-index">08</span>
              <h2 className="lib-section-title">Live panel</h2>
              {liveId && <ShortcutsMenu panelId={liveId} />}
            </div>
            <p className="lib-section-hint">
              The real DialKit panel, embedded inline and driving the preview — presets, copy,
              folders, the spring editor, and shortcut pills, exactly as in your app.
            </p>
          </div>

          <div className="lib-live">
            <div className="lib-preview-stage">
              <div style={previewStyle}>{p.label}</div>
            </div>
            <div className="lib-window">
              <DialRoot mode="inline" theme={theme} productionEnabled />
            </div>
          </div>
        </section>
      </main>

      <footer className="lib-footer">
        Built entirely from the live DialKit components — the same code that renders inside the panel.
      </footer>
    </div>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ActionLog({ value }: { value: string }) {
  return <div className="lib-action-log">last action ▸ <span>{value}</span></div>;
}

function Section({ index, title, count, hint, children }: { index: string; title: string; count: number; hint: string; children: React.ReactNode }) {
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

function Card({ title, desc, code, children }: { title: string; desc: string; code: string; children: React.ReactNode }) {
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
.lib-page[data-theme="light"] { --lib-bg: #efefef; }
.lib-page *, .lib-page *::before, .lib-page *::after { box-sizing: border-box; }

.lib-page::before {
  content: '';
  position: fixed;
  top: -180px; left: 50%;
  width: 900px; height: 420px;
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
.lib-header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; }

.lib-back { font-size: 13px; font-weight: 500; color: var(--dial-text-label); text-decoration: none; transition: color 0.15s; }
.lib-back:hover { color: var(--dial-text-root); }

.lib-theme-switch { display: inline-flex; padding: 3px; gap: 2px; background: var(--dial-surface); border: 1px solid var(--dial-border); border-radius: 999px; }
.lib-theme-btn { font-family: inherit; font-size: 12px; font-weight: 600; padding: 5px 14px; border: none; border-radius: 999px; background: transparent; color: var(--dial-text-label); cursor: pointer; transition: background 0.18s, color 0.18s; }
.lib-theme-btn[data-active="true"] { background: var(--dial-surface-active); color: var(--dial-text-root); }

.lib-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dial-text-tertiary); }
.lib-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--lib-accent); box-shadow: 0 0 12px var(--lib-accent); }

.lib-title { margin: 14px 0 0; font-size: clamp(34px, 6vw, 56px); font-weight: 600; letter-spacing: -0.03em; line-height: 1.02; }
.lib-lead { margin: 16px 0 0; max-width: 600px; font-size: 16px; line-height: 1.55; color: var(--dial-text-section); }
.lib-lead code { font-family: 'Geist Mono', monospace; font-size: 0.9em; padding: 1px 5px; border-radius: 5px; background: var(--dial-surface); color: var(--dial-text-root); }

.lib-main { padding-bottom: 8px; }
.lib-section { padding-top: 36px; }
.lib-section-head { padding-bottom: 18px; margin-bottom: 22px; border-bottom: 1px solid var(--dial-surface-subtle); }
.lib-section-headline { display: flex; align-items: baseline; gap: 12px; }
.lib-section-index { font-family: 'Geist Mono', monospace; font-size: 13px; font-weight: 500; color: var(--lib-accent); }
.lib-section-title { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
.lib-section-count { font-family: 'Geist Mono', monospace; font-size: 12px; font-weight: 500; color: var(--dial-text-tertiary); padding: 2px 8px; border-radius: 999px; background: var(--dial-surface); }
.lib-section-hint { margin: 10px 0 0; font-size: 13.5px; color: var(--dial-text-tertiary); }

/* Surface the ShortcutsMenu trigger (normally inside a panel) on the section head */
.lib-section-headline .dialkit-shortcuts-trigger { margin-left: auto; align-self: center; }

.lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; align-items: start; }

.lib-card { display: flex; flex-direction: column; background: var(--dial-glass-bg); border: 1px solid var(--dial-border); border-radius: 16px; padding: 14px; transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; }
.lib-card:hover { transform: translateY(-2px); border-color: var(--dial-border-hover); box-shadow: var(--dial-shadow); }

.lib-stage { display: flex; flex-direction: column; gap: 6px; padding: 4px 0 16px; }
.lib-viz { padding: 4px 0; }

.lib-action-log { font-family: 'Geist Mono', monospace; font-size: 11px; color: var(--dial-text-tertiary); padding-left: 2px; }
.lib-action-log span { color: var(--dial-text-label); }

.lib-meta { border-top: 1px solid var(--dial-surface-subtle); padding-top: 14px; }
.lib-card-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: var(--dial-text-root); }
.lib-card-desc { margin: 6px 0 12px; font-size: 12.5px; line-height: 1.5; color: var(--dial-text-section); min-height: 38px; }
.lib-code { display: block; font-family: 'Geist Mono', monospace; font-size: 11.5px; line-height: 1.5; color: var(--dial-text-label); background: var(--dial-surface); border: 1px solid var(--dial-border); border-radius: 8px; padding: 8px 10px; white-space: pre; overflow-x: auto; }
.lib-code::-webkit-scrollbar { height: 0; }

/* Live panel section */
.lib-live { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: stretch; }
.lib-preview-stage {
  display: flex; align-items: center; justify-content: center;
  min-height: 540px;
  background: var(--dial-glass-bg);
  border: 1px solid var(--dial-border);
  border-radius: 16px;
  background-image: radial-gradient(circle at center, color-mix(in srgb, var(--lib-accent) 8%, transparent), transparent 70%);
}
.lib-window {
  height: 540px;
  background: var(--dial-glass-bg);
  border: 1px solid var(--dial-border);
  border-radius: 16px;
  overflow: hidden;
  padding: 4px;
}

.lib-footer { padding: 44px 28px 60px; font-size: 12.5px; color: var(--dial-text-tertiary); text-align: center; }

@media (max-width: 760px) {
  .lib-live { grid-template-columns: 1fr; }
  .lib-window { height: 480px; }
}
@media (max-width: 520px) { .lib-grid { grid-template-columns: 1fr; } }
`;
