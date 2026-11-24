// Enlace público de la estantería (para abrirla en el navegador si la app no permite fotos)
export const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || 'https://claude.ai/artifact/JsZEmg3dVkC9jQNwxRPFPv';
export const IN_CLAUDE = typeof window !== 'undefined' && !!window.claude?.use;
