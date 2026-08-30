export interface AssistantComposerSubmissionInput {
  readonly draft: string;
  readonly attachmentCount: number;
  readonly isLoading: boolean;
  readonly canUseAssistant: boolean;
}

export interface AssistantComposerSubmission {
  /** The exact draft value captured for the request before the textarea clears. */
  readonly message: string;
  /** True only when the provider's synchronous acceptance checks can pass. */
  readonly accepted: boolean;
  /** Clearing is safe only after the request snapshot has been accepted locally. */
  readonly clearDraft: boolean;
}

/**
 * Keep the composer acceptance gate identical to AssistantProvider.sendMessage's
 * synchronous checks. Network/provider failures happen after acceptance and
 * remain retryable through the provider's saved request snapshot.
 */
export function prepareAssistantComposerSubmission(
  input: AssistantComposerSubmissionInput,
): AssistantComposerSubmission {
  const message = input.draft;
  const hasContent = Boolean(message.trim() || input.attachmentCount > 0);
  const accepted = !input.isLoading && input.canUseAssistant && hasContent;
  return {
    message,
    accepted,
    clearDraft: accepted,
  };
}
