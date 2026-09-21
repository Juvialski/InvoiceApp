import { noul, score, type Questions } from "@typesafe-ai/sdk";
import type { ContextCandidate } from "../contextReranker.ts";

export function chunkForV2a<T>(values: readonly T[], chunkSize: number): T[][] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error("chunkSize must be a positive integer.");
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += chunkSize) chunks.push([...values.slice(offset, offset + chunkSize)]);
  return chunks;
}

export function buildMultiAxisFileQuestions(candidates: readonly ContextCandidate[]): Questions {
  const questions: Questions = {};
  for (const [index] of candidates.entries()) {
    questions[`c${index}_relevance`] = noul(
      `For the shared task, is candidates[${index}] relevant to implementation or validation?`,
      {
        true: "The candidate is needed for the task, a direct dependency, a contract, or required validation.",
        false: "The candidate is only adjacent or shares vocabulary without a concrete task relationship.",
      },
    );
    questions[`c${index}_boundary`] = noul(
      `Does candidates[${index}] contain an authority, permission, lifecycle, financial, history, or security boundary that should be reviewed?`,
      {
        true: "The candidate can constrain safe implementation or review and should not be omitted casually.",
        false: "The candidate has no identified consequential authority boundary for this task.",
      },
    );
    questions[`c${index}_validation`] = score(
      `Rate the diagnostic value of validating candidates[${index}] early for the shared task.`,
      [
        "Background: affected but unlikely to diagnose the task early.",
        "Focused: adjacent or useful validation.",
        "Highest: directly exercises changed behavior or a safety boundary.",
      ],
    );
    questions[`c${index}_reviewRisk`] = score(
      `Rate the review risk if candidates[${index}] is misunderstood or omitted.`,
      [
        "Low: omission is unlikely to change behavior or safety.",
        "Material: omission could hide a contract or regression.",
        "High: omission could weaken authority, security, financial truth, or required evidence.",
      ],
    );
  }
  return questions;
}
