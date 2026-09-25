// Turns src/styles/theme.css into the gitignored theme modules that the Svelte and Lit entries import.
// Run directly (build, test, typecheck) or through tsup.config.ts, which also regenerates them while watching.
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export const THEME_CSS = 'src/styles/theme.css';
const targets = ['src/svelte/theme-css.ts', 'src/lit/theme-css.ts'];

/** The module source for the current stylesheet. */
export function themeModule() {
  const css = readFileSync(THEME_CSS, 'utf8');
  const escaped = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  return `// Auto-generated from ${THEME_CSS} — do not edit\nexport const themeCSS = \`${escaped}\`;\nexport default themeCSS;\n`;
}

/** Writes the modules, leaving unchanged files alone so watchers see no spurious change. */
export function writeThemeModules() {
  const module = themeModule();
  for (const target of targets) {
    let current;
    try { current = readFileSync(target, 'utf8'); } catch {}
    if (current !== module) writeFileSync(target, module);
  }
  return module;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/gen-theme-css.js')) writeThemeModules();
