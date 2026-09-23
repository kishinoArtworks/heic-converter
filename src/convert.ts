// 画像の読み込みと書き出し（すべてブラウザ内で完結する）
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import UPNG from 'upng-js';

export type Format = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export const FORMATS: { value: Format; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
  { value: 'image/gif', label: 'GIF', ext: 'gif' },
];

// 色数の選択肢。0 はフルカラー（PNG-24）
export const PNG_COLORS: { value: number; label: string }[] = [
  { value: 0, label: 'フルカラー (PNG-24)' },
  { value: 256, label: '256色 (PNG-8)' },
  { value: 128, label: '128色' },
  { value: 64, label: '64色' },
  { value: 32, label: '32色' },
  { value: 16, label: '16色' },
];
export const GIF_COLORS: { value: number; label: string }[] = [256, 128, 64, 32, 16, 8].map(n => ({ value: n, label: `${n}色` }));

export interface ConvertOptions {
  format: Format;
  colors: number;  // PNG / GIF の色数。0 = フルカラー
  quality: number; // JPG / WebP の画質（10〜100）
}

// 読み込める形式（拡張子で判定）
export const INPUT_EXT = /\.(heic|heif|png|jpe?g|webp|gif|bmp|avif|pdf)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;
export const PDF_EXT = /\.pdf$/i;
export const ACCEPT = '.heic,.heif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.pdf,image/*,application/pdf';

// PDF を何倍の大きさで描くか。A4（595x842）が基準
export const PDF_SCALES: { value: number; label: string; note: string }[] = [
  { value: 2, label: '標準', note: 'A4で1190x1684px。スマホの画面ではこれで等倍に見える' },
  { value: 3, label: '高精細', note: 'A4で1785x2526px。拡大して読む・PCで見るとき' },
];

export const extOf = (format: Format) => FORMATS.find(f => f.value === format)!.ext;

interface Heic2AnyOptions {
  blob: Blob;
  toType: 'image/png' | 'image/jpeg';
  quality?: number;
}
type Heic2Any = (options: Heic2AnyOptions) => Promise<Blob | Blob[]>;
const heic2any = (): Heic2Any => (window as unknown as { heic2any: Heic2Any }).heic2any;

// iPhone の HEIC は色の決まりが Display P3。埋め込みの色情報（ICC）の名前で見分ける。
// 名前は UTF-16 で書かれている（Apple の書き方）ので、その並びを探す
const DISPLAY_P3 = new Uint8Array([...'Display P3'].flatMap(ch => [0, ch.charCodeAt(0)]));

async function isDisplayP3(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  outer: for (let i = 0; i <= head.length - DISPLAY_P3.length; i++) {
    for (let j = 0; j < DISPLAY_P3.length; j++) {
      if (head[i + j] !== DISPLAY_P3[j]) continue outer;
    }
    return true;
  }
  return false;
}

// heic2any は色の数値だけを取り出し、色の決まりを捨てる。
// P3 の数値をそのまま使うと鮮やかさが2割ほど落ちるので、P3 として読み直して一般的な色（sRGB）に直す
async function p3ToSrgb(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const { width, height } = bitmap;
  const src = new OffscreenCanvas(width, height);
  const srcCtx = src.getContext('2d')!;
  srcCtx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const values = srcCtx.getImageData(0, 0, width, height).data;
  const dst = new OffscreenCanvas(width, height);
  dst.getContext('2d', { colorSpace: 'srgb' })!
    .putImageData(new ImageData(values, width, height, { colorSpace: 'display-p3' }), 0, 0);
  return createImageBitmap(dst);
}

// 画像を ImageBitmap に読み込む。HEIC は heic2any でいったん PNG にしてから
async function decode(file: File): Promise<ImageBitmap> {
  let source: Blob = file;
  const heic = HEIC_EXT.test(file.name);
  if (heic) {
    const result = await heic2any()({ blob: file, toType: 'image/png' });
    source = Array.isArray(result) ? result[0] : result;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error('この画像を読み込めませんでした（壊れているか、未対応の形式です）');
  }
  return heic && await isDisplayP3(file) ? p3ToSrgb(bitmap) : bitmap;
}

function draw(bitmap: ImageBitmap, whiteBackground: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  if (whiteBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function pixels(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

// ブラウザ標準の Canvas で書き出す（JPG / WebP / PNG-24）
async function encodeWithCanvas(canvas: HTMLCanvasElement, format: Format, quality: number): Promise<Blob> {
  const q = format === 'image/png' ? undefined : Math.min(100, Math.max(10, quality)) / 100;
  const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, format, q));
  if (!out || out.type !== format) {
    throw new Error(`このブラウザは${extOf(format).toUpperCase()}の書き出しに対応していません`);
  }
  return out;
}

// PNG-8（減色）は UPNG.js で書き出す
function encodePng8(img: ImageData, colors: number): Blob {
  const rgba = new Uint8Array(img.data.length);
  rgba.set(img.data);
  const buf = UPNG.encode([rgba.buffer], img.width, img.height, colors);
  return new Blob([new Uint8Array(buf)], { type: 'image/png' });
}

// GIF（減色）は gifenc で書き出す。半透明は「透明か不透明か」に丸める
function encodeGif(img: ImageData, colors: number): Blob {
  const data = img.data;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) { hasAlpha = true; break; }
  }
  const format = hasAlpha ? 'rgba4444' : 'rgb565';
  // 透明ピクセル用に1色ぶん空けておく
  const palette = quantize(data, hasAlpha ? colors - 1 : colors, { format, oneBitAlpha: true });
  const index = applyPalette(data, palette, format);
  let transparentIndex = -1;
  if (hasAlpha) {
    transparentIndex = palette.length;
    palette.push([0, 0, 0, 0]);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] < 128) index[p] = transparentIndex;
    }
  }
  const gif = GIFEncoder();
  gif.writeFrame(index, img.width, img.height, {
    palette,
    transparent: hasAlpha,
    transparentIndex: hasAlpha ? transparentIndex : undefined,
  });
  gif.finish();
  const bytes = gif.bytes();
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

// 描き終わった canvas を指定の形式で書き出す
export async function convertCanvas(canvas: HTMLCanvasElement, { format, colors, quality }: ConvertOptions): Promise<Blob> {
  if (format === 'image/gif') return encodeGif(pixels(canvas), colors);
  if (format === 'image/png' && colors > 0) return encodePng8(pixels(canvas), colors);
  return encodeWithCanvas(canvas, format, quality);
}

export async function convertImage(file: File, options: ConvertOptions): Promise<Blob> {
  const bitmap = await decode(file);
  const canvas = draw(bitmap, options.format === 'image/jpeg'); // JPG は透明を持てないので白で埋める
  return convertCanvas(canvas, options);
}

/* ---------------- PDF ---------------- */

// pdf.js は 1MB 近くあるので、PDF を入れた人のときだけ読み込む
export interface PdfDoc {
  numPages: number;
  render: (pageNumber: number, scale: number) => Promise<HTMLCanvasElement>;
  close: () => void;
}

type PdfjsModule = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function pdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      mod.GlobalWorkerOptions.workerSrc = worker.default;
      return mod;
    })();
  }
  return pdfjsPromise;
}

export async function loadPdf(file: File): Promise<PdfDoc> {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === 'PasswordException') throw new Error('パスワードのかかったPDFは開けません', { cause: err });
    throw new Error('このPDFを読み込めませんでした（壊れているか、未対応の形式です）', { cause: err });
  }

  return {
    numPages: doc.numPages,
    close: () => { void task.destroy(); },
    render: async (pageNumber: number, scale: number) => {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      // 紙は白。透明のままだと JPG にしたとき黒くなる
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // intent:'print' にするのは印刷したいからではなく、画面向けの描画が
      // requestAnimationFrame で進む＝タブを裏に回すと止まってしまうため。
      // 紙に出したときの見た目で描かれるので、書類を画像にする用途にも合う。
      await page.render({ canvas, viewport, intent: 'print' }).promise;
      page.cleanup();
      return canvas;
    },
  };
}
