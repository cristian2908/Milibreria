import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

// Copia Tesseract (motor, worker y datos de español) para leer portadas sin internet.
function copyTesseract(dest, asText = false) {
  return {
    name: 'copiar-tesseract',
    apply: 'build',
    closeBundle() {
      try {
        const req = createRequire(import.meta.url);
        const tdir = dirname(req.resolve('tesseract.js/package.json'));
        const cdir = dirname(req.resolve('tesseract.js-core/package.json'));
        const sdir = dirname(req.resolve('@tesseract.js-data/spa/package.json'));
        mkdirSync(`${dest}/core`, { recursive: true }); mkdirSync(`${dest}/lang`, { recursive: true });
        // Arreglo de tesseract.js 7: al iniciar usa los bytes del idioma como nombre (l.data en vez de l.code)
        // cuando el idioma se entrega en memoria. Reemplazo exacto; si no está, se copia sin cambios.
        const BUG = 'return"string"==typeof t?t:t.data}';
        let worker = readFileSync(`${tdir}/dist/worker.min.js`, 'utf8');
        if (asText && worker.split(BUG).length === 2) worker = worker.replace(BUG, 'return"string"==typeof t?t:t.code}');
        else if (asText) console.warn('tesseract worker: no se encontró el patrón a corregir');
        writeFileSync(`${dest}/worker.min.js`, worker);
        for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) copyFileSync(`${cdir}/${f}`, `${dest}/core/${f}`);
        const gz = `${sdir}/4.0.0_best_int/spa.traineddata.gz`;
        // la vista previa de Claude no sirve .gz: ahí va en base64 dentro de un .txt
        if (asText) writeFileSync(`${dest}/lang/spa.traineddata.txt`, readFileSync(gz).toString('base64'));
        else copyFileSync(gz, `${dest}/lang/spa.traineddata.gz`);
      } catch (e) {
        console.warn('No se copió Tesseract:', e.message);
      }
    },
  };
}

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
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile(), copyTesseract('dist-demo/tesseract', true)] : [copyOpenCV(), copyTesseract('dist/vendor/tesseract')])],
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: { proxy: { '/api': 'http://localhost:3001' } },
}));
