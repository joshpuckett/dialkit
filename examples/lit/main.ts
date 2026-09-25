import { LitElement, css, html } from 'lit';
import { DialKitController, DialTimelineController, DialStore, TimelineStore, type DialPosition, type DialTheme } from 'dialkit/lit';

const params = new URLSearchParams(location.search);
const theme = (params.get('theme') ?? 'dark') as DialTheme;
const position = (params.get('position') ?? 'top-right') as DialPosition;

export class DemoApp extends LitElement {
  static styles = css`
    * { box-sizing: border-box; }
    main { max-width: 740px; padding: 64px 40px 440px; }
    h1 { font-size: 36px; letter-spacing: -.04em; font-weight: 500; margin: 8px 0; }
    p { color: #aaa; max-width: 500px; }
    .eyebrow { font: 12px monospace; text-transform: uppercase; letter-spacing: .12em; color: #aaa; }
    .stage { height: 250px; display: grid; place-items: center; margin: 24px 0; background: #202020; border-radius: 20px; overflow: hidden; }
    .card { width: 140px; height: 140px; display: grid; place-items: center; color: #171717; font-weight: 600; text-align: center; white-space: pre-wrap; background-size: cover; }
    button { background: #333; color: #eee; border: 1px solid #444; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
    output { display: block; font: 12px/1.6 monospace; color: #888; overflow-wrap: anywhere; margin-top: 16px; }
    aside { width: 320px; margin-top: 24px; }
  `;
  static properties = { lastAction: { state: true } };
  declare lastAction: string;

  // Controllers register while this element is connected and re-render it on every change.
  dial = new DialKitController(this, 'Card', {
    radius: [24, 0, 64, 1], scale: [1, .5, 1.5, .01], visible: true,
    title: { type: 'text', default: 'Hello, Lit.' },
    accent: { type: 'color', default: '#a78bfa' },
    choice: { type: 'select', options: ['center', 'left', 'right'] },
    cover: { type: 'image', options: [{ value: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="coral"/%3E%3C/svg%3E', label: 'Coral' }] },
    position: { type: 'pad', x: [0, -1, 1, .01], y: [0, -1, 1, .01] },
    motion: { _collapsed: true, spring: { type: 'spring', visualDuration: .3, bounce: .2 }, transition: { type: 'easing', duration: .5, ease: [.25, -.6, .6, 1.6] } },
    actions: { _collapsed: true, replay: { type: 'action' }, reset: { type: 'action' } },
  }, {
    id: 'lit-card', persist: true, shortcuts: { radius: { key: 'r' }, visible: { key: 'v' } },
    onAction: action => {
      this.lastAction = action;
      if (action === 'actions.replay') this.timeline.replay();
      if (action === 'actions.reset') this.dial.resetValues();
    },
  });
  timeline = new DialTimelineController(this, 'Card movement', {
    duration: 4,
    card: {
      move: { at: .5, duration: 2, from: { x: -80 }, to: { x: 80 }, transition: { type: 'easing', duration: 2, ease: [.25, .1, .25, 1] } },
      pulse: { at: 0, from: { opacity: .4 }, steps: [{ duration: 1, to: { opacity: 1 } }, { duration: 1, to: { opacity: .4 } }] },
    },
  }, { autoplay: false });

  constructor() {
    super();
    this.lastAction = 'No action yet';
  }

  render() {
    const p = this.dial.values;
    const t = this.timeline.values;
    const inline = params.has('inline');
    return html`
      <main>
        <div class="eyebrow">DialKit / Lit</div>
        <h1>A few dials. One controller.</h1>
        <p>Every control, read straight from <code>this.dial.values</code> in render(). Hold R and scroll to change the radius. Scrub the timeline to move the card.</p>
        <div class="stage">
          <div class="card" style=${`border-radius:${p.radius}px;background-color:${p.accent};background-image:${p.cover ? `url(${JSON.stringify(p.cover)})` : 'none'};transform:translate(${t.card.move.current.x + p.position.x * 40}px,${-p.position.y * 40}px) scale(${p.scale});visibility:${p.visible ? 'visible' : 'hidden'};opacity:${t.card.pulse.current.opacity};text-align:${p.choice}`}>${p.title}</div>
        </div>
        <button @click=${() => this.dial.resetValues()}>Reset values</button>
        <button @click=${() => this.dial.setOpen(true)}>Open panel</button>
        <button @click=${() => this.dial.setOpen(false)}>Close panel</button>
        <output aria-label="Values">${JSON.stringify(p)}</output>
        <output aria-label="Last action">${this.lastAction}</output>
        ${inline
          ? html`<aside><dialkit-root mode="inline" theme=${theme}></dialkit-root></aside>`
          : html`<dialkit-root theme=${theme} position=${position}></dialkit-root>`}
        <dialkit-timeline theme=${theme}></dialkit-timeline>
      </main>
    `;
  }
}
customElements.define('demo-app', DemoApp);

// Exposed for the browser integration script.
const app = document.querySelector('demo-app') as DemoApp;
Object.assign(window, { demo: { app, kit: app.dial, timeline: app.timeline }, stores: { DialStore, TimelineStore } });
