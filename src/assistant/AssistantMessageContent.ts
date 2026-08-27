import React from "react";
import type { AssistantMessageRole } from "./assistantTypes.ts";
import { AssistantMarkdown } from "./AssistantMarkdown.ts";

export interface AssistantMessageContentProps {
  role: Exclude<AssistantMessageRole, "tool">;
  text: string;
}

export const AssistantMessageContent: React.FC<AssistantMessageContentProps> = ({ role, text }) => role === "assistant"
  ? React.createElement(AssistantMarkdown, { text })
  : React.createElement("p", { className: "whitespace-pre-wrap break-words" }, text);
