// Enlace público de la estantería (para abrirla en el navegador si la app no permite fotos)
export const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || 'https://claude.ai/artifact/JsZEmg3dVkC9jQNwxRPFPv';
export const IN_CLAUDE = typeof window !== 'undefined' && !!window.claude?.use;

// OpenCV.js para el recorte automático (13 MB; se carga solo al agregar con fotos).
// En el servidor se sirve desde el mismo dominio (vite copia el archivo a dist/vendor/);
// en la vista previa de Claude, desde jsDelivr. VITE_OPENCV_URL lo reemplaza.
export const OPENCV_VERSION = '5.0.0-release.1';
export const OPENCV_CDN = `https://cdn.jsdelivr.net/npm/@techstark/opencv-js@${OPENCV_VERSION}/dist/opencv.js`;
export const OPENCV_URLS = [
  import.meta.env.VITE_OPENCV_URL,
  import.meta.env.MODE === 'demo' ? null : `${import.meta.env.BASE_URL}vendor/opencv.js`,
  OPENCV_CDN,
].filter(Boolean);

// Tesseract (lectura local de portadas, sin internet): archivos servidos desde el mismo origen.
// Servidor: dist/vendor/tesseract/ · vista previa de Claude: tesseract/ junto a index.html.
export const TESS_BASE = import.meta.env.VITE_TESS_BASE
  || (import.meta.env.MODE === 'demo' ? './tesseract/' : `${import.meta.env.BASE_URL}vendor/tesseract/`);
export const TESS_LANG_AS_TEXT = import.meta.env.MODE === 'demo';
