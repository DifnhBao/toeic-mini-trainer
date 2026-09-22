export const uploadKinds = ["DOCUMENT", "AUDIO", "IMAGE"] as const;

export type UploadKind = (typeof uploadKinds)[number];

type UploadRule = {
  maxBytes: number;
  contentTypes: Readonly<Record<string, string>>;
};

export const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
  DOCUMENT: {
    maxBytes: 15 * 1024 * 1024,
    contentTypes: { "application/pdf": ".pdf" },
  },
  AUDIO: {
    maxBytes: 100 * 1024 * 1024,
    contentTypes: {
      "audio/mpeg": ".mp3",
      "audio/mp4": ".m4a",
      "audio/x-m4a": ".m4a",
      "audio/wav": ".wav",
      "audio/x-wav": ".wav",
    },
  },
  IMAGE: {
    maxBytes: 10 * 1024 * 1024,
    contentTypes: {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    },
  },
};

export function normalizeContentType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

export function sanitizeOriginalName(value: string) {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "upload").slice(0, 240);
}

export function validateUploadDescriptor(input: {
  kind: UploadKind;
  contentType: string;
  sizeBytes: number;
}) {
  const rule = UPLOAD_RULES[input.kind];
  const contentType = normalizeContentType(input.contentType);
  const extension = rule.contentTypes[contentType];

  if (!extension) {
    return { valid: false as const, code: "UNSUPPORTED_FILE_TYPE" };
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    return { valid: false as const, code: "INVALID_FILE_SIZE" };
  }
  if (input.sizeBytes > rule.maxBytes) {
    return { valid: false as const, code: "FILE_TOO_LARGE" };
  }

  return { valid: true as const, contentType, extension, maxBytes: rule.maxBytes };
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function matchesFileSignature(contentTypeValue: string, bytes: Uint8Array) {
  const contentType = normalizeContentType(contentTypeValue);

  switch (contentType) {
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case "audio/mpeg":
      return startsWith(bytes, [0x49, 0x44, 0x33]) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case "audio/mp4":
    case "audio/x-m4a":
      return startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4);
    case "audio/wav":
    case "audio/x-wav":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8);
    default:
      return false;
  }
}
