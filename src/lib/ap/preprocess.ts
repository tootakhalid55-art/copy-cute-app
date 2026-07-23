// Client-side image preprocessing for OCR: grayscale, denoise, contrast boost,
// shadow removal (background subtraction), and auto-crop. Pure canvas, no deps.
// Runs before upload to lift extraction accuracy on phone photos.

export type PreprocessOptions = {
  maxSide?: number;      // longest edge in px (default 2000)
  contrast?: number;     // 0..2 (default 1.35)
  denoise?: boolean;     // 3x3 median (default true)
  removeShadow?: boolean;// background subtraction (default true)
  autoCrop?: boolean;    // trim uniform borders (default true)
  quality?: number;      // JPEG quality (default 0.9)
};

export async function preprocessImage(file: File, opts: PreprocessOptions = {}): Promise<File> {
  if (!file.type.startsWith("image/")) return file; // skip PDFs
  const {
    maxSide = 2000, contrast = 1.35, denoise = true,
    removeShadow = true, autoCrop = true, quality = 0.9,
  } = opts;

  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  let data = ctx.getImageData(0, 0, w, h);

  // Grayscale + contrast
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const c = clamp(((g / 255 - 0.5) * contrast + 0.5) * 255);
    px[i] = px[i + 1] = px[i + 2] = c;
  }

  if (removeShadow) data = subtractBackground(data, w, h);
  if (denoise)      data = median3(data, w, h);

  ctx.putImageData(data, 0, 0);

  // Auto-crop uniform borders
  let outCanvas: HTMLCanvasElement = canvas;
  if (autoCrop) outCanvas = cropBorders(canvas) || canvas;

  const blob: Blob = await new Promise((res) =>
    outCanvas.toBlob((b) => res(b!), "image/jpeg", quality),
  );
  return new File([blob], file.name.replace(/\.(png|webp|heic|heif|jpe?g)$/i, "") + ".jpg", {
    type: "image/jpeg", lastModified: Date.now(),
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}

function clamp(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// Cheap shadow removal: divide by a heavily blurred copy (approximate morphology).
function subtractBackground(img: ImageData, w: number, h: number): ImageData {
  const src = img.data;
  const blurred = boxBlur(src, w, h, 25);
  for (let i = 0; i < src.length; i += 4) {
    const v = src[i];
    const bg = blurred[i] || 1;
    const norm = clamp((v / bg) * 210); // 210 = target white
    src[i] = src[i + 1] = src[i + 2] = norm;
  }
  return img;
}

function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const tmp = new Uint8ClampedArray(src.length);
  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k += 4) {
        const xk = Math.max(0, Math.min(w - 1, x + k));
        s += src[(y * w + xk) * 4]; n++;
      }
      tmp[(y * w + x) * 4] = s / n;
    }
  }
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k += 4) {
        const yk = Math.max(0, Math.min(h - 1, y + k));
        s += tmp[(yk * w + x) * 4]; n++;
      }
      out[(y * w + x) * 4] = s / n;
    }
  }
  return out;
}

function median3(img: ImageData, w: number, h: number): ImageData {
  const src = img.data;
  const dst = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { dst[idx] = src[idx]; continue; }
      const vals: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          vals.push(src[((y + dy) * w + (x + dx)) * 4]);
      vals.sort((a, b) => a - b);
      dst[idx] = dst[idx + 1] = dst[idx + 2] = vals[4];
      dst[idx + 3] = 255;
    }
  }
  return new ImageData(dst, w, h);
}

function cropBorders(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  const isBg = (i: number) => d[i] > 235; // near-white
  let top = 0, bot = h - 1, left = 0, right = w - 1;
  outer: for (; top < h; top++) for (let x = 0; x < w; x++) if (!isBg((top * w + x) * 4)) break outer;
  outer: for (; bot > top; bot--) for (let x = 0; x < w; x++) if (!isBg((bot * w + x) * 4)) break outer;
  outer: for (; left < w; left++) for (let y = top; y <= bot; y++) if (!isBg((y * w + left) * 4)) break outer;
  outer: for (; right > left; right--) for (let y = top; y <= bot; y++) if (!isBg((y * w + right) * 4)) break outer;
  const pad = 10;
  top = Math.max(0, top - pad); left = Math.max(0, left - pad);
  bot = Math.min(h - 1, bot + pad); right = Math.min(w - 1, right + pad);
  const cw = right - left, ch = bot - top;
  if (cw < w * 0.5 || ch < h * 0.5) return null; // suspicious crop, skip
  const out = document.createElement("canvas");
  out.width = cw; out.height = ch;
  out.getContext("2d")!.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
  return out;
}
