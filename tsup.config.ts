import { defineConfig } from 'tsup';
import { solidPlugin } from 'esbuild-plugin-solid';

// Rewrite the relative imports of DialKit's shared singleton modules to their
// canonical package subpaths and mark them external. This keeps store and MIDI
// runtime identity real across the React/Solid/Vue bundles (each resolves to the
// same dist/store and dist/midi), matching how the unbundled Svelte package
// already imports `dialkit/store` and `dialkit/midi`.
const externalPackageSingletonsPlugin = {
  name: 'external-package-singletons',
  setup(build: {
    onResolve: (
      options: { filter: RegExp },
      callback: () => { path: string; external: boolean }
    ) => void;
  }) {
    build.onResolve({ filter: /(?:^|\/)store\/DialStore$/ }, () => ({
      path: 'dialkit/store',
      external: true,
    }));
    build.onResolve({ filter: /(?:^|\/)midi(?:\/index)?$/ }, () => ({
      path: 'dialkit/midi',
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
    esbuildPlugins: [externalPackageSingletonsPlugin],
  },
  // Shared Web MIDI runtime used by the unbundled Svelte package entry.
  {
    entry: { index: 'src/midi/index.ts' },
    outDir: 'dist/midi',
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    esbuildPlugins: [externalPackageSingletonsPlugin],
  },
  // Shared modules referenced by the packaged Svelte components.
  {
    entry: {
      icons: 'src/icons.ts',
      'dropdown-position': 'src/dropdown-position.ts',
      'panel-drag': 'src/panel-drag.ts',
      'shortcut-utils': 'src/shortcut-utils.ts',
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    esbuildPlugins: [externalPackageSingletonsPlugin],
  },
  // React build
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    external: ['react', 'react-dom', 'motion'],
    esbuildPlugins: [externalPackageSingletonsPlugin],
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";',
      };
    },
    onSuccess: 'cp src/styles/theme.css dist/styles.css',
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
    esbuildPlugins: [externalPackageSingletonsPlugin, solidPlugin()],
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
    esbuildPlugins: [externalPackageSingletonsPlugin],
  },
]);
