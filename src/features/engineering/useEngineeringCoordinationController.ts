import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../../types.ts";
import {
  appendRfiResponse,
  createDraftRfi,
  createDraftSubmittal,
  createResubmissionRound,
  reviewSubmittalRound,
  transitionRfi,
  transitionSubmittal,
  type EngineeringCoordinationWorkspaceData,
  type EngineeringRfi,
  type EngineeringSubmittal,
  type RevisionReference,
  type RfiPriority,
  type RfiResponseType,
  type SubmittalDecision,
} from "../../lib/engineeringCoordination.ts";
import { engineeringId, type DisciplineType } from "../../lib/engineeringDocuments.ts";
import {
  closeRfiRpc,
  closeSubmittalRpc,
  createRfiRpc,
  createSubmittalRpc,
  loadEngineeringCoordinationFromSupabase,
  openRfiRpc,
  readEngineeringCoordinationFromLocal,
  respondRfiRpc,
  resubmitSubmittalRpc,
  reviewSubmittalRpc,
  startSubmittalReviewRpc,
  submitSubmittalRpc,
  voidRfiRpc,
  voidSubmittalRpc,
  writeEngineeringCoordinationToLocal,
} from "../../lib/engineeringCoordinationPersistence.ts";

export interface CreateRfiInput {
  rfiNumber: string; subject: string; question: string; discipline: DisciplineType; priority?: RfiPriority; dateRaised?: string; dueDate?: string;
  assignedUserId?: string; references?: RevisionReference[];
}
export interface RespondRfiInput { rfi: EngineeringRfi; responseText: string; responseType?: RfiResponseType; isFinalAnswer?: boolean; references?: RevisionReference[]; }
export interface CreateSubmittalInput {
  submittalNumber: string; title: string; discipline: DisciplineType; category: string; specificationReference?: string; dueReviewDate?: string; references?: RevisionReference[];
}

function message(error: unknown, fallback: string) { return error instanceof Error && error.message.trim() ? error.message : fallback; }

export function useEngineeringCoordinationController({ project, companyId, canRead, guestMode }: { project: Project; companyId?: string; canRead: boolean; guestMode: boolean }) {
  const [data, setData] = useState<EngineeringCoordinationWorkspaceData>(() => readEngineeringCoordinationFromLocal());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const projectData = useMemo<EngineeringCoordinationWorkspaceData>(() => {
    const rfis = data.rfis.filter((item) => item.projectId === project.id);
    const submittals = data.submittals.filter((item) => item.projectId === project.id);
    const rfiIds = new Set(rfis.map((item) => item.id));
    const submittalIds = new Set(submittals.map((item) => item.id));
    const roundIds = new Set(data.submittalRounds.filter((item) => submittalIds.has(item.submittalId)).map((item) => item.id));
    return {
      rfis,
      rfiResponses: data.rfiResponses.filter((item) => rfiIds.has(item.rfiId)),
      rfiDocumentLinks: data.rfiDocumentLinks.filter((item) => rfiIds.has(item.rfiId)),
      submittals,
      submittalRounds: data.submittalRounds.filter((item) => submittalIds.has(item.submittalId)),
      submittalReviews: data.submittalReviews.filter((item) => submittalIds.has(item.submittalId)),
      submittalDocumentLinks: data.submittalDocumentLinks.filter((item) => submittalIds.has(item.submittalId) && roundIds.has(item.roundId)),
    };
  }, [data, project.id]);

  const persistLocal = useCallback((next: EngineeringCoordinationWorkspaceData) => { setData(next); writeEngineeringCoordinationToLocal(next); }, []);
  const reload = useCallback(async () => {
    if (!canRead) { setData(readEngineeringCoordinationFromLocal()); setIsLoading(false); return; }
    setIsLoading(true); setLoadError(null);
    try {
      const loaded = guestMode ? readEngineeringCoordinationFromLocal() : await loadEngineeringCoordinationFromSupabase(companyId, project.id);
      setData(loaded);
    } catch (error) {
      setLoadError(message(error, "Engineering coordination records could not be loaded."));
    } finally { setIsLoading(false); }
  }, [canRead, companyId, guestMode, project.id]);

  useEffect(() => { void reload(); }, [reload, generation]);
  const refresh = useCallback(() => setGeneration((value) => value + 1), []);

  const createRfi = useCallback(async (input: CreateRfiInput) => {
    const rfi = createDraftRfi({ ...input, projectId: project.id, companyId });
    if (!guestMode) {
      await createRfiRpc({ id: rfi.id, projectId: project.id, rfiNumber: rfi.rfiNumber, subject: rfi.subject, question: rfi.question, discipline: rfi.discipline, priority: rfi.priority, dateRaised: rfi.dateRaised, dueDate: rfi.dueDate, assignedUserId: rfi.assignedUserId, references: input.references }, companyId);
      await reload();
      return rfi;
    }
    const links = (input.references || []).map((reference) => ({ id: engineeringId("rfi-link"), companyId, rfiId: rfi.id, documentId: reference.documentId, revisionId: reference.revisionId, createdAt: rfi.createdAt }));
    persistLocal({ ...data, rfis: [rfi, ...data.rfis], rfiDocumentLinks: [...data.rfiDocumentLinks, ...links] });
    return rfi;
  }, [companyId, data, guestMode, persistLocal, project.id, reload]);

  const openRfi = useCallback(async (rfi: EngineeringRfi) => {
    if (!guestMode) { await openRfiRpc(rfi.id, companyId); await reload(); return; }
    const updated = transitionRfi(rfi, "OPEN");
    persistLocal({ ...data, rfis: data.rfis.map((item) => item.id === rfi.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const respondRfi = useCallback(async (input: RespondRfiInput) => {
    const responseId = engineeringId("rfi-response");
    if (!guestMode) {
      await respondRfiRpc({ rfiId: input.rfi.id, responseId, responseText: input.responseText, responseType: input.responseType, isFinalAnswer: input.isFinalAnswer, references: input.references }, companyId);
      await reload(); return;
    }
    const result = appendRfiResponse(input.rfi, { id: responseId, companyId, responseText: input.responseText, responseType: input.responseType, isFinalAnswer: input.isFinalAnswer });
    const links = (input.references || []).map((reference) => ({ id: engineeringId("rfi-link"), companyId, rfiId: input.rfi.id, responseId, documentId: reference.documentId, revisionId: reference.revisionId, createdAt: result.response.createdAt }));
    persistLocal({ ...data, rfis: data.rfis.map((item) => item.id === input.rfi.id ? result.rfi : item), rfiResponses: [...data.rfiResponses, result.response], rfiDocumentLinks: [...data.rfiDocumentLinks, ...links] });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const closeRfi = useCallback(async (rfi: EngineeringRfi, reason?: string) => {
    if (!guestMode) { await closeRfiRpc(rfi.id, reason, companyId); await reload(); return; }
    const updated = transitionRfi(rfi, "CLOSED", { reason });
    persistLocal({ ...data, rfis: data.rfis.map((item) => item.id === rfi.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const voidRfi = useCallback(async (rfi: EngineeringRfi, reason: string) => {
    if (!guestMode) { await voidRfiRpc(rfi.id, reason, companyId); await reload(); return; }
    const updated = transitionRfi(rfi, "VOID", { reason });
    persistLocal({ ...data, rfis: data.rfis.map((item) => item.id === rfi.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const createSubmittal = useCallback(async (input: CreateSubmittalInput) => {
    const created = createDraftSubmittal({ ...input, projectId: project.id, companyId });
    if (!guestMode) {
      await createSubmittalRpc({ id: created.submittal.id, roundId: created.round.id, projectId: project.id, submittalNumber: created.submittal.submittalNumber, title: created.submittal.title, discipline: created.submittal.discipline, category: created.submittal.category, specificationReference: created.submittal.specificationReference, dueReviewDate: created.submittal.dueReviewDate, references: input.references }, companyId);
      await reload(); return created.submittal;
    }
    const links = (input.references || []).map((reference) => ({ id: engineeringId("submittal-link"), companyId, submittalId: created.submittal.id, roundId: created.round.id, documentId: reference.documentId, revisionId: reference.revisionId, createdAt: created.round.createdAt }));
    persistLocal({ ...data, submittals: [created.submittal, ...data.submittals], submittalRounds: [...data.submittalRounds, created.round], submittalDocumentLinks: [...data.submittalDocumentLinks, ...links] });
    return created.submittal;
  }, [companyId, data, guestMode, persistLocal, project.id, reload]);

  const submitSubmittal = useCallback(async (submittal: EngineeringSubmittal) => {
    if (!guestMode) { await submitSubmittalRpc(submittal.id, companyId); await reload(); return; }
    const updated = transitionSubmittal(submittal, "SUBMITTED");
    const round = data.submittalRounds.find((item) => item.submittalId === submittal.id && item.roundNumber === submittal.currentRound);
    if (!round || round.status !== "DRAFT") throw new Error("Current submittal round is unavailable.");
    const timestamp = updated.submittedAt || updated.updatedAt;
    persistLocal({ ...data, submittals: data.submittals.map((item) => item.id === submittal.id ? updated : item), submittalRounds: data.submittalRounds.map((item) => item.id === round.id ? { ...round, status: "SUBMITTED", submittedAt: timestamp, updatedAt: timestamp } : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const startReview = useCallback(async (submittal: EngineeringSubmittal) => {
    if (!guestMode) { await startSubmittalReviewRpc(submittal.id, companyId); await reload(); return; }
    if (submittal.status !== "SUBMITTED") throw new Error("Only a submitted round can enter review.");
    const updated = transitionSubmittal(submittal, "UNDER_REVIEW");
    persistLocal({ ...data, submittals: data.submittals.map((item) => item.id === submittal.id ? updated : item), submittalRounds: data.submittalRounds.map((item) => item.submittalId === submittal.id && item.roundNumber === submittal.currentRound ? { ...item, status: "UNDER_REVIEW", updatedAt: updated.updatedAt } : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const reviewSubmittal = useCallback(async (submittal: EngineeringSubmittal, decision: SubmittalDecision, reviewComments: string) => {
    const round = data.submittalRounds.find((item) => item.submittalId === submittal.id && item.roundNumber === submittal.currentRound);
    if (!round) throw new Error("Current submittal round is unavailable.");
    const reviewId = engineeringId("submittal-review");
    if (!guestMode) { await reviewSubmittalRpc({ submittalId: submittal.id, reviewId, decision, reviewComments }, companyId); await reload(); return; }
    const result = reviewSubmittalRound(submittal, round, { id: reviewId, companyId, decision, reviewComments });
    persistLocal({ ...data, submittals: data.submittals.map((item) => item.id === submittal.id ? result.submittal : item), submittalRounds: data.submittalRounds.map((item) => item.id === round.id ? result.round : item), submittalReviews: [...data.submittalReviews, result.review] });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const resubmitSubmittal = useCallback(async (submittal: EngineeringSubmittal, references: RevisionReference[] = [], dueReviewDate?: string) => {
    const previousRound = data.submittalRounds.find((item) => item.submittalId === submittal.id && item.roundNumber === submittal.currentRound);
    if (!previousRound) throw new Error("Previous submittal round is unavailable.");
    const roundId = engineeringId("submittal-round");
    if (!guestMode) { await resubmitSubmittalRpc({ submittalId: submittal.id, roundId, dueReviewDate, references }, companyId); await reload(); return; }
    const result = createResubmissionRound(submittal, previousRound, { id: roundId, dueReviewDate });
    const links = references.map((reference) => ({ id: engineeringId("submittal-link"), companyId, submittalId: submittal.id, roundId, documentId: reference.documentId, revisionId: reference.revisionId, createdAt: result.round.createdAt }));
    persistLocal({ ...data, submittals: data.submittals.map((item) => item.id === submittal.id ? result.submittal : item), submittalRounds: [...data.submittalRounds, result.round], submittalDocumentLinks: [...data.submittalDocumentLinks, ...links] });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const closeSubmittal = useCallback(async (submittal: EngineeringSubmittal, reason?: string) => {
    if (!guestMode) { await closeSubmittalRpc(submittal.id, reason, companyId); await reload(); return; }
    const updated = transitionSubmittal(submittal, "CLOSED", { reason });
    persistLocal({ ...data, submittals: data.submittals.map((item) => item.id === submittal.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  const voidSubmittal = useCallback(async (submittal: EngineeringSubmittal, reason: string) => {
    if (!guestMode) { await voidSubmittalRpc(submittal.id, reason, companyId); await reload(); return; }
    const updated = transitionSubmittal(submittal, "VOID", { reason });
    persistLocal({ ...data, submittals: data.submittals.map((item) => item.id === submittal.id ? updated : item) });
  }, [companyId, data, guestMode, persistLocal, reload]);

  return { data: projectData, isLoading, loadError, retryLoad: refresh, createRfi, openRfi, respondRfi, closeRfi, voidRfi, createSubmittal, submitSubmittal, startReview, reviewSubmittal, resubmitSubmittal, closeSubmittal, voidSubmittal };
}
