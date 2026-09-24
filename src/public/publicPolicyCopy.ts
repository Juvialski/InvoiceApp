import type { PublicSiteVariant } from "../config/publicBranding.ts";

export function publicPolicyTextForVariant(text: string, variant: PublicSiteVariant) {
  if (variant === "company") return text;
  return text
    .replace(/Hydroqualisense's/gi, "The QA environment's")
    .replace(/Hydroqualisense/gi, "The QA environment")
    .replace("The QA environment is a hosted business operations application.", "The QA environment is a non-production software showcase.");
}
