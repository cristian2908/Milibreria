// Portadas abstractas originales generadas en canvas para la demo.
// (No reproducen las portadas reales; sirven para probar color de lomo y proporción.)

const STYLES = {
  circles(ctx, w, h, c) {
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.38, w * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(w * 0.38, h * 0.5, w * 0.2, 0, Math.PI * 2); ctx.fill();
  },
  grid(ctx, w, h, c) {
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
    const n = 6, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < Math.ceil((h * 0.62) / s); j++) {
      if ((i * 7 + j * 3) % 4 === 0) { ctx.fillStyle = c[(i + j) % 2 ? 1 : 2]; ctx.fillRect(i * s + 4, j * s + 4, s - 8, s - 8); }
    }
  },
  bands(ctx, w, h, c) {
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = c[1 + (i % 2)]; ctx.fillRect(0, h * (0.08 + i * 0.11), w * (0.35 + i * 0.13), h * 0.06); }
  },
  squares(ctx, w, h, c) {
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c[1]; ctx.fillRect(w * 0.12, h * 0.1, w * 0.76, w * 0.76);
    ctx.fillStyle = c[2]; ctx.fillRect(w * 0.27, h * 0.1 + w * 0.15, w * 0.46, w * 0.46);
    ctx.fillStyle = c[0]; ctx.fillRect(w * 0.39, h * 0.1 + w * 0.27, w * 0.22, w * 0.22);
  },
  leaf(ctx, w, h, c) {
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = c[1]; ctx.lineWidth = w * 0.012;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.62);
      const a = -Math.PI / 2 + (i - 7.5) * 0.16;
      ctx.quadraticCurveTo(w * 0.5 + Math.cos(a) * w * 0.25, h * 0.4, w * 0.5 + Math.cos(a) * w * 0.46, h * 0.62 + Math.sin(a) * h * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.62, w * 0.04, 0, Math.PI * 2); ctx.fill();
  },
  slash(ctx, w, h, c) {
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c[1]; ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.lineTo(w, h * 0.12); ctx.lineTo(w, h * 0.32); ctx.lineTo(0, h * 0.9); ctx.fill();
    ctx.fillStyle = c[2]; ctx.fillRect(w * 0.08, h * 0.08, w * 0.12, w * 0.12);
  },
};

export function makeCover({ title, author, aspect = 2 / 3, style = 'circles', colors, ink = '#fff' }) {
  const w = 600, h = Math.round(w / aspect);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  STYLES[style](ctx, w, h, colors);

  // grano sutil
  const g = ctx.getImageData(0, 0, w, h), d = g.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(g, 0, 0);

  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  const words = title.split(' ');
  const lines = [];
  let line = '';
  ctx.font = `600 ${Math.round(w * 0.085)}px Fraunces, Georgia, serif`;
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w * 0.8 && line) { lines.push(line); line = word; } else line = t;
  }
  lines.push(line);
  const lh = w * 0.094;
  let y = h - w * 0.16 - (lines.length - 1) * lh;
  for (const l of lines) { ctx.fillText(l, w * 0.09, y); y += lh; }
  ctx.font = `500 ${Math.round(w * 0.036)}px "IBM Plex Sans Condensed", Arial, sans-serif`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(author.toUpperCase(), w * 0.09, h - w * 0.075);
  return cv.toDataURL('image/jpeg', 0.86);
}
