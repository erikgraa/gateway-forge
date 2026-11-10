import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] }
});
