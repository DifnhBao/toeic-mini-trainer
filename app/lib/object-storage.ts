import { createHash, randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  matchesFileSignature,
  normalizeContentType,
  type UploadKind,
} from "@/app/lib/upload-policy";

export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
export const READ_URL_TTL_SECONDS = 60 * 60;

export class ObjectStorageConfigurationError extends Error {
  constructor() {
    super("Object storage is not configured");
    this.name = "ObjectStorageConfigurationError";
  }
}

export class ObjectNotReadyError extends Error {
  constructor() {
    super("Object is not available yet");
    this.name = "ObjectNotReadyError";
  }
}

type StorageConfiguration = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

let storageClient: S3Client | undefined;
let storageClientIdentity: string | undefined;

function storageConfiguration(): StorageConfiguration {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim();
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new ObjectStorageConfigurationError();
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new ObjectStorageConfigurationError();
  }
  if (
    !["http:", "https:"].includes(parsedEndpoint.protocol) ||
    (process.env.NODE_ENV === "production" && parsedEndpoint.protocol !== "https:")
  ) {
    throw new ObjectStorageConfigurationError();
  }

  return {
    endpoint: parsedEndpoint.toString().replace(/\/$/, ""),
    region: process.env.OBJECT_STORAGE_REGION?.trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
  };
}

function clientAndBucket() {
  const config = storageConfiguration();
  const identity = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  if (!storageClient || storageClientIdentity !== identity) {
    storageClient = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    storageClientIdentity = identity;
  }
  return { client: storageClient, bucket: config.bucket };
}

export async function checkObjectStorageReady() {
  const { client, bucket } = clientAndBucket();
  await client.send(new HeadBucketCommand({ Bucket: bucket }), {
    abortSignal: AbortSignal.timeout(5_000),
  });
}

export function createStagingObjectKey(ownerId: string, kind: UploadKind, extension: string) {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `pending/${kind.toLowerCase()}/${ownerId}/${now.getUTCFullYear()}/${month}/${randomUUID()}${extension}`;
}

export function createReadyObjectKey(stagingObjectKey: string) {
  if (!stagingObjectKey.startsWith("pending/")) {
    throw new Error("Cannot promote a non-staging object key");
  }
  return `ready/${stagingObjectKey.slice("pending/".length)}`;
}

export async function createSignedUploadUrl(
  objectKey: string,
  contentType: string,
  sizeBytes: number,
) {
  const { client, bucket } = clientAndBucket();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: sizeBytes,
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type"]),
    },
  );
}

export async function createSignedReadUrl(
  objectKey: string,
  kind: UploadKind,
  expiresIn = READ_URL_TTL_SECONDS,
) {
  const { client, bucket } = clientAndBucket();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ResponseContentDisposition: kind === "DOCUMENT" ? "attachment" : "inline",
    }),
    { expiresIn },
  );
}

export async function readStoredObject(objectKey: string, maxBytes: number) {
  const { client, bucket } = clientAndBucket();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if ((object.ContentLength ?? maxBytes + 1) > maxBytes) {
    throw new Error("Stored object exceeds the allowed processing size");
  }
  if (!object.Body) throw new ObjectNotReadyError();
  const bytes = await object.Body.transformToByteArray();
  if (bytes.byteLength > maxBytes) {
    throw new Error("Stored object exceeds the allowed processing size");
  }
  return bytes;
}

export async function resolveMediaUrl(
  legacyUrl: string | null,
  asset: { objectKey: string; kind: UploadKind; status: string; ownerId: string | null } | null,
  expectedOwnerId: string,
  approvedSharedMedia = false,
) {
  if (asset) {
    if (canReadMediaAsset(asset, expectedOwnerId, approvedSharedMedia)) {
      return createSignedReadUrl(asset.objectKey, asset.kind);
    }
    return null;
  }
  return legacyUrl;
}

export function canReadMediaAsset(
  asset: { status: string; ownerId: string | null },
  expectedOwnerId: string,
  approvedSharedMedia: boolean,
) {
  return asset.status === "READY" && (asset.ownerId === null || asset.ownerId === expectedOwnerId || approvedSharedMedia);
}

type ResolvableQuestionGroup = {
  audioUrl: string | null;
  imageUrl: string | null;
  contribution?: { status: string } | null;
  audioAsset: { objectKey: string; kind: UploadKind; status: string; ownerId: string | null } | null;
  imageAsset: { objectKey: string; kind: UploadKind; status: string; ownerId: string | null } | null;
};

export async function resolveQuestionGroupMedia<T extends ResolvableQuestionGroup>(
  group: T | null,
  expectedOwnerId: string,
) {
  if (!group) return null;
  const { audioAsset, imageAsset, contribution, ...rest } = group;
  const approvedSharedMedia = contribution?.status === "APPROVED";
  const [audioUrl, imageUrl] = await Promise.all([
    resolveMediaUrl(group.audioUrl, audioAsset, expectedOwnerId, approvedSharedMedia),
    resolveMediaUrl(group.imageUrl, imageAsset, expectedOwnerId, approvedSharedMedia),
  ]);
  return { ...rest, audioUrl, imageUrl };
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "NotFound" || value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}

export async function verifyStoredObject(input: {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}) {
  const { client, bucket } = clientAndBucket();
  let head;
  try {
    head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.objectKey }));
  } catch (error) {
    if (isMissingObject(error)) throw new ObjectNotReadyError();
    throw error;
  }

  if (head.ContentLength !== input.sizeBytes) {
    return { valid: false as const, code: "SIZE_MISMATCH" };
  }
  if (normalizeContentType(head.ContentType || "") !== normalizeContentType(input.contentType)) {
    return { valid: false as const, code: "CONTENT_TYPE_MISMATCH" };
  }
  if (!head.ETag) {
    return { valid: false as const, code: "MISSING_ETAG" };
  }

  const object = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      Range: "bytes=0-15",
      IfMatch: head.ETag,
    }),
  );
  const signature = object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
  if (!matchesFileSignature(input.contentType, signature)) {
    return { valid: false as const, code: "SIGNATURE_MISMATCH" };
  }

  return {
    valid: true as const,
    sourceEtag: head.ETag,
    etag: head.ETag.replace(/^"|"$/g, ""),
  };
}

export async function promoteStoredObject(
  sourceObjectKey: string,
  destinationObjectKey: string,
  sourceEtag: string,
) {
  const { client, bucket } = clientAndBucket();
  const encodedSource = `${encodeURIComponent(bucket)}/${sourceObjectKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: destinationObjectKey,
      CopySource: encodedSource,
      CopySourceIfMatch: sourceEtag,
      MetadataDirective: "COPY",
    }),
  );
}

export async function deleteStoredObject(objectKey: string) {
  const { client, bucket } = clientAndBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}
