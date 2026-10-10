import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ExtractedData } from "@/app/lib/question-import";
import { deleteStoredObject, promoteStoredObject, verifyStoredObject } from "@/app/lib/object-storage";

export type SharedMediaAsset = Prisma.UploadedAssetUncheckedCreateInput & { id: string };
export type SourceMediaAsset = {
  id: string; kind: "AUDIO" | "IMAGE"; objectKey: string; etag: string;
  originalName: string; contentType: string; sizeBytes: number;
};

// Track destination keys BEFORE copying: an uncertain response may still have
// created the object, and the caller must clean up every uncommitted copy.
export async function copyContributionMedia(
  contributionId: string,
  data: ExtractedData,
  sources: SourceMediaAsset[],
  destinationKeys: string[],
  storage = { copy: promoteStoredObject, verify: verifyStoredObject },
) {
  const sharedAssets: SharedMediaAsset[] = [];
  const replacements = new Map<string, string>();
  for (const source of sources) {
    if (replacements.has(source.id)) throw new Error("DUPLICATE_SOURCE_MEDIA");
    const id = randomUUID();
    const extension = source.objectKey.match(/\.[a-z0-9]{1,8}$/i)?.[0] || "";
    const objectKey = `shared/${source.kind.toLowerCase()}/${contributionId}/${id}${extension}`;
    destinationKeys.push(objectKey);
    await storage.copy(source.objectKey, objectKey, `"${source.etag}"`);
    const verified = await storage.verify({ objectKey, contentType: source.contentType, sizeBytes: source.sizeBytes });
    if (!verified.valid) throw new Error("SHARED_MEDIA_COPY_INVALID");
    sharedAssets.push({
      id, ownerId: null, kind: source.kind, status: "READY", objectKey,
      originalName: source.originalName, contentType: source.contentType,
      sizeBytes: source.sizeBytes, etag: verified.etag, verifiedAt: new Date(),
    });
    replacements.set(source.id, id);
  }
  return {
    sharedAssets,
    approvedData: { data: data.data.map(item => ({
      ...item,
      group: item.group ? {
        ...item.group,
        audioAssetId: item.group.audioAssetId ? replacements.get(item.group.audioAssetId) ?? item.group.audioAssetId : item.group.audioAssetId,
        imageAssetId: item.group.imageAssetId ? replacements.get(item.group.imageAssetId) ?? item.group.imageAssetId : item.group.imageAssetId,
      } : item.group,
    })) },
  };
}

export async function withContributionMedia<T>(
  contributionId: string,
  data: ExtractedData,
  sources: SourceMediaAsset[],
  persist: (copied: Awaited<ReturnType<typeof copyContributionMedia>>) => Promise<T>,
  canCleanUp: (keys: string[]) => Promise<boolean>,
  storage = { copy: promoteStoredObject, verify: verifyStoredObject, delete: deleteStoredObject },
) {
  const keys: string[] = [];
  try {
    const copied = await copyContributionMedia(contributionId, data, sources, keys, storage);
    return await persist(copied);
  } catch (error) {
    // A lost DB response can follow a successful commit. Never delete a
    // destination that is referenced, or when its commit state is unknown.
    try {
      if (keys.length && await canCleanUp(keys)) {
        for (const key of keys) {
          try { await storage.delete(key); } catch {
            console.error("shared media cleanup failed", { contributionId });
          }
        }
      }
    } catch {
      console.error("shared media cleanup state unknown", { contributionId });
    }
    throw error;
  }
}
