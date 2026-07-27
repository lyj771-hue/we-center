import { supabase } from './supabaseClient';

const MAX_WIDTH = 1200;
const QUALITY = 0.8;

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
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('이미지 압축에 실패했습니다'))),
      'image/webp',
      quality
    );
  });
}

export async function uploadImage(file: File, folder: string): Promise<string> {
  const blob = await compressImage(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  const { error } = await supabase.storage.from('images').upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
  });
  if (error) throw error;

  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}
