import { defineConfig } from 'vite';

// dialkit is linked from the repo root, so dedupe keeps one copy of Lit for both.
export default defineConfig({ resolve: { dedupe: ['lit'] } });
