import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesFileSignature,
  sanitizeOriginalName,
  validateUploadDescriptor,
} from "../app/lib/upload-policy";
import {
  createReadyObjectKey,
  createSignedUploadUrl,
  createStagingObjectKey,
} from "../app/lib/object-storage";

describe("upload policy", () => {
  it("accepts a bounded PDF and rejects a disguised executable type", () => {
    assert.equal(validateUploadDescriptor({ kind: "DOCUMENT", contentType: "application/pdf", sizeBytes: 1024 }).valid, true);
    assert.deepEqual(
      validateUploadDescriptor({ kind: "DOCUMENT", contentType: "application/x-msdownload", sizeBytes: 1024 }),
      { valid: false, code: "UNSUPPORTED_FILE_TYPE" },
    );
  });

  it("enforces per-kind size limits", () => {
    assert.deepEqual(
      validateUploadDescriptor({ kind: "IMAGE", contentType: "image/png", sizeBytes: 10 * 1024 * 1024 + 1 }),
      { valid: false, code: "FILE_TOO_LARGE" },
    );
  });

  it("accepts a 19.1 MB listening PDF through the 50 MiB boundary and rejects larger documents", () => {
    for (const sizeBytes of [Math.ceil(19.1 * 1024 * 1024), 50 * 1024 * 1024]) {
      assert.equal(validateUploadDescriptor({ kind: "DOCUMENT", contentType: "application/pdf", sizeBytes }).valid, true);
    }
    assert.deepEqual(validateUploadDescriptor({ kind: "DOCUMENT", contentType: "application/pdf", sizeBytes: 50 * 1024 * 1024 + 1 }), { valid: false, code: "FILE_TOO_LARGE" });
    assert.equal(validateUploadDescriptor({ kind: "AUDIO", contentType: "audio/mpeg", sizeBytes: Math.ceil(42.2 * 1024 * 1024) }).valid, true);
    assert.deepEqual(validateUploadDescriptor({ kind: "AUDIO", contentType: "audio/mpeg", sizeBytes: 100 * 1024 * 1024 + 1 }), { valid: false, code: "FILE_TOO_LARGE" });
  });

  it("verifies magic bytes instead of trusting MIME alone", () => {
    assert.equal(matchesFileSignature("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), true);
    assert.equal(matchesFileSignature("application/pdf", new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])), false);
    assert.equal(matchesFileSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  });

  it("removes control characters from metadata filenames", () => {
    assert.equal(sanitizeOriginalName("  de-thi\u0000\r\n.pdf  "), "de-thi.pdf");
  });

  it("separates unverified and ready object namespaces", () => {
    const stagingKey = createStagingObjectKey("user-123", "AUDIO", ".mp3");
    assert.match(stagingKey, /^pending\/audio\/user-123\/\d{4}\/\d{2}\/[0-9a-f-]+\.mp3$/);
    assert.equal(createReadyObjectKey(stagingKey), stagingKey.replace(/^pending\//, "ready/"));
  });

  it("binds declared length and MIME to the presigned PUT request", async () => {
    const variableNames = [
      "OBJECT_STORAGE_ENDPOINT",
      "OBJECT_STORAGE_BUCKET",
      "OBJECT_STORAGE_ACCESS_KEY_ID",
      "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ] as const;
    const previous = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));

    try {
      process.env.OBJECT_STORAGE_ENDPOINT = "https://example.r2.cloudflarestorage.com";
      process.env.OBJECT_STORAGE_BUCKET = "private-test";
      process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test-access-key";
      process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";

      const signedUrl = new URL(
        await createSignedUploadUrl("pending/audio/user/file.mp3", "audio/mpeg", 1234),
      );
      assert.equal(
        signedUrl.searchParams.get("X-Amz-SignedHeaders"),
        "content-length;content-type;host",
      );
    } finally {
      for (const name of variableNames) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
    }
  });
});
