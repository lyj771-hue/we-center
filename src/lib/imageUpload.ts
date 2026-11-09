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

/** 저장소(images)에 올린 사진 주소 → 저장소 안 경로 (다른 곳 주소면 null) */
const storagePath = (url: string) => {
  const m = url.match(/\/storage\/v1\/object\/public\/images\/([^?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

/** 게시글에서 빠진 사진 파일 지우기 — 다른 게시글이 아직 쓰는 사진은 남긴다. 실패해도 게시글 일은 그대로(조용히 넘어간다) */
export async function removeUnusedImages(urls: string[]): Promise<void> {
  const paths = [...new Set(urls.map(storagePath).filter((p): p is string => !!p))];
  if (!paths.length) return;
  try {
    const unused: string[] = [];
    for (const p of paths) {
      const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true }).or(`content.ilike.%${p}%,image_url.ilike.%${p}%`);
      if (!count) unused.push(p);
    }
    if (unused.length) await supabase.storage.from('images').remove(unused);
  } catch { /* 사진 정리는 실패해도 괜찮다 */ }
}
