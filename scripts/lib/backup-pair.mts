export type BackedAsset = {
  objectKey: string; sizeBytes: number; contentType: string; etag: string | null;
};
export type BackedObject = {
  key: string; size: number; contentType?: string; etag: string;
};

const mime = (value: string) => value.split(';')[0].trim().toLowerCase();
const version = (value: string) => value.replace(/^"|"$/g, '');

// Compare restored DB metadata with authenticated, decrypted R2 metadata.
// A matching filename/size alone cannot prove the same file version.
// Return counts only: object keys may contain private filenames or owner IDs.
export function compareBackupPair(assets: readonly BackedAsset[], objects: readonly BackedObject[], legacyLinks: number) {
  if (!Number.isSafeInteger(legacyLinks) || legacyLinks < 0 || assets.length > 1000 || objects.length > 1000) throw new Error('InvalidBackupPair');
  const byKey = new Map<string, BackedObject>();
  for (const object of objects) {
    if (!object.key || byKey.has(object.key) || !Number.isSafeInteger(object.size) || object.size < 0 ||
      typeof object.etag !== 'string' || !object.etag) throw new Error('InvalidBackupPair');
    byKey.set(object.key, object);
  }
  let matchedAssets = 0, missingObjects = 0, sizeMismatches = 0, typeMismatches = 0, versionMismatches = 0, unversionedAssets = 0;
  const usedKeys = new Set<string>();
  for (const asset of assets) {
    if (!asset.objectKey || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 0 || !asset.contentType ||
      (asset.etag !== null && typeof asset.etag !== 'string')) throw new Error('InvalidBackupPair');
    const object = byKey.get(asset.objectKey);
    if (!object) { missingObjects++; continue; }
    usedKeys.add(asset.objectKey);
    const sizeMatches = asset.sizeBytes === object.size;
    const typeMatches = !!object.contentType && mime(asset.contentType) === mime(object.contentType);
    const knownVersion = !!asset.etag?.trim();
    const versionMatches = knownVersion && version(asset.etag!) === version(object.etag);
    if (!sizeMatches) sizeMismatches++;
    if (!typeMatches) typeMismatches++;
    if (!knownVersion) unversionedAssets++;
    else if (!versionMatches) versionMismatches++;
    if (sizeMatches && typeMatches && versionMatches) matchedAssets++;
  }
  return {
    verified: missingObjects + sizeMismatches + typeMismatches + versionMismatches + unversionedAssets + legacyLinks === 0,
    readyAssets: assets.length, backedObjects: objects.length, matchedAssets,
    extraObjects: objects.length - usedKeys.size,
    missingObjects, sizeMismatches, typeMismatches, versionMismatches, unversionedAssets, legacyLinks,
    atomicSnapshot: false as const,
  };
}
