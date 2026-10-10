import assert from "node:assert/strict";
import { test } from "node:test";
import { currentExplanationHidden } from "../app/lib/explanation-policy";

test("a current hidden explanation suppresses personal history copies", () => {
  assert.equal(currentExplanationHidden(1, [{ contentRevision: 1 }]), true);
  assert.equal(currentExplanationHidden(4, [{ contentRevision: 1 }, { contentRevision: 4 }]), true);
});
test("an older hidden revision does not hide unrelated current content", () => {
  assert.equal(currentExplanationHidden(2, [{ contentRevision: 1 }]), false);
  assert.equal(currentExplanationHidden(1, []), false);
});
