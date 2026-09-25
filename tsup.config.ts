import { resolve } from 'node:path';
import { defineConfig } from 'tsup';
import { solidPlugin } from 'esbuild-plugin-solid';
import { THEME_CSS, writeThemeModules } from './scripts/gen-theme-css.js';

// The generated theme modules must exist before any build starts, including the type declarations.
writeThemeModules();

// The Lit entry reads the theme straight from src/styles/theme.css, so watch mode rebuilds it when the CSS changes
// and refreshes the generated modules for tsc and the tests; those writes are not build inputs, so nothing loops.
const themeCSSPlugin = {
  name: 'dialkit-theme-css',
  setup(build: { onStart: (callback: () => void) => void; onResolve: (options: { filter: RegExp }, callback: () => { path: string }) => void }) {
    build.onStart(() => { writeThemeModules(); });
    build.onResolve({ filter: /^\.\/theme-css$/ }, () => ({ path: resolve(THEME_CSS) }));
  },
};

const externalPackageStorePlugin = {
  name: 'external-package-store',
  setup(build: { onResolve: (options: { filter: RegExp }, callback: () => { path: string; external: boolean }) => void }) {
    build.onResolve({ filter: /^\.\/store\/DialStore$/ }, () => ({
      path: 'dialkit/store',
      external: true,
    }));
  },
};

export default defineConfig([
  // Store build (shared across all framework entries)
  {
    entry: { index: 'src/store/DialStore.ts' },
    outDir: 'dist/store',
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
  },
  // Framework-neutral timeline runtime. Svelte consumes this as a package
  // subpath because svelte-package preserves imports instead of bundling it.
  {
    entry: { index: 'src/timeline/index.ts' },
    outDir: 'dist/timeline',
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    esbuildPlugins: [externalPackageStorePlugin],
  },
  // Shared modules referenced by the packaged Svelte components.
  {
    entry: {
      icons: 'src/icons.ts',
      'copy-instruction': 'src/copy-instruction.ts',
      'dropdown-position': 'src/dropdown-position.ts',
      'panel-drag': 'src/panel-drag.ts',
      'panel-size': 'src/panel-size.ts',
      'color-control': 'src/color-control.ts',
      'image-control': 'src/image-control.ts',
      'dial-pad-control': 'src/dial-pad-control.ts',
      'dial-pad': 'src/dial-pad.ts',
      'easing-control': 'src/easing-control.ts',
      'easing-geometry': 'src/easing-geometry.ts',
      'control-keyboard': 'src/control-keyboard.ts',
      'dropdown-keyboard': 'src/dropdown-keyboard.ts',
      'text-autosize': 'src/text-autosize.ts',
      'shortcut-utils': 'src/shortcut-utils.ts',
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    esbuildPlugins: [externalPackageStorePlugin],
  },
  // Dependency-free DOM adapter, including a single script for plain HTML.
  {
    entry: { index: 'src/vanilla/index.ts' },
    outDir: 'dist/vanilla',
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
  },
  {
    entry: { browser: 'src/vanilla/index.ts' },
    outDir: 'dist/vanilla',
    format: ['iife'],
    globalName: 'DialKit',
    define: { 'import.meta': '{}' },
    splitting: false,
    sourcemap: true,
  },
  // React build
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    external: ['react', 'react-dom', 'motion'],
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";',
      };
    },
    onSuccess: 'node scripts/copy-styles.mjs',
  },
  // Solid build
  {
    entry: { index: 'src/solid/index.ts' },
    outDir: 'dist/solid',
    format: ['esm'],
    dts: {
      compilerOptions: {
        jsx: 'preserve',
        jsxImportSource: 'solid-js',
      },
    },
    splitting: false,
    sourcemap: true,
    external: ['solid-js', 'solid-js/web', 'solid-js/store', 'motion'],
    tsconfig: 'tsconfig.solid.json',
    esbuildPlugins: [solidPlugin()],
  },
  // Vue build
  {
    entry: { index: 'src/vue/index.ts' },
    outDir: 'dist/vue',
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    external: ['vue', 'motion-v'],
    tsconfig: 'tsconfig.vue.json',
  },
  // Lit build: ESM-only, Lit itself stays external.
  {
    entry: { index: 'src/lit/index.ts' },
    outDir: 'dist/lit',
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    external: [/^lit(\/|$)/, /^@lit\//, /^lit-html(\/|$)/, /^lit-element(\/|$)/],
    tsconfig: 'tsconfig.lit.json',
    loader: { '.css': 'text' },
    esbuildPlugins: [themeCSSPlugin],
  },
]);
