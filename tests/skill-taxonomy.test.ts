import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { equalTagIds, skillTagUpdateSchema, tagsForPart } from "../app/lib/skill-taxonomy";

test("skill editor rejects unknown, duplicate, excessive labels and undeclared fields", () => {
  const body = { keys: ["grammar-tense"], expectedTagIds: [], reason: "Checked source question" };
  assert.ok(skillTagUpdateSchema.safeParse(body).success);
  for (const patch of [{ keys: ["provider-guessed"] }, { keys: ["grammar-tense", "grammar-tense"] },
    { keys: ["grammar-tense", "grammar-word-form", "grammar-agreement", "grammar-connectors", "vocabulary-context", "read-main"] },
    { reason: " " }, { expectedTagIds: ["not-an-id"] }, { expectedTagIds: [randomUUID(), "not-an-id"] }, { publicationStatus: "PUBLISHED" }])
    assert.equal(skillTagUpdateSchema.safeParse({ ...body, ...patch }).success, false);
  const id=randomUUID(); assert.equal(skillTagUpdateSchema.safeParse({ ...body, expectedTagIds: [id,id] }).success,false);
  assert.ok(skillTagUpdateSchema.safeParse({ ...body, keys: [] }).success, "Clearing controlled labels is explicit and supported");
});

test("label scope distinguishes listening, grammar and cross-document reading", () => {
  assert.equal(tagsForPart(2).some(tag => tag.key === "grammar-tense"), false);
  assert.equal(tagsForPart(5).some(tag => tag.key === "read-cross-text"), false);
  assert.equal(tagsForPart(7).some(tag => tag.key === "read-cross-text"), true);
  for (let part=1;part<=7;part++) assert.ok(tagsForPart(part).length>0);
  assert.equal(tagsForPart(8).length,0);
});

test("stale-edit detection compares the whole set, including retained legacy labels", () => {
  assert.ok(equalTagIds(["a","b"],["b","a"]));
  assert.equal(equalTagIds(["a","legacy"],["a"]),false);
  assert.equal(equalTagIds(["a"],["b"]),false);
});
