import { File, UploadType } from 'expo-file-system';

import type { AssetKind, UploadIntent } from '@/types/learning';

type AuthorizedFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

function inferredContentType(file: File, kind: AssetKind) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.extension.toLowerCase();
  if (kind === 'DOCUMENT' && extension === '.pdf') return 'application/pdf';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.m4a' || extension === '.mp4') return 'audio/mp4';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return '';
}

export async function uploadPrivateFile(
  file: File,
  kind: AssetKind,
  authorizedFetch: AuthorizedFetch,
  onProgress?: (ratio: number) => void,
) {
  const contentType = inferredContentType(file, kind);
  if (!contentType || !file.size) throw new Error('Không đọc được loại hoặc kích thước file.');

  const intent = await authorizedFetch<UploadIntent>('/api/v1/uploads', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  });

  const result = await file.upload(intent.upload.url, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: contentType,
    headers: intent.upload.headers,
    sessionType: 'foreground',
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(Math.min(1, bytesSent / totalBytes));
    },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload thất bại (${result.status}).`);
  }

  await authorizedFetch(`/api/v1/uploads/${intent.asset.id}/complete`, { method: 'POST' });
  onProgress?.(1);
  return intent.asset.id;
}
