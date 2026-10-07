import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run deck3:build → out/concrete-v3/index.html（写真・フォント込みの1ファイル）
export default defineConfig({
  root: 'concrete/v3',
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../../out/concrete-v3', emptyOutDir: true, assetsInlineLimit: 100_000_000, target: 'es2022' },
});
