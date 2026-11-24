import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`       → dist/ para servir con Nginx en /estanteria/
// `npm run build:demo`  → un solo index.html autocontenido (vista previa)
export default defineConfig(({ mode }) => ({
  base: mode === 'demo' ? './' : '/estanteria/',
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: { proxy: { '/api': 'http://localhost:3001' } },
}));
