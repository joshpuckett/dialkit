import { defineConfig } from 'tsup';
import { solidPlugin } from 'esbuild-plugin-solid';

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
  // Shared modules referenced by the packaged Svelte components.
  {
    entry: {
      icons: 'src/icons.ts',
      'shortcut-utils': 'src/shortcut-utils.ts',
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    esbuildPlugins: [externalPackageStorePlugin],
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
]);
