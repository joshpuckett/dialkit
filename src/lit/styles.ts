import { unsafeCSS, type CSSResult } from 'lit';
import themeCSS from './theme-css';
// Same id as the Svelte adapter, so mixed pages inject the theme once.
const THEME_ID = 'dialkit-theme';
/** The DialKit theme for `static styles`. Constructable sheets reject `@import`, so the font import is dropped. */
export const dialKitStyles: CSSResult = unsafeCSS(themeCSS.replace(/^@import[^\n]*\n/m, ''));
/** Lit's convention for nonce-based CSPs: `window.litNonce` marks every style element the library creates itself. */
function createStyle(doc: Document) {
  const style = doc.createElement('style');
  const nonce = (globalThis as { litNonce?: string }).litNonce;
  if (nonce !== undefined)
    style.setAttribute('nonce', nonce);
  return style;
}
export function ensureDocumentStyles(doc: Document = document) {
  if (doc.getElementById(THEME_ID))
    return;
  const style = createStyle(doc);
  style.id = THEME_ID;
  style.textContent = themeCSS;
  doc.head.appendChild(style);
}
/** Inline roots inside a shadow tree need the theme in that tree, not only in the document. */
export function ensureShadowStyles(root: ShadowRoot) {
  const sheet = dialKitStyles.styleSheet;
  if (sheet && 'adoptedStyleSheets' in root) {
    if (!root.adoptedStyleSheets.includes(sheet))
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    return;
  }
  if (root.querySelector(`style[data-${THEME_ID}]`))
    return;
  const style = createStyle(root.ownerDocument);
  style.setAttribute(`data-${THEME_ID}`, '');
  style.textContent = dialKitStyles.cssText;
  root.prepend(style);
}
