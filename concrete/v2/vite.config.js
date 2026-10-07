import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'concrete/v2',
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../../out/concrete-v2', emptyOutDir: true, assetsInlineLimit: 100_000_000, target: 'es2022' },
});
