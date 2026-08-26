import test from "node:test";
import assert from "node:assert/strict";
import {
  annotationSaveResultStatus,
  createAnnotationSaveCoordinator,
  type AnnotationSaveToken,
} from "../src/lib/engineeringAnnotationSave.ts";

test("annotation save success is confirmed only for the current generation and request", () => {
  const current: AnnotationSaveToken = { generation: 3, requestId: 8 };
  assert.equal(annotationSaveResultStatus(current, current, true), "saved");
});

test("annotation save failure exposes error without changing local generation", () => {
  const current: AnnotationSaveToken = { generation: 3, requestId: 8 };
  assert.equal(annotationSaveResultStatus(current, current, false), "error");
  assert.equal(current.generation, 3);
});

test("a newer edit keeps local work unsaved when an older request resolves", () => {
  const current: AnnotationSaveToken = { generation: 4, requestId: 8 };
  const olderRequest: AnnotationSaveToken = { generation: 3, requestId: 8 };
  assert.equal(annotationSaveResultStatus(current, olderRequest, true), "unsaved");
});

test("a stale request cannot change the visible state after a newer save begins", () => {
  const current: AnnotationSaveToken = { generation: 4, requestId: 9 };
  const olderRequest: AnnotationSaveToken = { generation: 3, requestId: 8 };
  assert.equal(annotationSaveResultStatus(current, olderRequest, true), null);
  assert.equal(annotationSaveResultStatus(current, olderRequest, false), null);
});

test("save coordinator advances edit generations for retry and race protection", () => {
  const coordinator = createAnnotationSaveCoordinator();
  const first = coordinator.beginSave();
  assert.deepEqual(first, { generation: 0, requestId: 1 });
  coordinator.markDirty();
  const retry = coordinator.beginSave();
  assert.deepEqual(retry, { generation: 1, requestId: 2 });
  coordinator.invalidate();
  assert.deepEqual(coordinator.current(), { generation: 2, requestId: 3 });
});
