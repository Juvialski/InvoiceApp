import React from "react";
import { BRAND } from "../config/brand.ts";
import { Workflow } from "lucide-react";
import { currentWorkspacePresentation, type WorkspacePresentation } from "../config/workspacePresentation.ts";

export type BrandMarkVariant = "compact" | "header" | "sidebar" | "auth";

export interface BrandMarkProps {
  variant?: BrandMarkVariant;
  decorative?: boolean;
  className?: string;
  presentation?: WorkspacePresentation;
}

const sizeClasses: Record<BrandMarkVariant, string> = {
  compact: "h-8 w-8",
  header: "h-7 w-10",
  sidebar: "h-12 w-16",
  auth: "h-16 w-24 sm:h-[4.5rem] sm:w-28",
};

/** Shared official Hydroqualisense mark treatment for restrained identity surfaces. */
export function BrandMark({ variant = "compact", decorative = true, className = "", presentation = currentWorkspacePresentation() }: BrandMarkProps) {
  if (!presentation.companyLogoPath) {
    return (
      <span
        aria-hidden={decorative || undefined}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : `${presentation.displayName} mark`}
        className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-200/30 bg-cyan-50 text-cyan-800 ${sizeClasses[variant]} ${className}`}
      >
        <Workflow aria-hidden="true" className="h-1/2 w-1/2" />
      </span>
    );
  }

  return (
    <img
      src={presentation.companyLogoPath || BRAND.logoPath}
      alt={decorative ? "" : `${presentation.workspaceLabel} logo`}
      aria-hidden={decorative ? "true" : undefined}
      className={`inline-block shrink-0 object-contain drop-shadow-[0_0_12px_rgba(14,165,233,0.3)] ${sizeClasses[variant]} ${className}`}
    />
  );
}

export default BrandMark;
