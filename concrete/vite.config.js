import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run deck:build → out/concrete/index.html（フォントも全部入りの1ファイル。ダブルクリックで開ける）
export default defineConfig({
  root: 'concrete',
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../out/concrete', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
});
