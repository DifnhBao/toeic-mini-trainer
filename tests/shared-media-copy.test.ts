import assert from "node:assert/strict";
import { it } from "node:test";
import { withContributionMedia, type SourceMediaAsset } from "../app/lib/shared-media-copy";
import type { ExtractedData } from "../app/lib/question-import";

const audio = "00000000-0000-4000-8000-000000000001";
const image = "00000000-0000-4000-8000-000000000002";
const data: ExtractedData = { data: [0, 1].map(() => ({
  group: { groupType: "AUDIO", audioAssetId: audio, imageAssetId: image },
  questions: [{ part: 1, options: { A: "A", B: "B", C: "C", D: "D" }, correctAnswer: "C" }],
})) };
const sources: SourceMediaAsset[] = [
  { id: image, kind: "IMAGE", objectKey: "ready/image/private.png", etag: "image-etag", originalName: "photo.png", contentType: "image/png", sizeBytes: 20 },
  { id: audio, kind: "AUDIO", objectKey: "ready/audio/private.mp3", etag: "audio-etag", originalName: "audio.mp3", contentType: "audio/mpeg", sizeBytes: 40 },
];
function fakeStorage() {
  const copied: Array<{ source: string; target: string; etag: string }> = [];
  const deleted: string[] = [];
  return { copied, deleted, storage: {
    copy: async (source: string, target: string, etag: string) => { copied.push({ source, target, etag }); },
    verify: async () => ({ valid: true as const, sourceEtag: '"verified"', etag: "verified" }),
    delete: async (key: string) => { deleted.push(key); },
  } };
}

it("publishes both audio and images once per asset, replaces every reference and keeps private sources unchanged", async () => {
  const fake = fakeStorage();
  const result = await withContributionMedia("contribution", data, sources, async copied => copied, async () => true, fake.storage);
  assert.equal(fake.copied.length, 2); assert.equal(fake.deleted.length, 0);
  assert.deepEqual(fake.copied.map(copy => copy.etag), ['"image-etag"', '"audio-etag"']);
  assert.equal(result.sharedAssets.length, 2);
  for (const asset of result.sharedAssets) { assert.equal(asset.ownerId, null); assert.equal(asset.status, "READY"); assert.match(asset.objectKey, /^shared\/(image|audio)\/contribution\//); }
  const sharedImage = result.sharedAssets.find(asset => asset.kind === "IMAGE")!.id;
  const sharedAudio = result.sharedAssets.find(asset => asset.kind === "AUDIO")!.id;
  for (const item of result.approvedData.data) { assert.equal(item.group?.imageAssetId, sharedImage); assert.equal(item.group?.audioAssetId, sharedAudio); }
  assert.equal(data.data[0].group?.imageAssetId, image);
  assert.equal(data.data[0].group?.audioAssetId, audio);
});

it("cleans up every attempted destination when a copy response is uncertain, and never calls persistence", async () => {
  const fake = fakeStorage(); let persisted = false;
  const copy = fake.storage.copy;
  fake.storage.copy = async (...args) => { await copy(...args); if (fake.copied.length === 2) throw new Error("COPY_RESPONSE_LOST"); };
  await assert.rejects(withContributionMedia("contribution", data, sources, async () => { persisted = true; }, async () => true, fake.storage), /COPY_RESPONSE_LOST/);
  assert.equal(persisted, false);
  assert.deepEqual(fake.deleted, fake.copied.map(copy => copy.target));
  assert.ok(fake.deleted.every(key => key.startsWith("shared/")));
});

it("cleans up verified copies when the database transaction rejects duplicate publication", async () => {
  const fake = fakeStorage();
  await assert.rejects(withContributionMedia("contribution", data, sources, async () => { throw new Error("ALREADY_REVIEWED"); }, async () => true, fake.storage), /ALREADY_REVIEWED/);
  assert.deepEqual(fake.deleted, fake.copied.map(copy => copy.target));
});

it("preserves media after an ambiguous database commit when destinations are referenced or state cannot be read", async () => {
  for (const canClean of [async () => false, async () => { throw new Error("DB_UNAVAILABLE"); }]) {
    const fake = fakeStorage();
    await assert.rejects(withContributionMedia("contribution", data, sources, async () => { throw new Error("COMMIT_RESPONSE_LOST"); }, canClean, fake.storage), /COMMIT_RESPONSE_LOST/);
    assert.equal(fake.copied.length, 2); assert.equal(fake.deleted.length, 0);
  }
});

it("never persists an unverifiable copied image", async () => {
  const fake = fakeStorage(); let persisted = false;
  const storage = { ...fake.storage, verify: async () => ({ valid: false as const, code: "SIGNATURE_MISMATCH" as const }) };
  await assert.rejects(withContributionMedia("contribution", data, sources, async () => { persisted = true; }, async () => true, storage), /SHARED_MEDIA_COPY_INVALID/);
  assert.equal(persisted, false); assert.equal(fake.deleted.length, 1);
});
