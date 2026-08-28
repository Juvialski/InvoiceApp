import React, { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { canAccessAppTab, PERMISSION_KEYS, type PermissionKey } from "../utils/accessControl.ts";
import { getRouteDefinition } from "../utils/routes.ts";
import { BRAND } from "../config/brand.ts";
import { pathForAssistantAction } from "./assistantNavigation.ts";
import { compactAssistantContext } from "./assistantContext.ts";
import { AssistantClientError, cancelAssistantAction as cancelAssistantActionRequest, confirmAssistantAction as confirmAssistantActionRequest, sendAssistantMessage as sendAssistantMessageRequest } from "./assistantClient.ts";
import { isAssistantActionAllowed, isAssistantCompanyIdentityCurrent, sanitizeAssistantClientAction } from "./assistantActionPolicy.ts";
import { readAssistantAttachment, validateAssistantAttachment, type AttachmentRejectionCode } from "./attachmentRouter.ts";
import { getAssistantTour, tourTargetSelector, type AssistantTour, type AssistantTourId } from "./tourRegistry.ts";
import type { AssistantAttachmentInput, AssistantContext, AssistantAttachmentReference, AssistantClientAction, AssistantPreparedAction } from "./assistantTypes.ts";
import type { AssistantAttachmentDraft, AssistantConversationMessage } from "./assistantUiTypes.ts";
import { AssistantPanel } from "./AssistantPanel.tsx";

export type AssistantContextInput = Partial<Omit<AssistantContext, "companyId" | "generation">>;

export interface AssistantActionCallbacks {
  onNavigate?: (path: string, action: AssistantClientAction) => void | Promise<void>;
  onOpenInvoice?: (invoiceId: string, action: AssistantClientAction) => void | Promise<void>;
  onOpenProject?: (projectId: string, action: AssistantClientAction) => void | Promise<void>;
  onOpenReviewInvoice?: (invoiceId: string, action: AssistantClientAction) => void | Promise<void>;
  onOpenPayrollPeriod?: (periodId: string | undefined, action: AssistantClientAction) => void | Promise<void>;
  onOpenAttendanceDate?: (date: string | undefined, action: AssistantClientAction) => void | Promise<void>;
  onStartTour?: (tourId: AssistantTourId) => void | Promise<void>;
  onProcessAttachedInvoice?: (attachment: AssistantAttachmentInput, action: AssistantPreparedAction) => void | Promise<void>;
  onActionBlocked?: (action: AssistantClientAction, reason: string) => void;
  onOpenAiConfiguration?: () => void | Promise<void>;
}

export interface AssistantProviderProps extends AssistantActionCallbacks {
  children: ReactNode;
  currentCompanyId?: string | null;
  currentCompanyGeneration?: number;
  compactContext?: AssistantContextInput;
  /** Keep this false unless the host has a verified authenticated session. */
  isAuthenticated?: boolean;
  guestMode?: boolean;
  permissions?: readonly PermissionKey[];
  actionCallbacks?: AssistantActionCallbacks;
  renderPanel?: boolean;
}

export interface AttachmentRejection {
  fileName: string;
  code: AttachmentRejectionCode | "READ_FAILED";
  message: string;
}

export interface AttachmentAddResult {
  accepted: AssistantAttachmentDraft[];
  rejected: AttachmentRejection[];
}

export interface AssistantContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: readonly AssistantConversationMessage[];
  sendMessage: (message: string, options?: { requestId?: string; isRetry?: boolean; attachments?: readonly AssistantAttachmentInput[] }) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  canRetry: boolean;
  retryLastMessage: () => Promise<boolean>;
  cancelRequest: () => void;
  canOpenAiConfiguration: boolean;
  openAiConfiguration: () => Promise<boolean>;
  pendingActions: readonly AssistantPreparedAction[];
  confirmAction: (actionId: string) => Promise<boolean>;
  cancelAction: (actionId: string) => Promise<boolean>;
  executeClientAction: (action: AssistantClientAction) => Promise<boolean>;
  attachments: readonly AssistantAttachmentDraft[];
  attachmentRefs: readonly AssistantAttachmentReference[];
  addAttachments: (files: readonly File[] | FileList) => Promise<AttachmentAddResult>;
  removeAttachment: (attachmentId: string) => void;
  threadId: string | null;
  contextGeneration: number;
  canUseAssistant: boolean;
  guestMode: boolean;
  activeTour: AssistantTour | null;
  activeTourStepIndex: number;
  startTour: (tourId: AssistantTourId) => boolean;
  nextTourStep: () => void;
  previousTourStep: () => void;
  endTour: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

function normalizedCompanyId(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedGeneration(value: number | undefined) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function localMessageId(counter: React.MutableRefObject<number>) {
  counter.current += 1;
  return `assistant-message-${counter.current}`;
}

function localAttachmentId(counter: React.MutableRefObject<number>) {
  counter.current += 1;
  return `assistant-attachment-${counter.current}`;
}

function nowIso() {
  return new Date().toISOString();
}

function localRequestId(counter: React.MutableRefObject<number>) {
  counter.current += 1;
  return `assistant-request-${Date.now().toString(36)}-${counter.current}`;
}

function errorMessage(error: unknown, canConfigureAi = false) {
  const code = error instanceof AssistantClientError ? error.code : undefined;
  const withReference = (message: string) => {
    const reference = error instanceof AssistantClientError ? error.reference : undefined;
    return reference ? `${message} Reference: ${reference}.` : message;
  };
  if (code === "AI_CREDENTIAL_INVALID") return withReference(canConfigureAi ? "The configured Gemini key could not be authenticated." : "The company AI configuration needs attention. Contact an authorized deployment operator.");
  if (code === "AI_QUOTA_LIMITED") return withReference("Gemini quota or rate limit has been reached.");
  if (code === "AI_PROVIDER_ACCESS_DENIED") return withReference("The configured Gemini project does not have access to the requested AI service.");
  if (code === "AI_MODEL_UNAVAILABLE") return withReference("The AI model is temporarily unavailable.");
  if (code === "AI_PROVIDER_UNAVAILABLE") return withReference(`${BRAND.assistantName} could not reach Gemini.`);
  if (code === "AI_REQUEST_REJECTED") return withReference("Gemini rejected the assistant request configuration.");
  if (code === "AI_TIMEOUT") return withReference("The AI request timed out.");
  if (code === "AI_NETWORK_ERROR") return withReference(`${BRAND.assistantName} could not reach Gemini.`);
  if (code === "AI_NOT_CONFIGURED_FOR_COMPANY") return withReference(canConfigureAi ? "AI is not configured for this company." : "The company AI configuration needs attention. Contact an authorized deployment operator.");
  if (code === "AI_DISABLED_FOR_COMPANY") return withReference(canConfigureAi ? "AI is disabled for this company." : "The company AI configuration needs attention. Contact an authorized deployment operator.");
  if (error instanceof Error && error.message) return error.message;
  return `${BRAND.assistantName} could not complete that request.`;
}

function defaultNavigate(path: string) {
  if (typeof window === "undefined") return;
  const nextPath = path.startsWith("/") ? path : `/${path}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== nextPath) window.history.pushState({}, "", nextPath);
  window.dispatchEvent(new Event("popstate"));
}

function routeIdForClientAction(action: AssistantClientAction) {
  if (action.type === "NAVIGATE") return action.routeId;
  if (action.type === "OPEN_INVOICE") return "invoices";
  if (action.type === "OPEN_REVIEW_INVOICE") return "review";
  if (action.type === "OPEN_PROJECT" || action.type === "OPEN_RFI" || action.type === "OPEN_SUBMITTAL" || action.type === "OPEN_SITE_LOG") return "projects";
  if (action.type === "OPEN_PAYROLL_PERIOD" || action.type === "OPEN_ATTENDANCE_DATE") return "payroll";
  return null;
}

export function AssistantProvider({
  children,
  currentCompanyId,
  currentCompanyGeneration,
  compactContext = {},
  isAuthenticated = false,
  guestMode = false,
  permissions,
  actionCallbacks,
  renderPanel = true,
  onNavigate,
  onOpenInvoice,
  onOpenProject,
  onOpenReviewInvoice,
  onOpenPayrollPeriod,
  onOpenAttendanceDate,
  onStartTour,
  onProcessAttachedInvoice,
  onActionBlocked,
  onOpenAiConfiguration,
}: AssistantProviderProps) {
  const companyId = normalizedCompanyId(currentCompanyId);
  const companyGeneration = normalizedGeneration(currentCompanyGeneration);
  const effectiveGuestMode = Boolean(guestMode || !isAuthenticated);
  const canUseAssistant = Boolean(companyId && isAuthenticated && !guestMode);
  const identity = { companyId, generation: companyGeneration };
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const callbacks = useMemo<AssistantActionCallbacks>(() => ({
    ...actionCallbacks,
    onNavigate: onNavigate || actionCallbacks?.onNavigate,
    onOpenInvoice: onOpenInvoice || actionCallbacks?.onOpenInvoice,
    onOpenProject: onOpenProject || actionCallbacks?.onOpenProject,
    onOpenReviewInvoice: onOpenReviewInvoice || actionCallbacks?.onOpenReviewInvoice,
    onOpenPayrollPeriod: onOpenPayrollPeriod || actionCallbacks?.onOpenPayrollPeriod,
    onOpenAttendanceDate: onOpenAttendanceDate || actionCallbacks?.onOpenAttendanceDate,
    onStartTour: onStartTour || actionCallbacks?.onStartTour,
    onProcessAttachedInvoice: onProcessAttachedInvoice || actionCallbacks?.onProcessAttachedInvoice,
    onActionBlocked: onActionBlocked || actionCallbacks?.onActionBlocked,
  }), [actionCallbacks, onActionBlocked, onNavigate, onOpenAttendanceDate, onOpenInvoice, onOpenPayrollPeriod, onOpenProject, onOpenReviewInvoice, onProcessAttachedInvoice, onStartTour]);

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantConversationMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<AssistantPreparedAction[]>([]);
  const [attachmentRefs, setAttachmentRefs] = useState<AssistantAttachmentReference[]>([]);
  const [attachments, setAttachments] = useState<AssistantAttachmentDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [contextGeneration, setContextGeneration] = useState(companyGeneration);
  const [activeTourId, setActiveTourId] = useState<AssistantTourId | null>(null);
  const [activeTourStepIndex, setActiveTourStepIndex] = useState(0);
  const messageCounterRef = useRef(0);
  const requestCounterRef = useRef(0);
  const attachmentCounterRef = useRef(0);
  const attachmentsRef = useRef<AssistantAttachmentDraft[]>([]);
  const pendingActionsRef = useRef<AssistantPreparedAction[]>([]);
  const threadIdRef = useRef<string | null>(null);
  const contextGenerationRef = useRef(companyGeneration);
  const requestAbortRef = useRef<AbortController | null>(null);
  const attachedInvoicePayloadsRef = useRef(new Map<string, AssistantAttachmentInput>());
  const lastFailedRequestRef = useRef<{ message: string; requestId: string; attachments: AssistantAttachmentInput[] } | null>(null);
  const previousIdentityRef = useRef(identity);

  const resetForCompanyChange = useCallback((nextGeneration: number) => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    attachmentsRef.current = [];
    pendingActionsRef.current = [];
    threadIdRef.current = null;
    contextGenerationRef.current = nextGeneration;
    setMessages([]);
    setPendingActions([]);
    setAttachmentRefs([]);
    setAttachments([]);
    setThreadId(null);
    setContextGeneration(nextGeneration);
    setError(null);
    setCanRetry(false);
    lastFailedRequestRef.current = null;
    attachedInvoicePayloadsRef.current.clear();
    setIsLoading(false);
    setActiveTourId(null);
    setActiveTourStepIndex(0);
  }, []);

  useEffect(() => {
    const previous = previousIdentityRef.current;
    if (!isAssistantCompanyIdentityCurrent(previous, identity) && (previous.companyId !== identity.companyId || previous.generation !== identity.generation)) resetForCompanyChange(companyGeneration);
    previousIdentityRef.current = identity;
    if (contextGenerationRef.current !== companyGeneration && previous.companyId !== identity.companyId) {
      contextGenerationRef.current = companyGeneration;
      setContextGeneration(companyGeneration);
    }
  }, [companyGeneration, identity, resetForCompanyChange]);

  useEffect(() => () => requestAbortRef.current?.abort(), []);

  const clearError = useCallback(() => setError(null), []);
  const cancelRequest = useCallback(() => {
    if (!requestAbortRef.current) return;
    requestAbortRef.current.abort();
    requestAbortRef.current = null;
    setIsLoading(false);
    setCanRetry(true);
    setError("Request cancelled. You can retry the message below.");
  }, []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  const addAttachments = useCallback(async (files: readonly File[] | FileList): Promise<AttachmentAddResult> => {
    const accepted: AssistantAttachmentDraft[] = [];
    const rejected: AttachmentRejection[] = [];
    let totalBytes = attachmentsRef.current.reduce((sum, attachment) => sum + attachment.size, 0);
    for (const file of Array.from(files)) {
      const validation = validateAssistantAttachment(file, { existingTotalBytes: totalBytes });
      if (validation.ok === false) {
        rejected.push({ fileName: file.name || "Attachment", code: validation.code, message: validation.message });
        continue;
      }
      if (attachmentsRef.current.length + accepted.length >= 10) {
        rejected.push({ fileName: file.name || "Attachment", code: "TOTAL_TOO_LARGE", message: "You can attach up to 10 files at a time." });
        continue;
      }
      try {
        const prepared = await readAssistantAttachment(file);
        const draft: AssistantAttachmentDraft = {
          id: localAttachmentId(attachmentCounterRef),
          ...prepared.input,
          kind: prepared.metadata.kind,
          routeHint: prepared.metadata.routeHint,
          ...(prepared.metadata.warning ? { warning: prepared.metadata.warning } : {}),
        };
        accepted.push(draft);
        totalBytes += draft.size;
      } catch (readError) {
        rejected.push({ fileName: file.name || "Attachment", code: "READ_FAILED", message: errorMessage(readError) });
      }
    }
    if (accepted.length) {
      const next = [...attachmentsRef.current, ...accepted];
      attachmentsRef.current = next;
      setAttachments(next);
    }
    if (rejected.length) setError(rejected[0]!.message);
    return { accepted, rejected };
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    const next = attachmentsRef.current.filter((attachment) => attachment.id !== attachmentId);
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const appendResponse = useCallback((response: Awaited<ReturnType<typeof sendAssistantMessageRequest>>, sentAttachments: readonly AssistantAttachmentInput[] = []) => {
    threadIdRef.current = response.threadId;
    contextGenerationRef.current = response.contextGeneration;
    setThreadId(response.threadId);
    setContextGeneration(response.contextGeneration);
    const nextPending = response.preparedActions.filter((action) => action.status === "PREPARED");
    pendingActionsRef.current = nextPending;
    setPendingActions(nextPending);
    setAttachmentRefs(response.attachments);
    for (const action of response.preparedActions) {
      if (action.toolName !== "prepare_process_attached_invoice") continue;
      const fileName = typeof action.preview.fileName === "string" ? action.preview.fileName.toLowerCase() : "";
      const attachment = sentAttachments.find((candidate) => candidate.fileName.toLowerCase() === fileName);
      if (attachment) attachedInvoicePayloadsRef.current.set(action.id, attachment);
    }
    const warnings = response.attachments.map((attachment) => attachment.warning).filter((warning): warning is string => Boolean(warning));
    setMessages((current) => [...current, {
      id: localMessageId(messageCounterRef),
      role: "assistant",
      text: response.message,
      references: response.references,
      clientActions: response.clientActions,
      preparedActions: response.preparedActions,
      attachments: response.attachments,
      warnings: [...new Set(warnings)],
      createdAt: nowIso(),
    }]);
  }, []);

  const sendMessage = useCallback(async (message: string, options: { requestId?: string; isRetry?: boolean; attachments?: readonly AssistantAttachmentInput[] } = {}) => {
    if (isLoading) return false;
    if (!canUseAssistant || !companyId) {
      setError(`Sign in and resolve deployment access before using ${BRAND.assistantName}.`);
      setIsOpen(true);
      return false;
    }
    const normalizedMessage = message.trim() || (attachmentsRef.current.length ? "Please review the attached file(s)." : "");
    if (!normalizedMessage) {
      setError("Ask a question or attach a file before sending.");
      return false;
    }
    const started = identityRef.current;
    const localAttachments = attachmentsRef.current;
    const requestAttachments = options.attachments
      ? [...options.attachments]
      : localAttachments.map(({ id, kind: _kind, routeHint: _routeHint, warning: _warning, ...input }) => input);
    const requestId = options.requestId || localRequestId(requestCounterRef);
    const displayAttachments = localAttachments.map(({ id, fileName, mimeType, size, kind, warning }) => ({ id, fileName, mimeType, size, kind, ...(warning ? { warning } : {}) }));
    const controller = new AbortController();
    requestAbortRef.current?.abort();
    requestAbortRef.current = controller;
    const context = compactAssistantContext({ ...compactContext, companyId, generation: companyGeneration });
    setIsOpen(true);
    setError(null);
    setCanRetry(false);
    setIsLoading(true);
    if (!options.isRetry) setMessages((current) => [...current, { id: localMessageId(messageCounterRef), role: "user", text: normalizedMessage, references: [], clientActions: [], preparedActions: [], attachments: displayAttachments, warnings: [], createdAt: nowIso() }]);
    attachmentsRef.current = [];
    setAttachments([]);
    try {
      const response = await sendAssistantMessageRequest({ companyId, threadId: threadIdRef.current, requestId, message: normalizedMessage, context, attachments: requestAttachments, signal: controller.signal });
      if (!isAssistantCompanyIdentityCurrent(started, identityRef.current)) return false;
      appendResponse(response, requestAttachments);
      lastFailedRequestRef.current = null;
      setCanRetry(false);
      return true;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        lastFailedRequestRef.current = { message: normalizedMessage, requestId, attachments: requestAttachments };
        setCanRetry(true);
        return false;
      }
      if (requestError instanceof Error && requestError.name === "AbortError") {
        lastFailedRequestRef.current = { message: normalizedMessage, requestId, attachments: requestAttachments };
        setCanRetry(true);
        return false;
      }
      if (requestError instanceof AssistantClientError && requestError.threadId) {
        threadIdRef.current = requestError.threadId;
        setThreadId(requestError.threadId);
      }
      lastFailedRequestRef.current = { message: normalizedMessage, requestId, attachments: requestAttachments };
      setCanRetry(true);
      if (isAssistantCompanyIdentityCurrent(started, identityRef.current)) setError(errorMessage(requestError, permissions?.includes(PERMISSION_KEYS.platformManage) === true));
      return false;
    } finally {
      if (isAssistantCompanyIdentityCurrent(started, identityRef.current)) {
        setIsLoading(false);
        if (requestAbortRef.current === controller) requestAbortRef.current = null;
      }
    }
  }, [appendResponse, canUseAssistant, companyGeneration, companyId, compactContext, isLoading, permissions]);

  const retryLastMessage = useCallback(() => {
    const failed = lastFailedRequestRef.current;
    if (!failed || isLoading) return Promise.resolve(false);
    return sendMessage(failed.message, { requestId: failed.requestId, isRetry: true, attachments: failed.attachments });
  }, [isLoading, sendMessage]);

  const canOpenAiConfiguration = Boolean(onOpenAiConfiguration && permissions?.includes(PERMISSION_KEYS.platformManage));
  const openAiConfiguration = useCallback(async () => {
    if (!canOpenAiConfiguration || !onOpenAiConfiguration) return false;
    await onOpenAiConfiguration();
    return true;
  }, [canOpenAiConfiguration, onOpenAiConfiguration]);

  const confirmAction = useCallback(async (actionId: string) => {
    if (!canUseAssistant || !companyId) {
      setError("Sign in and resolve deployment access before confirming an assistant action.");
      return false;
    }
    const pending = pendingActionsRef.current.find((action) => action.id === actionId && action.status === "PREPARED");
    if (!pending) {
      setError("That assistant action is no longer pending.");
      return false;
    }
    const started = identityRef.current;
    const controller = new AbortController();
    requestAbortRef.current?.abort();
    requestAbortRef.current = controller;
    setError(null);
    setIsLoading(true);
    try {
      if (pending.toolName === "prepare_process_attached_invoice" && callbacks.onProcessAttachedInvoice) {
        const attachment = attachedInvoicePayloadsRef.current.get(actionId);
        if (!attachment?.dataBase64 || !attachment.mimeType || !attachment.fileName) {
          setError("The original invoice attachment is no longer available. Attach it again and prepare the action again.");
          return false;
        }
        await callbacks.onProcessAttachedInvoice(attachment, pending);
      }
      const response = await confirmAssistantActionRequest({ companyId, actionId, contextGeneration: contextGenerationRef.current, signal: controller.signal });
      if (!isAssistantCompanyIdentityCurrent(started, identityRef.current)) return false;
      threadIdRef.current = response.threadId;
      setThreadId(response.threadId);
      contextGenerationRef.current = response.contextGeneration;
      setContextGeneration(response.contextGeneration);
      const responsePending = response.preparedActions.length ? response.preparedActions.filter((action) => action.status === "PREPARED") : pendingActionsRef.current.filter((action) => action.id !== actionId);
      pendingActionsRef.current = responsePending;
      setPendingActions(responsePending);
      setAttachmentRefs(response.attachments);
      attachedInvoicePayloadsRef.current.delete(actionId);
      setMessages((current) => [...current, { id: localMessageId(messageCounterRef), role: "assistant", text: response.message, references: response.references, clientActions: response.clientActions, preparedActions: response.preparedActions, attachments: response.attachments, warnings: response.attachments.map((attachment) => attachment.warning).filter((warning): warning is string => Boolean(warning)), createdAt: nowIso() }]);
      return true;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return false;
      if (requestError instanceof Error && requestError.name === "AbortError") return false;
      if (isAssistantCompanyIdentityCurrent(started, identityRef.current)) setError(errorMessage(requestError, permissions?.includes(PERMISSION_KEYS.platformManage) === true));
      return false;
    } finally {
      if (isAssistantCompanyIdentityCurrent(started, identityRef.current)) {
        setIsLoading(false);
        if (requestAbortRef.current === controller) requestAbortRef.current = null;
      }
    }
  }, [canUseAssistant, callbacks, companyId, permissions]);

  const cancelAction = useCallback(async (actionId: string) => {
    if (!canUseAssistant || !companyId) {
      setError("Sign in and resolve deployment access before cancelling an assistant action.");
      return false;
    }
    const pending = pendingActionsRef.current.find((action) => action.id === actionId && action.status === "PREPARED");
    if (!pending) {
      setError("That assistant action is no longer pending.");
      return false;
    }
    const started = identityRef.current;
    try {
      const response = await cancelAssistantActionRequest({ companyId, actionId, contextGeneration: contextGenerationRef.current });
      if (!isAssistantCompanyIdentityCurrent(started, identityRef.current)) return false;
      pendingActionsRef.current = pendingActionsRef.current.filter((action) => action.id !== actionId);
      attachedInvoicePayloadsRef.current.delete(actionId);
      setPendingActions(pendingActionsRef.current);
      setMessages((current) => [...current, { id: localMessageId(messageCounterRef), role: "assistant", text: response.message, references: response.references, clientActions: response.clientActions, preparedActions: response.preparedActions, attachments: response.attachments, warnings: [], createdAt: nowIso() }]);
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    }
  }, [canUseAssistant, companyId]);

  const focusTourStep = useCallback((step: NonNullable<AssistantTour["steps"]>[number]) => {
    if (typeof document === "undefined") return;
    if (step.routeId) {
      const action: AssistantClientAction = { type: "NAVIGATE", routeId: step.routeId, label: step.title };
      const path = pathForAssistantAction(action);
      if (path && isAssistantActionAllowed(action, permissions)) void callbacks.onNavigate?.(path, action);
    }
    const target = step.target.startsWith("route:")
      ? document.querySelector(`[data-tour="${step.target}"]`)
      : document.querySelector(tourTargetSelector(step.target as Parameters<typeof tourTargetSelector>[0]));
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("verification-field-highlight");
    window.setTimeout(() => target.classList.remove("verification-field-highlight"), 2_000);
  }, [callbacks, permissions]);

  const startTour = useCallback((tourId: AssistantTourId) => {
    const tour = getAssistantTour(tourId);
    if (!tour) return false;
    setActiveTourId(tour.id);
    setActiveTourStepIndex(0);
    setIsOpen(true);
    if (tour.steps[0] && typeof window !== "undefined") window.setTimeout(() => focusTourStep(tour.steps[0]!), 0);
    try {
      const result = callbacks.onStartTour?.(tour.id);
      if (result && typeof (result as Promise<void>).catch === "function") void (result as Promise<void>).catch((tourError) => setError(errorMessage(tourError)));
    } catch (tourError) {
      setError(errorMessage(tourError));
      return false;
    }
    return true;
  }, [callbacks, focusTourStep]);

  const nextTourStep = useCallback(() => {
    const tour = activeTourId ? getAssistantTour(activeTourId) : undefined;
    if (!tour) return;
    if (activeTourStepIndex >= tour.steps.length - 1) {
      setActiveTourId(null);
      setActiveTourStepIndex(0);
    } else {
      const nextIndex = activeTourStepIndex + 1;
      setActiveTourStepIndex(nextIndex);
      if (tour.steps[nextIndex]) focusTourStep(tour.steps[nextIndex]!);
    }
  }, [activeTourId, activeTourStepIndex, focusTourStep]);

  const previousTourStep = useCallback(() => {
    const tour = activeTourId ? getAssistantTour(activeTourId) : undefined;
    const previousIndex = Math.max(0, activeTourStepIndex - 1);
    setActiveTourStepIndex(previousIndex);
    if (tour?.steps[previousIndex]) focusTourStep(tour.steps[previousIndex]!);
  }, [activeTourId, activeTourStepIndex, focusTourStep]);
  const endTour = useCallback(() => { setActiveTourId(null); setActiveTourStepIndex(0); }, []);

  const executeClientAction = useCallback(async (action: AssistantClientAction) => {
    const safeAction = sanitizeAssistantClientAction(action);
    const blocked = (reason: string) => {
      callbacks.onActionBlocked?.(action, reason);
      setError(reason);
      return false;
    };
    if (!safeAction || !isAssistantActionAllowed(safeAction, permissions)) return blocked("That assistant action is not available in this workspace.");
    if (safeAction.type === "START_TOUR") return startTour(safeAction.tourId as AssistantTourId);
    const path = pathForAssistantAction(safeAction);
    if (!path) return blocked("That assistant destination is not recognized.");
    const routeId = routeIdForClientAction(safeAction);
    const route = routeId ? getRouteDefinition(routeId) : undefined;
    if (permissions && route && !canAccessAppTab(route.appTab, permissions)) return blocked(`You do not have permission to open that ${BRAND.productName} area.`);
    try {
      if (safeAction.type === "NAVIGATE") {
        if (callbacks.onNavigate) await callbacks.onNavigate(path, safeAction);
        else defaultNavigate(path);
      } else if (safeAction.type === "OPEN_INVOICE" && safeAction.entityId) {
        if (callbacks.onOpenInvoice) await callbacks.onOpenInvoice(safeAction.entityId, safeAction);
        else if (callbacks.onNavigate) await callbacks.onNavigate(path, safeAction);
        else defaultNavigate(path);
      } else if (safeAction.type === "OPEN_PROJECT" && safeAction.entityId) {
        if (callbacks.onOpenProject) await callbacks.onOpenProject(safeAction.entityId, safeAction);
        else if (callbacks.onNavigate) await callbacks.onNavigate(path, safeAction);
        else defaultNavigate(path);
      } else if ((safeAction.type === "OPEN_RFI" || safeAction.type === "OPEN_SUBMITTAL" || safeAction.type === "OPEN_SITE_LOG") && safeAction.entityId && safeAction.projectId) {
        if (callbacks.onNavigate) await callbacks.onNavigate(path, safeAction);
        else defaultNavigate(path);
      } else if (safeAction.type === "OPEN_REVIEW_INVOICE" && safeAction.entityId) {
        if (callbacks.onOpenReviewInvoice) await callbacks.onOpenReviewInvoice(safeAction.entityId, safeAction);
        else if (callbacks.onNavigate) await callbacks.onNavigate(path, safeAction);
        else defaultNavigate(path);
      } else if (safeAction.type === "OPEN_PAYROLL_PERIOD") {
        if (callbacks.onOpenPayrollPeriod) await callbacks.onOpenPayrollPeriod(safeAction.entityId, safeAction);
        else if (callbacks.onNavigate) await callbacks.onNavigate(path, safeAction);
        else defaultNavigate(path);
      } else if (safeAction.type === "OPEN_ATTENDANCE_DATE") {
        if (callbacks.onOpenAttendanceDate) await callbacks.onOpenAttendanceDate(safeAction.date, safeAction);
        else if (callbacks.onNavigate) await callbacks.onNavigate(path, safeAction);
        else defaultNavigate(path);
      }
      return true;
    } catch (actionError) {
      setError(errorMessage(actionError));
      return false;
    }
  }, [callbacks, permissions, startTour]);

  const value = useMemo<AssistantContextValue>(() => ({
    isOpen,
    open,
    close,
    toggle,
    messages,
    sendMessage,
    isLoading,
    error,
    clearError,
    canRetry,
    retryLastMessage,
    cancelRequest,
    canOpenAiConfiguration,
    openAiConfiguration,
    pendingActions,
    confirmAction,
    cancelAction,
    executeClientAction,
    attachments,
    attachmentRefs,
    addAttachments,
    removeAttachment,
    threadId,
    contextGeneration,
    canUseAssistant,
    guestMode: effectiveGuestMode,
    activeTour: activeTourId ? getAssistantTour(activeTourId) || null : null,
    activeTourStepIndex,
    startTour,
    nextTourStep,
    previousTourStep,
    endTour,
  }), [activeTourId, activeTourStepIndex, addAttachments, attachments, attachmentRefs, canOpenAiConfiguration, canRetry, canUseAssistant, cancelAction, cancelRequest, clearError, close, confirmAction, contextGeneration, effectiveGuestMode, endTour, error, executeClientAction, isLoading, isOpen, messages, nextTourStep, open, openAiConfiguration, pendingActions, previousTourStep, removeAttachment, retryLastMessage, sendMessage, startTour, threadId, toggle]);

  return <AssistantContext.Provider value={value}>{children}{renderPanel && <AssistantPanel />}</AssistantContext.Provider>;
}

export function useAssistant() {
  const context = React.useContext(AssistantContext);
  if (!context) throw new Error("useAssistant must be used inside AssistantProvider.");
  return context;
}

export function useOptionalAssistant() {
  return React.useContext(AssistantContext);
}
