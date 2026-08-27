import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const DANGEROUS_PROTOCOL_PATTERN = /^(?:javascript|vbscript|data|file|blob):/i;
const CONTROL_CHARACTER_PATTERN = `[\\u0000-\\u001f\\u007f]`;

function normalizedUrlForProtocolCheck(value: string) {
  let candidate = value.trim();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
  return candidate.replace(new RegExp(CONTROL_CHARACTER_PATTERN, "g"), "").trim();
}

/**
 * Allow only links that can be safely opened from assistant-authored text.
 * Returning an empty string lets the renderer replace the link with inert text.
 */
export function safeAssistantUrl(value: string) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return "";
  const protocolCheck = normalizedUrlForProtocolCheck(candidate);
  if (DANGEROUS_PROTOCOL_PATTERN.test(protocolCheck)) return "";
  if (/^(?:#|\/|\.\/|\.\.\/)/.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate, "https://engoryx.invalid");
    return /^(?:https?|mailto):$/i.test(parsed.protocol) ? candidate : "";
  } catch {
    return "";
  }
}

const markdownComponents: Components = {
  p: ({ children }) => React.createElement("p", { className: "my-2 first:mt-0 last:mb-0" }, children),
  strong: ({ children }) => React.createElement("strong", { className: "font-extrabold text-slate-950" }, children),
  em: ({ children }) => React.createElement("em", { className: "italic" }, children),
  ul: ({ children }) => React.createElement("ul", { className: "my-2 list-disc space-y-1 pl-5" }, children),
  ol: ({ children }) => React.createElement("ol", { className: "my-2 list-decimal space-y-1 pl-5" }, children),
  li: ({ children }) => React.createElement("li", { className: "break-words pl-0.5" }, children),
  blockquote: ({ children }) => React.createElement("blockquote", { className: "my-2 border-l-2 border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-slate-600" }, children),
  code: ({ className, children }) => React.createElement("code", { className: className ? "block min-w-max font-mono text-[0.78rem] leading-5 text-slate-100" : "rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.82em] text-indigo-800" }, children),
  pre: ({ children }) => React.createElement("pre", { className: "my-2 max-w-full overflow-x-auto rounded-xl bg-slate-950 px-3 py-2.5 text-[0.78rem] leading-5" }, children),
  a: ({ href, children, title }) => {
    const safeHref = safeAssistantUrl(href || "");
    if (!safeHref) return React.createElement("span", { className: "text-slate-700" }, children);
    const external = /^(?:https?):/i.test(safeHref);
    return React.createElement("a", {
      href: safeHref,
      ...(title ? { title } : {}),
      ...(external ? { target: "_blank", rel: "noreferrer noopener" } : {}),
      className: "break-all font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-900",
    }, children);
  },
  table: ({ children }) => React.createElement("div", { className: "my-2 max-w-full overflow-x-auto rounded-lg border border-slate-200" }, React.createElement("table", { className: "min-w-full text-left text-xs" }, children)),
  th: ({ children }) => React.createElement("th", { className: "border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 font-extrabold text-slate-600" }, children),
  td: ({ children }) => React.createElement("td", { className: "border-b border-slate-100 px-2.5 py-1.5 align-top" }, children),
  h1: ({ children }) => React.createElement("h1", { className: "mb-2 mt-3 first:mt-0 text-base font-black text-slate-950" }, children),
  h2: ({ children }) => React.createElement("h2", { className: "mb-2 mt-3 first:mt-0 text-sm font-black text-slate-950" }, children),
  h3: ({ children }) => React.createElement("h3", { className: "mb-1.5 mt-2.5 first:mt-0 text-sm font-extrabold text-slate-950" }, children),
  hr: () => React.createElement("hr", { className: "my-2 border-slate-200" }),
  img: () => null,
};

export interface AssistantMarkdownProps {
  text: string;
}

export const AssistantMarkdown: React.FC<AssistantMarkdownProps> = ({ text }) => React.createElement(
  "div",
  { className: "min-w-0 max-w-full break-words [overflow-wrap:anywhere]" },
  React.createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm],
    skipHtml: true,
    urlTransform: safeAssistantUrl,
    components: markdownComponents,
  }, text),
);