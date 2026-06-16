import { defineConfig } from 'tsup';
import { solidPlugin } from 'esbuild-plugin-solid';

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
    onSuccess: 'cp src/styles/theme.css dist/styles.css',
  },
  // Solid build
  {
    entry: { index: 'src/solid/index.ts' },
    outDir: 'dist/solid',
    format: ['esm', 'cjs'],
    dts: {
      compilerOptions: {
        jsx: 'preserve',
        jsxImportSource: 'solid-js',
      },
    },
    splitting: false,
    sourcemap: true,
    external: ['solid-js', 'solid-js/web', 'motion'],
    tsconfig: 'tsconfig.solid.json',
    esbuildPlugins: [solidPlugin()],
  },
  // Vue build
  {
    entry: { index: 'src/vue/index.ts' },
    outDir: 'dist/vue',
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    external: ['vue', 'motion-v'],
    tsconfig: 'tsconfig.vue.json',
  },
  // Shared leaf modules emitted to dist root. The packaged Svelte components keep
  // their `../../icons` / `../../shortcut-utils` import specifiers (svelte-package
  // does not reach outside src/svelte), so those files must exist at dist root.
  // React/Solid/Vue bundle them inline, so this standalone emission is for Svelte.
  // shortcut-utils references the DialStore singleton — externalize it to the shared
  // dist/store rather than inlining a second, desynced store instance.
  {
    entry: { icons: 'src/icons.ts', 'shortcut-utils': 'src/shortcut-utils.ts' },
    outDir: 'dist',
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    esbuildPlugins: [
      {
        name: 'externalize-dialstore',
        setup(build) {
          build.onResolve({ filter: /store\/DialStore$/ }, () => ({
            path: 'dialkit/store',
            external: true,
          }));
        },
      },
    ],
  },
]);
