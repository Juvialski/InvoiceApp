import React from "react";
import { BRAND } from "../config/brand.ts";

export type BrandMarkVariant = "compact" | "header" | "sidebar" | "auth";

export interface BrandMarkProps {
  variant?: BrandMarkVariant;
  decorative?: boolean;
  className?: string;
}

const sizeClasses: Record<BrandMarkVariant, string> = {
  compact: "h-8 w-8",
  header: "h-7 w-10",
  sidebar: "h-12 w-16",
  auth: "h-16 w-24 sm:h-[4.5rem] sm:w-28",
};

/** Shared official HydroQualiSense mark treatment for restrained identity surfaces. */
export function BrandMark({ variant = "compact", decorative = true, className = "" }: BrandMarkProps) {
  return (
    <img
      src={BRAND.logoPath}
      alt={decorative ? "" : `${BRAND.companyName} logo`}
      aria-hidden={decorative ? "true" : undefined}
      className={`inline-block shrink-0 object-contain drop-shadow-[0_0_12px_rgba(14,165,233,0.3)] ${sizeClasses[variant]} ${className}`}
    />
  );
}

export default BrandMark;
