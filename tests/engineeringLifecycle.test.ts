import assert from "node:assert/strict";
import test from "node:test";
import { appendRfiResponse, createDraftRfi } from "../src/lib/engineeringCoordination.ts";
import { buildLocalEngineeringDocumentLifecyclePreview, buildLocalRfiLifecyclePreview, buildLocalSiteLogLifecyclePreview, buildLocalSubmittalLifecyclePreview } from "../src/lib/engineeringLifecycle.ts";

test("engineering document lifecycle deletes only an unused shell and preserves referenced history", () => {
  const safe = buildLocalEngineeringDocumentLifecyclePreview({ documentId: "doc-draft", status: "DRAFT" });
  assert.equal(safe.canDelete, true);
  assert.equal(safe.canArchive, true);
  assert.equal(safe.canSupersede, true);

  const linked = buildLocalEngineeringDocumentLifecyclePreview({ documentId: "doc-linked", status: "DRAFT", revisions: 1, annotations: 2, rfiLinks: 1, submittalLinks: 1 });
  assert.equal(linked.canDelete, false);
  assert.match(linked.blockedReason || "", /dependencies|source history/i);
  const approved = buildLocalEngineeringDocumentLifecyclePreview({ documentId: "doc-approved", status: "APPROVED", revisions: 1 });
  assert.equal(approved.canDelete, false);
  assert.equal(approved.canArchive, true);
  assert.equal(approved.canSupersede, true);
});

test("RFI lifecycle separates disposable drafts, void history, and append-only corrections", () => {
  const draft = buildLocalRfiLifecyclePreview({ rfiId: "rfi-draft", status: "DRAFT" });
  assert.equal(draft.canDelete, true);
  const open = buildLocalRfiLifecyclePreview({ rfiId: "rfi-open", status: "OPEN", documentLinks: 1 });
  assert.equal(open.canDelete, false);
  assert.equal(open.canVoid, true);
  assert.equal(open.canCorrect, true);
  const answered = createDraftRfi({ id: "rfi-1", projectId: "project-1", rfiNumber: "RFI-1", subject: "Clarify", question: "What changed?", discipline: "CIVIL" });
  const opened = { ...answered, status: "ANSWERED" as const };
  const correction = appendRfiResponse(opened, { responseText: "Correction retained as a new response.", responseType: "CORRECTION" });
  assert.equal(correction.response.responseType, "CORRECTION");
  assert.equal(correction.rfi.status, "ANSWERED");
});

test("technical submittal lifecycle protects submitted rounds and review history", () => {
  const draft = buildLocalSubmittalLifecyclePreview({ submittalId: "sub-draft", status: "DRAFT", rounds: 1, currentRoundStatus: "DRAFT" });
  assert.equal(draft.canDelete, true);
  const submitted = buildLocalSubmittalLifecyclePreview({ submittalId: "sub-submitted", status: "SUBMITTED", rounds: 1, currentRoundStatus: "SUBMITTED", documentLinks: 2 });
  assert.equal(submitted.canDelete, false);
  assert.equal(submitted.canVoid, true);
  const revised = buildLocalSubmittalLifecyclePreview({ submittalId: "sub-revised", status: "REVISE_AND_RESUBMIT", rounds: 2, additionalRounds: 1, reviews: 1 });
  assert.equal(revised.canDelete, false);
  assert.equal(revised.canVoid, true);
});

test("Daily Site Log lifecycle keeps finalized observations immutable and supports addenda", () => {
  const draft = buildLocalSiteLogLifecyclePreview({ siteLogId: "log-draft", status: "DRAFT" });
  assert.equal(draft.canDelete, true);
  const observedDraft = buildLocalSiteLogLifecyclePreview({ siteLogId: "log-observed-draft", status: "DRAFT", draftObservations: 1 });
  assert.equal(observedDraft.canDelete, false);
  const submitted = buildLocalSiteLogLifecyclePreview({ siteLogId: "log-submitted", status: "SUBMITTED", formalEvents: 1 });
  assert.equal(submitted.canDelete, false);
  assert.equal(submitted.canVoid, true);
  const finalized = buildLocalSiteLogLifecyclePreview({ siteLogId: "log-finalized", status: "FINALIZED", formalEvents: 2 });
  assert.equal(finalized.canDelete, false);
  assert.equal(finalized.canVoid, false);
  assert.equal(finalized.canAddendum, true);
  const withAddendum = buildLocalSiteLogLifecyclePreview({ siteLogId: "log-finalized", status: "FINALIZED", formalEvents: 2, addenda: 1 });
  assert.equal(withAddendum.canAddendum, true);
});
