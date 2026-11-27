// Recorte automático del libro en una foto con OpenCV.js.
//
// 1. Candidatos: líneas rectas (Canny en Lab + Hough) agrupadas por posición y
//    puntuadas por qué tan «de borde» son, más líneas ajustadas con RANSAC a los
//    lados de regiones de color uniforme (flood fill desde el centro).
// 2. Cada par de líneas verticales × par de horizontales forma un cuadrilátero.
// 3. Se elige el que separa mejor «libro» de «fondo»: color justo adentro frente
//    a justo afuera en los 4 lados, área grande, ángulos rectos y forma vertical.
// 4. Corrección de perspectiva (warpPerspective) a un rectángulo.
//
// Funciona en el navegador y en Node (pruebas). Todas las Mat se liberan.

const WORK = 480;            // lado mayor de la imagen de trabajo
const MIN_SCORE = 1.4;       // confianza mínima para aplicar el recorte solo
const MIN_SIDE_CONTRAST = 18;

// ---------- carga perezosa de OpenCV.js (solo navegador) ----------
let loading = null;
/** Prueba cada URL en orden hasta que una cargue. */
export async function loadOpenCVFrom(urls, timeoutMs = 45000) {
  let last;
  for (const u of urls) {
    try { return await loadOpenCV(u, timeoutMs); } catch (e) { last = e; }
  }
  throw last || new Error('Sin OpenCV');
}
export function loadOpenCV(url, timeoutMs = 45000) {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin navegador'));
  if (window.cv?.Mat) return Promise.resolve(window.cv);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { loading = null; reject(new Error('OpenCV tardó demasiado')); }, timeoutMs);
    const done = async () => {
      try {
        let cv = window.cv;
        if (cv instanceof Promise) cv = await cv;
        else if (!cv?.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
        window.cv = cv;
        clearTimeout(timer); resolve(cv);
      } catch (e) { clearTimeout(timer); loading = null; reject(e); }
    };
    const s = document.createElement('script');
    s.src = url; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = done;
    s.onerror = () => { clearTimeout(timer); loading = null; reject(new Error('No se pudo cargar OpenCV')); };
    document.head.appendChild(s);
  });
  return loading;
}

// ---------- geometría ----------
const hyp = (x, y) => Math.sqrt(x * x + y * y);
function inter(l1, l2) {
  const [x1, y1, x2, y2] = l1, [x3, y3, x4, y4] = l2;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-6) return null;
  const a = x1 * y2 - y1 * x2, b = x3 * y4 - y3 * x4;
  return [(a * (x3 - x4) - (x1 - x2) * b) / d, (a * (y3 - y4) - (y1 - y2) * b) / d];
}
/** Ordena 4 puntos: arriba-izq, arriba-der, abajo-der, abajo-izq (sentido horario en pantalla). */
export function orderQuad(pts) {
  const s = pts.map((p) => p[0] + p[1]), d = pts.map((p) => p[1] - p[0]);
  const at = (arr, f) => pts[arr.indexOf(f(...arr))];
  return [at(s, Math.min), at(d, Math.min), at(s, Math.max), at(d, Math.max)];
}
function polyArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
function maxCornerError(q) {
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i], a = q[(i + 3) % 4], b = q[(i + 1) % 4];
    const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
    const c = (v1[0] * v2[0] + v1[1] * v2[1]) / (hyp(...v1) * hyp(...v2) + 1e-6);
    worst = Math.max(worst, Math.abs((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI - 90));
  }
  return worst;
}
const angleOf = (l) => ((Math.atan2(l[3] - l[1], l[2] - l[0]) * 180) / Math.PI + 180) % 180;
const angDiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
/** Diferencia de ángulo entre lados opuestos (0 = paralelos). */
function parallelError(q) {
  const side = (i) => angleOf([...q[i], ...q[(i + 1) % 4]]);
  return Math.max(angDiff(side(0), side(2)), angDiff(side(1), side(3)));
}

// ---------- muestreo en Lab (Uint8, 3 canales) ----------
function labAt(lab, W, x, y) { const i = (Math.floor(y) * W + Math.floor(x)) * 3; return [lab[i], lab[i + 1], lab[i + 2]]; }
function sideContrast(lab, W, H, a, b, n = 40, off = 5) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = hyp(dx, dy) + 1e-6, nx = dy / L, ny = -dx / L; // normal hacia afuera
  const vals = [];
  for (let k = 0; k < n; k++) {
    const t = 0.08 + (0.84 * k) / (n - 1);
    const px = a[0] + dx * t, py = a[1] + dy * t;
    const ix = px - nx * off, iy = py - ny * off, ox = px + nx * off, oy = py + ny * off;
    if (!(ox >= 0 && ox < W && oy >= 0 && oy < H && ix >= 0 && ix < W && iy >= 0 && iy < H)) { vals.push(0); continue; }
    const ci = labAt(lab, W, ix, iy), co = labAt(lab, W, ox, oy);
    vals.push(hyp(hyp(ci[0] - co[0], ci[1] - co[1]), ci[2] - co[2]));
  }
  vals.sort((p, q) => p - q);
  return { med: vals[Math.floor(n / 2)], cov: vals.filter((v) => v > 8).length / n };
}
function lineScore(lab, W, H, l, n = 24, off = 4) {
  const [x1, y1, x2, y2] = l, dx = x2 - x1, dy = y2 - y1, L = hyp(dx, dy) + 1e-6, nx = dy / L, ny = -dx / L;
  const dist = [], sgn = [];
  for (let k = 0; k < n; k++) {
    const t = 0.05 + (0.9 * k) / (n - 1);
    const px = x1 + dx * t, py = y1 + dy * t, ix = px - nx * off, iy = py - ny * off, ox = px + nx * off, oy = py + ny * off;
    if (!(ix >= 0 && ix < W && iy >= 0 && iy < H && ox >= 0 && ox < W && oy >= 0 && oy < H)) continue;
    const ci = labAt(lab, W, ix, iy), co = labAt(lab, W, ox, oy);
    dist.push(hyp(hyp(ci[0] - co[0], ci[1] - co[1]), ci[2] - co[2])); sgn.push(ci[0] - co[0]);
  }
  if (dist.length < n / 2) return 0;
  dist.sort((p, q) => p - q);
  const mean = sgn.reduce((s, v) => s + v, 0) / sgn.length, absMean = sgn.reduce((s, v) => s + Math.abs(v), 0) / sgn.length;
  return dist[Math.floor(dist.length / 2)] * (0.4 + 0.6 * (Math.abs(mean) / (absMean + 1e-6))) * Math.sqrt(L);
}
/** Agrupa líneas casi iguales (misma posición) y deja las mejores. */
function mergeLines(lines, vertical, W, H, lab, cap = 18) {
  const scored = lines.map((l) => ({ l, s: lineScore(lab, W, H, l) })).sort((a, b) => b.s - a.s);
  const out = [];
  for (const { l } of scored) {
    const [x1, y1, x2, y2] = l;
    const pos = vertical ? x1 + (x2 - x1) * ((H / 2 - y1) / ((y2 - y1) || 1e-6)) : y1 + (y2 - y1) * ((W / 2 - x1) / ((x2 - x1) || 1e-6));
    if (out.every((o) => Math.abs(o.pos - pos) > 6)) out.push({ l, pos });
    if (out.length >= cap) break;
  }
  return out;
}

// ---------- RANSAC para los lados de una máscara ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function ransacLine(P, vertical, iters = 150, tol = 3) {
  const n = P.length; if (n < 10) return null;
  const rand = rng(7); let best = null, bestN = 0;
  for (let it = 0; it < iters; it++) {
    const a = P[Math.floor(rand() * n)], b = P[Math.floor(rand() * n)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = hyp(dx, dy); if (L < 10) continue;
    const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180;
    if (vertical ? !(ang > 65 && ang < 115) : !(ang < 25 || ang > 155)) continue;
    const nx = -dy / L, ny = dx / L; const inl = [];
    for (const p of P) if (Math.abs((p[0] - a[0]) * nx + (p[1] - a[1]) * ny) < tol) inl.push(p);
    if (inl.length > bestN) { bestN = inl.length; best = inl; }
  }
  if (!best || bestN < Math.max(10, 0.3 * n)) return null;
  // mínimos cuadrados sobre los inliers (x = f(y) si es vertical; y = f(x) si es horizontal)
  const u = best.map((p) => (vertical ? p[1] : p[0])), v = best.map((p) => (vertical ? p[0] : p[1]));
  const mu = u.reduce((s, x) => s + x, 0) / u.length, mv = v.reduce((s, x) => s + x, 0) / v.length;
  let num = 0, den = 0; for (let i = 0; i < u.length; i++) { num += (u[i] - mu) * (v[i] - mv); den += (u[i] - mu) ** 2; }
  const m = den ? num / den : 0, f = (t) => mv + m * (t - mu);
  return vertical ? [f(-400), -400, f(1000), 1000] : [-400, f(-400), 1000, f(1000)];
}
function maskLines(m, W, H) {
  const xs = [], ys = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (m[y * W + x]) { xs.push(x); ys.push(y); }
  if (xs.length < 100) return { V: [], H: [] };
  const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };
  const x0 = pct(xs, 0.05), x1 = pct(xs, 0.95), y0 = pct(ys, 0.05), y1 = pct(ys, 0.95);
  const L = [], R = [], T = [], B = [];
  for (let y = Math.floor(y0 + (y1 - y0) * 0.2); y < y1 - (y1 - y0) * 0.2; y++) {
    let a = -1, b = -1; for (let x = 0; x < W; x++) if (m[y * W + x]) { if (a < 0) a = x; b = x; }
    if (a >= 0) { L.push([a, y]); R.push([b, y]); }
  }
  for (let x = Math.floor(x0 + (x1 - x0) * 0.2); x < x1 - (x1 - x0) * 0.2; x++) {
    let a = -1, b = -1; for (let y = 0; y < H; y++) if (m[y * W + x]) { if (a < 0) a = y; b = y; }
    if (a >= 0) { T.push([x, a]); B.push([x, b]); }
  }
  const V = [ransacLine(L, true), ransacLine(R, true)].filter(Boolean);
  const Hh = [ransacLine(T, false), ransacLine(B, false)].filter(Boolean);
  return { V, H: Hh };
}

/**
 * Ajuste fino: mueve cada lado (poco giro permitido) hacia el máximo contraste local.
 * Solo acepta el resultado si sigue siendo un rectángulo razonable y mejora el contraste.
 */
function refineQuad(q, lab, W, H, range = 12, step = 2, maxTwist = 6) {
  const sides = [];
  let gain = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], L = hyp(dx, dy) + 1e-6, nx = dy / L, ny = -dx / L;
    const base = sideContrast(lab, W, H, a, b, 30, 3).med;
    let best = { v: base, a, b };
    for (let da = -range; da <= range; da += step) for (let db = -range; db <= range; db += step) {
      if (Math.abs(da - db) > maxTwist) continue;
      const a2 = [a[0] + nx * da, a[1] + ny * da], b2 = [b[0] + nx * db, b[1] + ny * db];
      const v = sideContrast(lab, W, H, a2, b2, 30, 3).med;
      if (v > best.v * 1.08 + 1) best = { v, a: a2, b: b2 };
    }
    gain += best.v - base;
    sides.push([...best.a, ...best.b]);
  }
  const corners = [inter(sides[3], sides[0]), inter(sides[0], sides[1]), inter(sides[1], sides[2]), inter(sides[2], sides[3])];
  if (!corners.every(Boolean) || gain <= 0) return q;
  const r = orderQuad(corners);
  const inside = r.every(([x, y]) => x >= -0.01 * W && x <= 1.01 * W && y >= -0.01 * H && y <= 1.01 * H);
  return inside && maxCornerError(r) <= 12 && parallelError(r) <= 6 ? r : q;
}

/**
 * Busca el libro en la imagen.
 * @param cv OpenCV.js listo
 * @param imageData {data: Uint8ClampedArray RGBA, width, height}
 * @returns {quad: [[x,y]×4] en 0–1, score, minContrast, area, confident} | null
 */
export function detectBookQuad(cv, imageData, dbg = null, work = WORK) {
  const W0 = imageData.width, H0 = imageData.height;
  const k = Math.min(1, work / Math.max(W0, H0));
  const mats = [];
  const M = (m) => { mats.push(m); return m; };
  try {
    const src = M(cv.matFromImageData(imageData));
    const sm4 = M(new cv.Mat());
    cv.resize(src, sm4, new cv.Size(Math.round(W0 * k), Math.round(H0 * k)), 0, 0, cv.INTER_AREA);
    const W = sm4.cols, H = sm4.rows;
    const sm = M(new cv.Mat()); cv.cvtColor(sm4, sm, cv.COLOR_RGBA2RGB);
    const lab = M(new cv.Mat()); cv.cvtColor(sm, lab, cv.COLOR_RGB2Lab);
    cv.GaussianBlur(lab, lab, new cv.Size(7, 7), 0);
    const labData = lab.data;

    // bordes en los tres canales Lab
    const ch = M(new cv.MatVector()); cv.split(lab, ch);
    const edges = M(cv.Mat.zeros(H, W, cv.CV_8U)); const tmp = M(new cv.Mat());
    [[18, 50], [15, 45], [15, 45]].forEach(([lo, hi], i) => { const c = ch.get(i); cv.Canny(c, tmp, lo, hi); cv.bitwise_or(edges, tmp, edges); c.delete(); });
    const lines = M(new cv.Mat());
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 40, Math.min(W, H) * 0.2, 20);
    const Vr = [], Hr = [];
    const nLines = lines.data32S.length / 4; // OpenCV.js puede devolver 1×N o N×1
    for (let i = 0; i < nLines; i++) {
      const l = Array.from(lines.data32S.subarray(i * 4, i * 4 + 4));
      const [x1, y1, x2, y2] = l;
      if (Math.max(x1, x2) < W * 0.015 || Math.min(x1, x2) > W * 0.985 || Math.max(y1, y2) < H * 0.015 || Math.min(y1, y2) > H * 0.985) continue;
      const ang = angleOf(l);
      if (ang > 65 && ang < 115) Vr.push(l); else if (ang < 25 || ang > 155) Hr.push(l);
    }
    const V = mergeLines(Vr, true, W, H, labData).map((o) => o.l);
    const Hh = mergeLines(Hr, false, W, H, labData).map((o) => o.l);

    // regiones de color uniforme (portadas lisas, contraportadas)
    const med = M(new cv.Mat()); cv.medianBlur(sm, med, 15); cv.cvtColor(med, med, cv.COLOR_RGB2Lab);
    const kernel = M(cv.Mat.ones(15, 15, cv.CV_8U));
    for (const [fx, fy] of [[0.5, 0.5], [0.35, 0.5], [0.65, 0.5], [0.5, 0.3], [0.5, 0.7]]) {
      const mask = cv.Mat.zeros(H + 2, W + 2, cv.CV_8U);
      const work = med.clone();
      try {
        cv.floodFill(work, mask, new cv.Point(Math.floor(W * fx), Math.floor(H * fy)), new cv.Scalar(0, 0, 0, 0), new cv.Rect(),
          new cv.Scalar(50, 9, 9, 0), new cv.Scalar(50, 9, 9, 0), 8 | cv.FLOODFILL_MASK_ONLY | cv.FLOODFILL_FIXED_RANGE | (255 << 8));
        const inner = mask.roi(new cv.Rect(1, 1, W, H)); const m = new cv.Mat();
        cv.morphologyEx(inner, m, cv.MORPH_CLOSE, kernel);
        const md = m.data; let cnt = 0; for (let i = 0; i < md.length; i++) if (md[i]) cnt++;
        const frac = cnt / (W * H);
        if (frac >= 0.15 && frac <= 0.92) { const ml = maskLines(md, W, H); V.push(...ml.V); Hh.push(...ml.H); if (dbg) (dbg.masks ||= []).push({ fx, fy, frac: +frac.toFixed(2), V: ml.V.map((l) => l.map(Math.round)), H: ml.H.map((l) => l.map(Math.round)) }); }
        inner.delete(); m.delete();
      } finally { mask.delete(); work.delete(); }
    }

    // combinar pares y puntuar
    const posV = V.map((l) => l[0] + (l[2] - l[0]) * ((H / 2 - l[1]) / ((l[3] - l[1]) || 1e-6)));
    const posH = Hh.map((l) => l[1] + (l[3] - l[1]) * ((W / 2 - l[0]) / ((l[2] - l[0]) || 1e-6)));
    let best = null;
    for (let a = 0; a < V.length; a++) for (let b = a + 1; b < V.length; b++) {
      if (Math.abs(posV[a] - posV[b]) < W * 0.25) continue;
      for (let c = 0; c < Hh.length; c++) for (let d = c + 1; d < Hh.length; d++) {
        if (Math.abs(posH[c] - posH[d]) < H * 0.25) continue;
        const pts = [inter(V[a], Hh[c]), inter(V[a], Hh[d]), inter(V[b], Hh[c]), inter(V[b], Hh[d])];
        if (pts.some((p) => !p)) continue;
        const q = orderQuad(pts);
        const w = (hyp(q[1][0] - q[0][0], q[1][1] - q[0][1]) + hyp(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
        const h = (hyp(q[3][0] - q[0][0], q[3][1] - q[0][1]) + hyp(q[2][0] - q[1][0], q[2][1] - q[1][1])) / 2;
        if (Math.min(w, h) < 30) continue;
        const ar = Math.min(w, h) / Math.max(w, h), area = polyArea(q) / (W * H);
        if (area < 0.15 || area > 0.97 || ar < 0.45) continue;
        if (q.some(([x, y]) => x < -0.01 * W || x > 1.01 * W || y < -0.01 * H || y > 1.01 * H)) continue;
        const ang = maxCornerError(q); if (ang > 15 || parallelError(q) > 6) continue;
        const cs = [0, 1, 2, 3].map((i) => sideContrast(labData, W, H, q[i], q[(i + 1) % 4]));
        if (Math.min(...cs.map((c) => c.cov)) < 0.5) continue;
        const meds = cs.map((c) => c.med), mean = meds.reduce((s, v) => s + v, 0) / 4, minMed = Math.min(...meds);
        const score = area * 0.9 + Math.min(1, mean / 35) * 0.6 + Math.min(1, minMed / 20) * 0.4 - ang / 100 - (w > h * 1.05 ? 0.15 : 0);
        if (!best || score > best.score) best = { score, q, minMed, area };
      }
    }
    if (dbg) Object.assign(dbg, { nV: V.length, nH: Hh.length, W, H });
    if (!best) return null;
    best.q = refineQuad(best.q, labData, W, H);
    return {
      quad: best.q.map(([x, y]) => [x / W, y / H]),
      score: +best.score.toFixed(3),
      minContrast: Math.round(best.minMed),
      area: +best.area.toFixed(3),
      confident: best.score >= MIN_SCORE && best.minMed >= MIN_SIDE_CONTRAST && best.area >= 0.25,
    };
  } finally {
    mats.forEach((m) => { try { m.delete(); } catch { /* ya liberada */ } });
  }
}

/** Endereza la zona del cuadrilátero (0–1) a un rectángulo. Devuelve una Mat RGBA (liberar con .delete()). */
export function warpQuad(cv, imageData, quad, maxSide = 1400) {
  const W = imageData.width, H = imageData.height;
  const q = quad.map(([x, y]) => [x * W, y * H]);
  const w = Math.max(hyp(q[1][0] - q[0][0], q[1][1] - q[0][1]), hyp(q[2][0] - q[3][0], q[2][1] - q[3][1]));
  const h = Math.max(hyp(q[3][0] - q[0][0], q[3][1] - q[0][1]), hyp(q[2][0] - q[1][0], q[2][1] - q[1][1]));
  const s = Math.min(1, maxSide / Math.max(w, h)), ow = Math.max(1, Math.round(w * s)), oh = Math.max(1, Math.round(h * s));
  const src = cv.matFromImageData(imageData), dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, q.flat());
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, ow - 1, 0, ow - 1, oh - 1, 0, oh - 1]);
  const T = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, T, new cv.Size(ow, oh), cv.INTER_AREA, cv.BORDER_REPLICATE);
    return dst;
  } finally { src.delete(); from.delete(); to.delete(); T.delete(); }
}

/**
 * Consenso a varias escalas: corre la detección en 3 tamaños de trabajo y toma la
 * mediana de cada esquina de los resultados confiables que coinciden entre sí.
 * Cede el hilo entre escalas para que la interfaz siga respondiendo.
 */
export async function detectBook(cv, imageData, sizes = [420, 480, 560]) {
  const runs = [];
  for (const size of sizes) {
    await new Promise((r) => setTimeout(r, 0));
    try { const r = detectBookQuad(cv, imageData, null, size); if (r) runs.push(r); } catch { /* escala fallida */ }
  }
  const ok = runs.filter((r) => r.confident);
  if (!ok.length) return { quad: null, confident: false, runs: runs.length };
  const med = (vals) => { const v = [...vals].sort((a, b) => a - b); return v[Math.floor((v.length - 1) / 2)]; };
  const quad = [0, 1, 2, 3].map((i) => [med(ok.map((r) => r.quad[i][0])), med(ok.map((r) => r.quad[i][1]))]);
  // los que se alejan más de 4 % del consenso no cuentan
  const agree = ok.filter((r) => r.quad.every((p, i) => Math.abs(p[0] - quad[i][0]) < 0.04 && Math.abs(p[1] - quad[i][1]) < 0.04));
  const confident = agree.length >= 2 || (ok.length === 1 && sizes.length === 1);
  const final = agree.length >= 2
    ? [0, 1, 2, 3].map((i) => [med(agree.map((r) => r.quad[i][0])), med(agree.map((r) => r.quad[i][1]))])
    : quad;
  return { quad: confident ? final : null, confident, runs: runs.length, agree: agree.length };
}
