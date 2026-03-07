import { readFileSync, writeFileSync } from 'fs';

const css = readFileSync('src/styles/styles.css', 'utf8');
const escaped = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
writeFileSync(
  'src/svelte/theme-css.ts',
  `// Auto-generated from src/styles/styles.css — do not edit\nexport const themeCSS = \`${escaped}\`;\n`
);
