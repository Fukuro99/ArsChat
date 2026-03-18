import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Electron の file:// で ES module が動かない問題を回避
    {
      name: 'electron-html-patch',
      enforce: 'post' as const,
      apply: 'build' as const,
      transformIndexHtml(html: string) {
        return html
          .replace(/<script type="module"/g, '<script defer')
          .replace(/ crossorigin/g, '');
      },
    },
  ],
  root: './src/renderer',
  base: './',
  // Monaco Editor を dev サーバーで事前バンドル（HMR 速度改善）
  optimizeDeps: {
    include: ['monaco-editor'],
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
      // Monaco の Worker URL 関連の警告を抑制
      onwarn(warning, defaultWarn) {
        if (warning.message?.includes('import.meta.url')) return;
        if (warning.code === 'EVAL') return;
        defaultWarn(warning);
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: 5173,
  },
});
