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
    external: ['vue'],
    tsconfig: 'tsconfig.vue.json',
  },
]);
