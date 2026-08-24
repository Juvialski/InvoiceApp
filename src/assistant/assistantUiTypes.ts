import type {
  AssistantAttachmentInput,
  AssistantAttachmentReference,
  AssistantClientAction,
  AssistantPreparedAction,
  AssistantReference,
  AssistantMessageRole,
} from "./assistantTypes.ts";
import type { AttachmentRouteHint } from "./attachmentRouter.ts";

/** A file that has passed the local attachment gate and is ready to send. */
export interface AssistantAttachmentDraft extends AssistantAttachmentInput {
  id: string;
  kind: AssistantAttachmentReference["kind"];
  routeHint: AttachmentRouteHint;
  warning?: string;
}

/** The render-safe conversation shape used by the assistant-owned UI. */
export interface AssistantConversationMessage {
  id: string;
  role: Exclude<AssistantMessageRole, "tool">;
  text: string;
  references: AssistantReference[];
  clientActions: AssistantClientAction[];
  preparedActions: AssistantPreparedAction[];
  attachments: AssistantAttachmentReference[];
  warnings: string[];
  createdAt: string;
}
