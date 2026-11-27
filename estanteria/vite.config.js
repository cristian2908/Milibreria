import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Copia OpenCV.js a dist/vendor/ para servirlo desde el mismo dominio (recorte automático).
function copyOpenCV() {
  return {
    name: 'copiar-opencv',
    apply: 'build',
    closeBundle() {
      try {
        const src = createRequire(import.meta.url).resolve('@techstark/opencv-js/dist/opencv.js');
        mkdirSync('dist/vendor', { recursive: true });
        copyFileSync(src, 'dist/vendor/opencv.js');
      } catch (e) {
        console.warn('No se copió OpenCV.js (se usará jsDelivr):', e.message);
      }
    },
  };
}

// `npm run build`       → dist/ para servir con Nginx en /estanteria/
// `npm run build:demo`  → un solo index.html autocontenido (vista previa)
export default defineConfig(({ mode }) => ({
  base: mode === 'demo' ? './' : '/estanteria/',
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [copyOpenCV()])],
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: { proxy: { '/api': 'http://localhost:3001' } },
}));
