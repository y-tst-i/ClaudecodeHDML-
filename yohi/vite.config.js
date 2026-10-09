import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npx vite build --config yohi/vite.config.js → out/yohi-exp/experience.html（素材・音込みの1ファイル）
export default defineConfig({
  root: 'yohi',
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../out/yohi-exp', emptyOutDir: true, assetsInlineLimit: 100_000_000, target: 'es2022', rollupOptions: { input: 'yohi/experience.html' } },
});
