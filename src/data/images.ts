// Redimensiona fotos no próprio aparelho (canvas) antes de salvar. Nada é enviado para a internet.
export interface ProcessedImage { type: string; data: ArrayBuffer; thumb: ArrayBuffer; width: number; height: number }

const MAX_SIDE = 1600;
const THUMB_SIDE = 360;

async function loadBitmap(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; close?: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { img: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch { /* cai para <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function render(src: CanvasImageSource, w: number, h: number, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem neste navegador.');
  ctx.drawImage(src, 0, 0, cw, ch);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve({ blob: b, w: cw, h: ch }) : reject(new Error('Falha ao comprimir a imagem.'))), 'image/jpeg', quality));
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Imagem grande demais (máx. 40 MB).');
  const { img, w, h, close } = await loadBitmap(file);
  try {
    const full = await render(img, w, h, MAX_SIDE, 0.85);
    const thumb = await render(img, w, h, THUMB_SIDE, 0.75);
    return { type: 'image/jpeg', data: await full.blob.arrayBuffer(), thumb: await thumb.blob.arrayBuffer(), width: full.w, height: full.h };
  } finally {
    close?.();
  }
}

/** Object URL de um ArrayBuffer (lembre de revogar). */
export function bufferUrl(buf: ArrayBuffer, type = 'image/jpeg'): string {
  return URL.createObjectURL(new Blob([buf], { type }));
}
