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
      transformIndexHtml(html: string) {
        return html
          .replace(/<script type="module"/g, '<script defer')
          .replace(/ crossorigin/g, '');
      },
    },
  ],
  root: './src/renderer',
  base: './',
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
