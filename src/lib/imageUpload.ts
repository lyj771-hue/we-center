import { supabase } from './supabaseClient';

const MAX_WIDTH = 1200;
const QUALITY = 0.8;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));

/** 가로 1200px 이하로 줄이고 WebP로. 사파리(맥·아이폰)는 WebP로 못 만들고 몰래 PNG(무손실 — 장당 3~4MB)를 주므로 그땐 JPEG로 */
async function compressImage(file: File, maxWidth = MAX_WIDTH, quality = QUALITY): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context를 생성할 수 없습니다');
  ctx.fillStyle = '#fff';   // 투명한 PNG를 JPEG로 바꿀 때 검게 되지 않게
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  if (jpeg) return jpeg;
  throw new Error('이미지 압축에 실패했습니다');
}

export async function uploadImage(file: File, folder: string): Promise<string> {
  const blob = await compressImage(file);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from('images').upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
  });
  if (error) throw error;

  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}
