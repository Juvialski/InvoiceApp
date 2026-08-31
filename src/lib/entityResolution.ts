import type {
  EmailIntakeProfile,
  EntityResolutionAction,
  EntityResolutionConfidence,
  EntityResolutionConflict,
  EntityResolutionEnrichmentField,
  EntityResolutionResult,
  FinancialAccountIdentityEvidence,
  Vendor,
  VendorIdentityEvidence,
} from "../types.ts";
import type { FinancialAccount } from "./cashBanking.ts";
import { DISALLOWED_DOMAIN_RULES, normalizeDomain, normalizeEmail } from "./emailIntake.ts";

/**
 * Normalized Philippine Tax Identifier (TIN).
 * Philippine TINs are typically 9 digits (base) or 12 digits (base + 3-digit branch code).
 */
export interface NormalizedTaxId {
  raw: string;
  normalized: string;
  baseTin: string;
  branchCode?: string;
  formatted: string;
  isValid: boolean;
}

/**
 * Normalizes a tax identifier / TIN conservatively according to Philippine conventions.
 * Strips punctuation, spaces, and non-alphanumeric characters.
 */
export function normalizeTaxId(value?: string | null): NormalizedTaxId | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Extract digits and alphanumeric characters, strip noise like "TIN:", "VAT Reg TIN", etc.
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digitsOnly = cleaned.replace(/[^0-9]/g, "");

  if (!digitsOnly || digitsOnly.length < 9) {
    if (cleaned.length >= 9) {
      const baseTin = cleaned.slice(0, 9);
      const branchCode = cleaned.length >= 12 ? cleaned.slice(9, 12) : undefined;
      return {
        raw,
        normalized: cleaned,
        baseTin,
        branchCode,
        formatted: branchCode ? `${baseTin.slice(0, 3)}-${baseTin.slice(3, 6)}-${baseTin.slice(6, 9)}-${branchCode}` : `${baseTin.slice(0, 3)}-${baseTin.slice(3, 6)}-${baseTin.slice(6, 9)}`,
        isValid: false,
      };
    }
    return null;
  }

  const baseTin = digitsOnly.slice(0, 9);
  const branchCode = digitsOnly.length >= 12 ? digitsOnly.slice(9, 12) : (digitsOnly.length > 9 ? digitsOnly.slice(9) : undefined);
  const normalized = branchCode ? `${baseTin}${branchCode}` : baseTin;
  const formatted = branchCode
    ? `${baseTin.slice(0, 3)}-${baseTin.slice(3, 6)}-${baseTin.slice(6, 9)}-${branchCode}`
    : `${baseTin.slice(0, 3)}-${baseTin.slice(3, 6)}-${baseTin.slice(6, 9)}`;

  return {
    raw,
    normalized,
    baseTin,
    branchCode,
    formatted,
    isValid: true,
  };
}

/**
 * Compares two tax identifiers.
 * Base 9 digits are authoritative. Branch codes are secondary.
 */
export function compareTaxIds(tinA?: string | null, tinB?: string | null): {
  match: boolean;
  conflict: boolean;
  baseMatch: boolean;
  branchMatch: boolean;
  reason?: string;
} {
  const normA = normalizeTaxId(tinA);
  const normB = normalizeTaxId(tinB);

  if (!normA || !normB || !normA.isValid || !normB.isValid) {
    return { match: false, conflict: false, baseMatch: false, branchMatch: false };
  }

  if (normA.baseTin !== normB.baseTin) {
    return {
      match: false,
      conflict: true,
      baseMatch: false,
      branchMatch: false,
      reason: `Tax IDs conflict: ${normA.formatted} vs ${normB.formatted}.`,
    };
  }

  const branchA = normA.branchCode || "000";
  const branchB = normB.branchCode || "000";
  const branchMatch = branchA === branchB;

  return {
    match: true,
    conflict: false,
    baseMatch: true,
    branchMatch,
    reason: branchMatch
      ? `Exact tax ID match (${normA.formatted}).`
      : `Base tax ID matches (${normA.baseTin}), with branch difference (${branchA} vs ${branchB}).`,
  };
}

const COMMON_LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "phils",
  "philippines",
  "enterprise",
  "enterprises",
  "trading",
  "services",
  "group",
  "holdings",
  "ventures",
]);

/**
 * Normalizes a company / business name for robust deterministic comparison.
 */
export function normalizeBusinessName(name?: string | null): string {
  if (!name) return "";
  const cleaned = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const filtered = words.filter((word) => !COMMON_LEGAL_SUFFIXES.has(word));
  return (filtered.length > 0 ? filtered : words).join(" ");
}

/**
 * Computes a deterministic string similarity score between 0 and 1.
 */
export function businessNameSimilarity(nameA?: string | null, nameB?: string | null): number {
  const normA = normalizeBusinessName(nameA);
  const normB = normalizeBusinessName(nameB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const wordsA = new Set(normA.split(" "));
  const wordsB = new Set(normB.split(" "));

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const minSize = Math.min(wordsA.size, wordsB.size);
  const overlap = minSize > 0 ? intersection / minSize : 0;
  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  // Exact substring match bonus
  if (normA.includes(normB) || normB.includes(normA)) {
    return Math.max(jaccard, 0.85);
  }

  return Math.max(jaccard, overlap * 0.85);
}

/**
 * Normalizes a Philippine bank / financial institution name to a canonical code.
 */
export function normalizeInstitution(name?: string | null): { code: string; displayName: string } {
  const raw = String(name || "").trim().toUpperCase();
  if (!raw) return { code: "UNKNOWN", displayName: "Unknown Institution" };

  if (/\b(BDO|BANCO DE ORO|BDO UNIBANK)\b/i.test(raw)) {
    return { code: "BDO", displayName: "BDO Unibank" };
  }
  if (/\b(BPI|BANK OF THE PHILIPPINE ISLANDS|BPI FAMILY)\b/i.test(raw)) {
    return { code: "BPI", displayName: "Bank of the Philippine Islands" };
  }
  if (/\b(METROBANK|MBTC|METROPOLITAN BANK)\b/i.test(raw)) {
    return { code: "METROBANK", displayName: "Metrobank" };
  }
  if (/\b(GCASH|MYNT|G-XCHANGE)\b/i.test(raw)) {
    return { code: "GCASH", displayName: "GCash" };
  }
  if (/\b(MAYA|PAYMAYA)\b/i.test(raw)) {
    return { code: "MAYA", displayName: "Maya" };
  }
  if (/\b(UNIONBANK|UBP|UNION BANK)\b/i.test(raw)) {
    return { code: "UNIONBANK", displayName: "UnionBank of the Philippines" };
  }
  if (/\b(SECURITY BANK|SBC)\b/i.test(raw)) {
    return { code: "SECURITY_BANK", displayName: "Security Bank" };
  }
  if (/\b(CHINABANK|CHINA BANK|CBC)\b/i.test(raw)) {
    return { code: "CHINABANK", displayName: "China Bank" };
  }
  if (/\b(RCBC|RIZAL COMMERCIAL)\b/i.test(raw)) {
    return { code: "RCBC", displayName: "RCBC" };
  }
  if (/\b(PNB|PHILIPPINE NATIONAL BANK)\b/i.test(raw)) {
    return { code: "PNB", displayName: "PNB" };
  }
  if (/\b(LANDBANK|LAND BANK)\b/i.test(raw)) {
    return { code: "LANDBANK", displayName: "Landbank" };
  }
  if (/\b(EASTWEST|EAST WEST)\b/i.test(raw)) {
    return { code: "EASTWEST", displayName: "EastWest Bank" };
  }

  const clean = raw.replace(/[^A-Z0-9]/g, "");
  return { code: clean.slice(0, 16) || "OTHER", displayName: String(name).trim() };
}

/**
 * Extracts a normalized 4-digit account suffix from account number strings.
 */
export function extractAccountSuffix(value?: string | null): string {
  if (!value) return "";
  const digits = String(value).replace(/[^0-9]/g, "");
  if (digits.length < 4) return digits;
  return digits.slice(-4);
}

/**
 * Resolves an individual Vendor candidate against existing company Vendors.
 */
export function resolveVendorCandidate(
  candidate: {
    candidateId: string;
    evidence: VendorIdentityEvidence;
    sourceRef?: { messageId?: string; subject?: string; sender?: string; fileName?: string; attachmentId?: string };
  },
  existingVendors: Vendor[],
  matchingProfiles?: EmailIntakeProfile[]
): EntityResolutionResult {
  const { candidateId, evidence, sourceRef } = candidate;
  const candidateTin = normalizeTaxId(evidence.taxId);
  const candidateEmail = normalizeEmail(evidence.email || evidence.senderEmail);
  const candidateDomain = normalizeDomain(evidence.senderDomain);
  const candidateNormName = normalizeBusinessName(evidence.registeredName || evidence.companyName || evidence.name);

  const reasons: string[] = [];
  const conflicts: EntityResolutionConflict[] = [];
  const proposedEnrichments: EntityResolutionEnrichmentField[] = [];

  const matchedProfile = matchingProfiles?.find((p) => p.linkedVendorId);
  const profileLinkedVendorId = evidence.linkedProfileVendorId || matchedProfile?.linkedVendorId;

  // 1. Exact TIN Match (Strongest Authority)
  if (candidateTin && candidateTin.isValid) {
    const tinMatches = existingVendors.filter((v) => {
      const vTin = normalizeTaxId(v.taxId);
      return vTin && vTin.isValid && vTin.baseTin === candidateTin.baseTin;
    });

    if (tinMatches.length === 1) {
      const vendor = tinMatches[0];
      const vendorTin = normalizeTaxId(vendor.taxId);
      const tinComparison = compareTaxIds(evidence.taxId, vendor.taxId);

      reasons.push(tinComparison.reason || `Exact tax ID match (${candidateTin.formatted}).`);

      // Check if profile linked vendor agrees or conflicts
      if (profileLinkedVendorId && profileLinkedVendorId !== vendor.id) {
        const linkedVendor = existingVendors.find((v) => v.id === profileLinkedVendorId);
        conflicts.push({
          field: "taxId",
          label: "Tax Identifier",
          existingValue: linkedVendor?.taxId || undefined,
          candidateValue: candidateTin.formatted,
          reason: `Extracted tax ID matches vendor '${vendor.name}', but saved sender rule linked to '${linkedVendor?.name || profileLinkedVendorId}'.`,
        });
      }

      // Check for safe enrichments
      if (candidateEmail && !vendor.email) {
        proposedEnrichments.push({
          field: "email",
          label: "Email Address",
          currentValue: undefined,
          proposedValue: candidateEmail,
        });
      }
      if (evidence.phone && !vendor.phone) {
        proposedEnrichments.push({
          field: "phone",
          label: "Phone Number",
          currentValue: undefined,
          proposedValue: evidence.phone.trim(),
        });
      }
      if (evidence.address && !vendor.address) {
        proposedEnrichments.push({
          field: "address",
          label: "Business Address",
          currentValue: undefined,
          proposedValue: evidence.address.trim(),
        });
      }
      if (candidateTin.branchCode && vendorTin && !vendorTin.branchCode) {
        proposedEnrichments.push({
          field: "taxId",
          label: "Branch Code",
          currentValue: vendorTin.formatted,
          proposedValue: candidateTin.formatted,
        });
      }

      const hasConflicts = conflicts.length > 0;
      const proposedAction: EntityResolutionAction = hasConflicts
        ? "NEEDS_REVIEW"
        : proposedEnrichments.length > 0
        ? "ENRICH_EXISTING"
        : "LINK_EXISTING";

      return {
        entityType: "VENDOR",
        candidateId,
        proposedAction,
        confidence: "HIGH",
        confidenceScore: hasConflicts ? 65 : 98,
        matchedEntityId: vendor.id,
        matchedEntityName: vendor.name,
        matchedEntityDetails: {
          taxId: vendor.taxId,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
        },
        matchReasons: reasons,
        conflicts,
        proposedEnrichments,
        extractedEvidence: { ...evidence },
        normalizedEvidence: {
          taxId: candidateTin.formatted,
          name: candidateNormName,
          email: candidateEmail,
          domain: candidateDomain,
        },
        sourceReference: sourceRef,
      };
    } else if (tinMatches.length > 1) {
      // Multiple existing vendors share this TIN (rare edge case)
      conflicts.push({
        field: "taxId",
        label: "Tax Identifier",
        candidateValue: candidateTin.formatted,
        reason: `Multiple existing vendor records (${tinMatches.map((v) => v.name).join(", ")}) share tax ID ${candidateTin.formatted}.`,
      });
      return {
        entityType: "VENDOR",
        candidateId,
        proposedAction: "NEEDS_REVIEW",
        confidence: "MEDIUM",
        confidenceScore: 70,
        matchReasons: [`Tax ID ${candidateTin.formatted} matches multiple existing vendors. Human selection required.`],
        conflicts,
        proposedEnrichments: [],
        extractedEvidence: { ...evidence },
        normalizedEvidence: { taxId: candidateTin.formatted, name: candidateNormName },
        sourceReference: sourceRef,
      };
    }
  }

  // 2. Saved Sender Profile Link
  if (profileLinkedVendorId) {
    const linkedVendor = existingVendors.find((v) => v.id === profileLinkedVendorId);
    if (linkedVendor) {
      // Authoritative check: if candidate provides a TIN and it conflicts with linked vendor TIN -> STRICT CONFLICT
      if (candidateTin && candidateTin.isValid && linkedVendor.taxId) {
        const tinComp = compareTaxIds(evidence.taxId, linkedVendor.taxId);
        if (tinComp.conflict) {
          conflicts.push({
            field: "taxId",
            label: "Tax Identifier",
            existingValue: linkedVendor.taxId,
            candidateValue: candidateTin.formatted,
            reason: `Extracted tax ID (${candidateTin.formatted}) conflicts with linked vendor's tax ID (${linkedVendor.taxId}).`,
          });
          return {
            entityType: "VENDOR",
            candidateId,
            proposedAction: "NEEDS_REVIEW",
            confidence: "MEDIUM",
            confidenceScore: 60,
            matchedEntityId: linkedVendor.id,
            matchedEntityName: linkedVendor.name,
            matchReasons: ["Saved sender profile links to this vendor, but extracted tax ID conflicts."],
            conflicts,
            proposedEnrichments: [],
            extractedEvidence: { ...evidence },
            normalizedEvidence: { taxId: candidateTin.formatted, name: candidateNormName },
            sourceReference: sourceRef,
          };
        }
      }

      reasons.push(`Matched saved sender profile linked to vendor: ${linkedVendor.name}.`);

      if (candidateTin && candidateTin.isValid && !linkedVendor.taxId) {
        proposedEnrichments.push({
          field: "taxId",
          label: "Tax Identifier",
          currentValue: undefined,
          proposedValue: candidateTin.formatted,
        });
      }
      if (candidateEmail && !linkedVendor.email) {
        proposedEnrichments.push({
          field: "email",
          label: "Email Address",
          currentValue: undefined,
          proposedValue: candidateEmail,
        });
      }
      if (evidence.address && !linkedVendor.address) {
        proposedEnrichments.push({
          field: "address",
          label: "Business Address",
          currentValue: undefined,
          proposedValue: evidence.address.trim(),
        });
      }

      const proposedAction: EntityResolutionAction = proposedEnrichments.length > 0 ? "ENRICH_EXISTING" : "LINK_EXISTING";
      return {
        entityType: "VENDOR",
        candidateId,
        proposedAction,
        confidence: "HIGH",
        confidenceScore: 92,
        matchedEntityId: linkedVendor.id,
        matchedEntityName: linkedVendor.name,
        matchedEntityDetails: {
          taxId: linkedVendor.taxId,
          email: linkedVendor.email,
        },
        matchReasons: reasons,
        conflicts: [],
        proposedEnrichments,
        extractedEvidence: { ...evidence },
        normalizedEvidence: { name: candidateNormName, email: candidateEmail },
        sourceReference: sourceRef,
      };
    }
  }

  // 3. Exact Known Email Match
  if (candidateEmail) {
    const emailMatches = existingVendors.filter((v) => normalizeEmail(v.email) === candidateEmail);
    if (emailMatches.length === 1) {
      const vendor = emailMatches[0];
      // Check for conflicting TIN
      if (candidateTin && candidateTin.isValid && vendor.taxId) {
        const tinComp = compareTaxIds(evidence.taxId, vendor.taxId);
        if (tinComp.conflict) {
          conflicts.push({
            field: "taxId",
            label: "Tax Identifier",
            existingValue: vendor.taxId,
            candidateValue: candidateTin.formatted,
            reason: `Extracted tax ID (${candidateTin.formatted}) conflicts with vendor's registered tax ID (${vendor.taxId}).`,
          });
          return {
            entityType: "VENDOR",
            candidateId,
            proposedAction: "NEEDS_REVIEW",
            confidence: "MEDIUM",
            confidenceScore: 60,
            matchedEntityId: vendor.id,
            matchedEntityName: vendor.name,
            matchReasons: [`Sender email (${candidateEmail}) matches vendor, but tax ID conflicts.`],
            conflicts,
            proposedEnrichments: [],
            extractedEvidence: { ...evidence },
            normalizedEvidence: { email: candidateEmail, name: candidateNormName },
            sourceReference: sourceRef,
          };
        }
      }

      reasons.push(`Exact email match with vendor: ${vendor.name} (${candidateEmail}).`);
      if (candidateTin && candidateTin.isValid && !vendor.taxId) {
        proposedEnrichments.push({
          field: "taxId",
          label: "Tax Identifier",
          currentValue: undefined,
          proposedValue: candidateTin.formatted,
        });
      }
      if (evidence.address && !vendor.address) {
        proposedEnrichments.push({
          field: "address",
          label: "Business Address",
          currentValue: undefined,
          proposedValue: evidence.address.trim(),
        });
      }

      const proposedAction: EntityResolutionAction = proposedEnrichments.length > 0 ? "ENRICH_EXISTING" : "LINK_EXISTING";
      return {
        entityType: "VENDOR",
        candidateId,
        proposedAction,
        confidence: "HIGH",
        confidenceScore: 88,
        matchedEntityId: vendor.id,
        matchedEntityName: vendor.name,
        matchedEntityDetails: { taxId: vendor.taxId, email: vendor.email },
        matchReasons: reasons,
        conflicts: [],
        proposedEnrichments,
        extractedEvidence: { ...evidence },
        normalizedEvidence: { email: candidateEmail, name: candidateNormName },
        sourceReference: sourceRef,
      };
    }
  }

  // 4. Exact Normalized Legal / Registered Name Match
  if (candidateNormName) {
    const nameMatches = existingVendors.filter((v) => {
      const vNorm = normalizeBusinessName(v.normalizedName || v.name);
      return vNorm === candidateNormName;
    });

    if (nameMatches.length === 1) {
      const vendor = nameMatches[0];
      // Check for conflicting TIN
      if (candidateTin && candidateTin.isValid && vendor.taxId) {
        const tinComp = compareTaxIds(evidence.taxId, vendor.taxId);
        if (tinComp.conflict) {
          conflicts.push({
            field: "taxId",
            label: "Tax Identifier",
            existingValue: vendor.taxId,
            candidateValue: candidateTin.formatted,
            reason: `Vendor name '${vendor.name}' matches, but tax ID (${candidateTin.formatted}) conflicts with existing record (${vendor.taxId}).`,
          });
          return {
            entityType: "VENDOR",
            candidateId,
            proposedAction: "NEEDS_REVIEW",
            confidence: "MEDIUM",
            confidenceScore: 60,
            matchedEntityId: vendor.id,
            matchedEntityName: vendor.name,
            matchReasons: ["Same vendor name, but tax identifiers conflict. Distinct business entities may exist."],
            conflicts,
            proposedEnrichments: [],
            extractedEvidence: { ...evidence },
            normalizedEvidence: { name: candidateNormName, taxId: candidateTin?.formatted || "" },
            sourceReference: sourceRef,
          };
        }
      }

      reasons.push(`Exact registered name match: ${vendor.name}.`);
      if (candidateTin && candidateTin.isValid && !vendor.taxId) {
        proposedEnrichments.push({
          field: "taxId",
          label: "Tax Identifier",
          currentValue: undefined,
          proposedValue: candidateTin.formatted,
        });
      }
      if (candidateEmail && !vendor.email) {
        proposedEnrichments.push({
          field: "email",
          label: "Email Address",
          currentValue: undefined,
          proposedValue: candidateEmail,
        });
      }
      if (evidence.address && !vendor.address) {
        proposedEnrichments.push({
          field: "address",
          label: "Business Address",
          currentValue: undefined,
          proposedValue: evidence.address.trim(),
        });
      }

      const proposedAction: EntityResolutionAction = proposedEnrichments.length > 0 ? "ENRICH_EXISTING" : "LINK_EXISTING";
      return {
        entityType: "VENDOR",
        candidateId,
        proposedAction,
        confidence: "HIGH",
        confidenceScore: 85,
        matchedEntityId: vendor.id,
        matchedEntityName: vendor.name,
        matchedEntityDetails: { taxId: vendor.taxId, email: vendor.email },
        matchReasons: reasons,
        conflicts: [],
        proposedEnrichments,
        extractedEvidence: { ...evidence },
        normalizedEvidence: { name: candidateNormName },
        sourceReference: sourceRef,
      };
    }
  }

  // 5. Verified Sender Domain Match (Supporting Evidence)
  if (candidateDomain && !DISALLOWED_DOMAIN_RULES.has(candidateDomain)) {
    const domainMatches = existingVendors.filter((v) => {
      const vEmailDomain = v.email ? normalizeDomain(v.email.slice(v.email.indexOf("@") + 1)) : "";
      return vEmailDomain === candidateDomain;
    });

    if (domainMatches.length === 1) {
      const vendor = domainMatches[0];
      const sim = businessNameSimilarity(evidence.name, vendor.name);
      if (sim >= 0.5) {
        reasons.push(`Sender domain (@${candidateDomain}) and name similarity (${Math.round(sim * 100)}%) match vendor: ${vendor.name}.`);
        return {
          entityType: "VENDOR",
          candidateId,
          proposedAction: "LINK_EXISTING",
          confidence: "MEDIUM",
          confidenceScore: 78,
          matchedEntityId: vendor.id,
          matchedEntityName: vendor.name,
          matchedEntityDetails: { taxId: vendor.taxId, email: vendor.email },
          matchReasons: reasons,
          conflicts: [],
          proposedEnrichments: [],
          extractedEvidence: { ...evidence },
          normalizedEvidence: { domain: candidateDomain, name: candidateNormName },
          sourceReference: sourceRef,
        };
      }
    }
  }

  // 6. Fuzzy Name Match (Advisory Only - Never Silent Strong Link)
  if (candidateNormName) {
    let bestMatch: Vendor | null = null;
    let highestSim = 0;

    for (const vendor of existingVendors) {
      const sim = businessNameSimilarity(candidateNormName, vendor.normalizedName || vendor.name);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatch = vendor;
      }
    }

    if (bestMatch && highestSim >= 0.5) {
      return {
        entityType: "VENDOR",
        candidateId,
        proposedAction: "POSSIBLE_DUPLICATE",
        confidence: "MEDIUM",
        confidenceScore: 65,
        matchedEntityId: bestMatch.id,
        matchedEntityName: bestMatch.name,
        matchedEntityDetails: { taxId: bestMatch.taxId, email: bestMatch.email },
        matchReasons: [
          `Candidate name '${evidence.name}' is textually similar (${Math.round(highestSim * 100)}%) to existing vendor '${bestMatch.name}', but lacks tax ID or exact email match. Human review required.`,
        ],
        conflicts: [],
        proposedEnrichments: [],
        extractedEvidence: { ...evidence },
        normalizedEvidence: { name: candidateNormName },
        sourceReference: sourceRef,
      };
    }
  }

  // 7. No Match -> Proposed CREATE_NEW
  const proposedVendorName = (evidence.registeredName || evidence.companyName || evidence.name || "New Vendor").trim();
  return {
    entityType: "VENDOR",
    candidateId,
    proposedAction: "CREATE_NEW",
    confidence: "HIGH",
    confidenceScore: 80,
    matchedEntityName: proposedVendorName,
    matchReasons: ["No matching vendor record found by tax ID, email, domain, or registered name. Proposed as a new vendor creation."],
    conflicts: [],
    proposedEnrichments: [],
    extractedEvidence: { ...evidence },
    normalizedEvidence: {
      name: candidateNormName,
      taxId: candidateTin?.formatted || "",
      email: candidateEmail,
      domain: candidateDomain,
    },
    sourceReference: sourceRef,
  };
}

/**
 * Resolves a batch of Vendor candidates against existing company Vendors and
 * groups compatible candidates in the same batch deterministically and order-independently.
 */
export function resolveBatchVendors(
  candidates: Array<{
    candidateId: string;
    evidence: VendorIdentityEvidence;
    sourceRef?: { messageId?: string; subject?: string; sender?: string; fileName?: string; attachmentId?: string };
  }>,
  existingVendors: Vendor[],
  matchingProfiles?: EmailIntakeProfile[]
): {
  resolutions: Record<string, EntityResolutionResult>;
  groups: Record<string, string[]>;
} {
  const resolutions: Record<string, EntityResolutionResult> = {};
  const groups: Record<string, string[]> = {};

  if (!candidates.length) return { resolutions, groups };

  // Step 1: Run individual deterministic resolution
  for (const candidate of candidates) {
    resolutions[candidate.candidateId] = resolveVendorCandidate(candidate, existingVendors, matchingProfiles);
  }

  // Step 2: Build an equivalence relation / adjacency graph across same-batch candidates
  // Order-independent: Candidate A and B are connected if they share strong identity evidence
  const n = candidates.length;
  const adj = new Map<string, Set<string>>();
  for (const c of candidates) adj.set(c.candidateId, new Set([c.candidateId]));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const cA = candidates[i];
      const cB = candidates[j];
      const resA = resolutions[cA.candidateId];
      const resB = resolutions[cB.candidateId];

      const tinA = normalizeTaxId(cA.evidence.taxId);
      const tinB = normalizeTaxId(cB.evidence.taxId);

      let shouldGroup = false;

      // Condition A: Both have valid matching base TIN
      if (tinA && tinB && tinA.isValid && tinB.isValid && tinA.baseTin === tinB.baseTin) {
        shouldGroup = true;
      }
      // Condition B: Both matched the same existing Vendor ID
      else if (resA.matchedEntityId && resB.matchedEntityId && resA.matchedEntityId === resB.matchedEntityId) {
        shouldGroup = true;
      }
      // Condition C: Both share exact non-generic sender email or domain AND share normalized legal name
      else {
        const emailA = normalizeEmail(cA.evidence.email || cA.evidence.senderEmail);
        const emailB = normalizeEmail(cB.evidence.email || cB.evidence.senderEmail);
        const domainA = normalizeDomain(cA.evidence.senderDomain);
        const domainB = normalizeDomain(cB.evidence.senderDomain);
        const nameA = normalizeBusinessName(cA.evidence.registeredName || cA.evidence.companyName || cA.evidence.name);
        const nameB = normalizeBusinessName(cB.evidence.registeredName || cB.evidence.companyName || cB.evidence.name);

        const sameEmail = emailA && emailB && emailA === emailB;
        const sameDomain = domainA && domainB && domainA === domainB && !DISALLOWED_DOMAIN_RULES.has(domainA);
        const sameName = nameA && nameB && (nameA === nameB || businessNameSimilarity(nameA, nameB) >= 0.85);

        if ((sameEmail || sameDomain) && sameName) {
          // Check if TINs conflict
          if (tinA && tinB && tinA.isValid && tinB.isValid && tinA.baseTin !== tinB.baseTin) {
            // Conflicting TINs must NOT be grouped and both require explicit review!
            shouldGroup = false;
            resA.proposedAction = "NEEDS_REVIEW";
            resB.proposedAction = "NEEDS_REVIEW";
            resA.conflicts.push({
              field: "taxId",
              label: "Tax Identifier",
              candidateValue: tinA.formatted,
              reason: `Another candidate in this intake batch with the same name (${cA.evidence.name}) has a conflicting tax ID (${tinB.formatted}).`,
            });
            resB.conflicts.push({
              field: "taxId",
              label: "Tax Identifier",
              candidateValue: tinB.formatted,
              reason: `Another candidate in this intake batch with the same name (${cB.evidence.name}) has a conflicting tax ID (${tinA.formatted}).`,
            });
          } else {
            shouldGroup = true;
          }
        }
      }

      if (shouldGroup) {
        adj.get(cA.candidateId)!.add(cB.candidateId);
        adj.get(cB.candidateId)!.add(cA.candidateId);
      }
    }
  }

  // Step 3: Extract connected components deterministically
  const visited = new Set<string>();
  // Sort candidate IDs lexicographically so group computation is strictly order-independent
  const sortedCandidateIds = candidates.map((c) => c.candidateId).sort();

  for (const seedId of sortedCandidateIds) {
    if (visited.has(seedId)) continue;
    const componentIds: string[] = [];
    const queue = [seedId];
    visited.add(seedId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      componentIds.push(curr);
      const neighbors = Array.from(adj.get(curr) || []).sort();
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    componentIds.sort();
    const groupId = `vendor-group-${componentIds[0]}`;
    groups[groupId] = componentIds;

    // Step 4: Validate group consistency and accumulate evidence
    // Check if any members have conflicting TINs
    const groupCandidates = candidates.filter((c) => componentIds.includes(c.candidateId));
    let groupTinConflict = false;
    let conflictingTinA = "";
    let conflictingTinB = "";

    for (let i = 0; i < groupCandidates.length; i++) {
      for (let j = i + 1; j < groupCandidates.length; j++) {
        const tA = normalizeTaxId(groupCandidates[i].evidence.taxId);
        const tB = normalizeTaxId(groupCandidates[j].evidence.taxId);
        if (tA && tB && tA.isValid && tB.isValid && tA.baseTin !== tB.baseTin) {
          groupTinConflict = true;
          conflictingTinA = tA.formatted;
          conflictingTinB = tB.formatted;
          break;
        }
      }
      if (groupTinConflict) break;
    }

    // Accumulate non-conflicting metadata across group
    const accumulatedEmails = Array.from(new Set(groupCandidates.map((c) => normalizeEmail(c.evidence.email || c.evidence.senderEmail)).filter(Boolean)));
    const accumulatedPhones = Array.from(new Set(groupCandidates.map((c) => c.evidence.phone?.trim()).filter(Boolean)));
    const accumulatedAddresses = Array.from(new Set(groupCandidates.map((c) => c.evidence.address?.trim()).filter(Boolean)));
    const primaryName = groupCandidates.find((c) => c.evidence.registeredName || c.evidence.companyName)?.evidence.name || groupCandidates[0].evidence.name;

    for (const memberId of componentIds) {
      const res = resolutions[memberId];
      res.batchGroupId = groupId;
      res.groupMemberCount = componentIds.length;
      res.isGroupPrimary = memberId === componentIds[0];

      if (groupTinConflict) {
        res.proposedAction = "NEEDS_REVIEW";
        res.conflicts.push({
          field: "taxId",
          label: "Tax Identifier",
          reason: `Same-batch candidates have conflicting tax identifiers (${conflictingTinA} vs ${conflictingTinB}).`,
        });
        res.matchReasons.push("Same-batch candidates share sender/domain but disagree on authoritative tax IDs. Review required.");
      } else if (componentIds.length > 1) {
        res.matchReasons.push(`Grouped with ${componentIds.length - 1} other candidate(s) in this intake batch with compatible identity evidence.`);
        if (res.proposedAction === "CREATE_NEW") {
          res.matchedEntityName = primaryName;
          res.extractedEvidence = {
            ...res.extractedEvidence,
            accumulatedEmails,
            accumulatedPhones,
            accumulatedAddresses,
          };
        }
      }
    }
  }

  return { resolutions, groups };
}

/**
 * Resolves an individual FinancialAccount candidate against existing company FinancialAccounts.
 */
export function resolveFinancialAccountCandidate(
  candidate: {
    candidateId: string;
    evidence: FinancialAccountIdentityEvidence;
    sourceRef?: { messageId?: string; subject?: string; sender?: string; fileName?: string; attachmentId?: string };
  },
  existingAccounts: FinancialAccount[],
  matchingProfiles?: EmailIntakeProfile[]
): EntityResolutionResult {
  const { candidateId, evidence, sourceRef } = candidate;
  const inst = normalizeInstitution(evidence.institutionName || evidence.institutionCode);
  const suffix = extractAccountSuffix(evidence.maskedIdentifier || evidence.accountNumber);
  const currency = String(evidence.currency || "PHP").trim().toUpperCase();

  const reasons: string[] = [];
  const conflicts: EntityResolutionConflict[] = [];

  const matchedProfile = matchingProfiles?.find((p) => p.linkedFinancialAccountId);
  const profileLinkedAccountId = evidence.linkedProfileAccountId || matchedProfile?.linkedFinancialAccountId;

  // 1. Saved Sender Profile Link
  if (profileLinkedAccountId) {
    const linkedAccount = existingAccounts.find((a) => a.id === profileLinkedAccountId);
    if (linkedAccount) {
      // Check currency conflict
      if (currency && linkedAccount.currency && currency !== linkedAccount.currency) {
        conflicts.push({
          field: "currency",
          label: "Account Currency",
          existingValue: linkedAccount.currency,
          candidateValue: currency,
          reason: `Statement currency (${currency}) conflicts with saved profile account currency (${linkedAccount.currency}).`,
        });
        return {
          entityType: "FINANCIAL_ACCOUNT",
          candidateId,
          proposedAction: "NEEDS_REVIEW",
          confidence: "MEDIUM",
          confidenceScore: 60,
          matchedEntityId: linkedAccount.id,
          matchedEntityName: linkedAccount.displayName,
          matchReasons: ["Saved sender profile links to this account, but statement currency conflicts."],
          conflicts,
          proposedEnrichments: [],
          extractedEvidence: { ...evidence },
          normalizedEvidence: { institution: inst.code, suffix, currency },
          sourceReference: sourceRef,
        };
      }

      reasons.push(`Matched saved sender profile linked to account: ${linkedAccount.displayName}.`);
      return {
        entityType: "FINANCIAL_ACCOUNT",
        candidateId,
        proposedAction: "LINK_EXISTING",
        confidence: "HIGH",
        confidenceScore: 95,
        matchedEntityId: linkedAccount.id,
        matchedEntityName: linkedAccount.displayName,
        matchedEntityDetails: {
          institution: linkedAccount.institutionName,
          maskedIdentifier: linkedAccount.maskedIdentifier,
          currency: linkedAccount.currency,
        },
        matchReasons: reasons,
        conflicts: [],
        proposedEnrichments: [],
        extractedEvidence: { ...evidence },
        normalizedEvidence: { institution: inst.code, suffix, currency },
        sourceReference: sourceRef,
      };
    }
  }

  // 2. Exact Institution + Suffix + Currency
  if (inst.code !== "UNKNOWN" && suffix) {
    const matchingAccounts = existingAccounts.filter((a) => {
      const aInst = normalizeInstitution(a.institutionName || a.institutionCode);
      const aSuffix = extractAccountSuffix(a.maskedIdentifier);
      const aCurrency = String(a.currency || "PHP").trim().toUpperCase();

      const sameInst = aInst.code === inst.code;
      const sameSuffix = aSuffix === suffix;
      const sameCurrency = !currency || !aCurrency || aCurrency === currency;

      return sameInst && sameSuffix && sameCurrency;
    });

    if (matchingAccounts.length === 1) {
      const account = matchingAccounts[0];
      reasons.push(`Exact institution (${inst.displayName}), suffix (•••• ${suffix}), and currency (${currency}) match account: ${account.displayName}.`);
      return {
        entityType: "FINANCIAL_ACCOUNT",
        candidateId,
        proposedAction: "LINK_EXISTING",
        confidence: "HIGH",
        confidenceScore: 96,
        matchedEntityId: account.id,
        matchedEntityName: account.displayName,
        matchedEntityDetails: {
          institution: account.institutionName,
          maskedIdentifier: account.maskedIdentifier,
          currency: account.currency,
        },
        matchReasons: reasons,
        conflicts: [],
        proposedEnrichments: [],
        extractedEvidence: { ...evidence },
        normalizedEvidence: { institution: inst.code, suffix, currency },
        sourceReference: sourceRef,
      };
    } else if (matchingAccounts.length > 1) {
      return {
        entityType: "FINANCIAL_ACCOUNT",
        candidateId,
        proposedAction: "NEEDS_REVIEW",
        confidence: "MEDIUM",
        confidenceScore: 70,
        matchReasons: [`Multiple existing ${inst.displayName} accounts end in ${suffix} (${currency}). Explicit account selection required.`],
        conflicts: [],
        proposedEnrichments: [],
        extractedEvidence: { ...evidence },
        normalizedEvidence: { institution: inst.code, suffix, currency },
        sourceReference: sourceRef,
      };
    }
  }

  // 3. Institution + Currency (without suffix)
  if (inst.code !== "UNKNOWN" && !suffix) {
    const sameInstAndCur = existingAccounts.filter((a) => {
      const aInst = normalizeInstitution(a.institutionName || a.institutionCode);
      const aCurrency = String(a.currency || "PHP").trim().toUpperCase();
      return aInst.code === inst.code && (!currency || aCurrency === currency);
    });

    if (sameInstAndCur.length === 1) {
      const account = sameInstAndCur[0];
      return {
        entityType: "FINANCIAL_ACCOUNT",
        candidateId,
        proposedAction: "NEEDS_REVIEW",
        confidence: "MEDIUM",
        confidenceScore: 75,
        matchedEntityId: account.id,
        matchedEntityName: account.displayName,
        matchedEntityDetails: { institution: account.institutionName, maskedIdentifier: account.maskedIdentifier, currency: account.currency },
        matchReasons: [`Only one active ${inst.displayName} (${currency}) account exists (${account.displayName}). Confirm if this statement belongs to it.`],
        conflicts: [],
        proposedEnrichments: [],
        extractedEvidence: { ...evidence },
        normalizedEvidence: { institution: inst.code, currency },
        sourceReference: sourceRef,
      };
    } else if (sameInstAndCur.length > 1) {
      return {
        entityType: "FINANCIAL_ACCOUNT",
        candidateId,
        proposedAction: "NEEDS_REVIEW",
        confidence: "LOW",
        confidenceScore: 50,
        matchReasons: [`Multiple ${inst.displayName} accounts exist. Explicit account selection required.`],
        conflicts: [],
        proposedEnrichments: [],
        extractedEvidence: { ...evidence },
        normalizedEvidence: { institution: inst.code, currency },
        sourceReference: sourceRef,
      };
    }
  }

  // 4. No Match -> Proposed CREATE_NEW
  const proposedDisplayName = `${inst.displayName}${suffix ? ` •••• ${suffix}` : ""}`;
  return {
    entityType: "FINANCIAL_ACCOUNT",
    candidateId,
    proposedAction: "CREATE_NEW",
    confidence: "HIGH",
    confidenceScore: 80,
    matchedEntityName: proposedDisplayName,
    matchReasons: [
      `No existing ${inst.displayName} account ending in ${suffix || "unknown"} (${currency}) found. Proposed as a new financial account.`,
    ],
    conflicts: [],
    proposedEnrichments: [],
    extractedEvidence: { ...evidence },
    normalizedEvidence: { institution: inst.code, suffix, currency },
    sourceReference: sourceRef,
  };
}

/**
 * Resolves a batch of FinancialAccount candidates against existing accounts
 * and groups compatible candidates in the same batch deterministically.
 */
export function resolveBatchFinancialAccounts(
  candidates: Array<{
    candidateId: string;
    evidence: FinancialAccountIdentityEvidence;
    sourceRef?: { messageId?: string; subject?: string; sender?: string; fileName?: string; attachmentId?: string };
  }>,
  existingAccounts: FinancialAccount[],
  matchingProfiles?: EmailIntakeProfile[]
): {
  resolutions: Record<string, EntityResolutionResult>;
  groups: Record<string, string[]>;
} {
  const resolutions: Record<string, EntityResolutionResult> = {};
  const groups: Record<string, string[]> = {};

  if (!candidates.length) return { resolutions, groups };

  // Step 1: Individual resolution
  for (const candidate of candidates) {
    resolutions[candidate.candidateId] = resolveFinancialAccountCandidate(candidate, existingAccounts, matchingProfiles);
  }

  // Step 2: Build adjacency graph across same-batch statement candidates
  const n = candidates.length;
  const adj = new Map<string, Set<string>>();
  for (const c of candidates) adj.set(c.candidateId, new Set([c.candidateId]));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const cA = candidates[i];
      const cB = candidates[j];
      const resA = resolutions[cA.candidateId];
      const resB = resolutions[cB.candidateId];

      const instA = normalizeInstitution(cA.evidence.institutionName || cA.evidence.institutionCode);
      const instB = normalizeInstitution(cB.evidence.institutionName || cB.evidence.institutionCode);
      const suffixA = extractAccountSuffix(cA.evidence.maskedIdentifier || cA.evidence.accountNumber);
      const suffixB = extractAccountSuffix(cB.evidence.maskedIdentifier || cB.evidence.accountNumber);
      const curA = String(cA.evidence.currency || "PHP").toUpperCase();
      const curB = String(cB.evidence.currency || "PHP").toUpperCase();

      let shouldGroup = false;

      // Both matched same existing account
      if (resA.matchedEntityId && resB.matchedEntityId && resA.matchedEntityId === resB.matchedEntityId) {
        shouldGroup = true;
      }
      // Both represent the same unseen account (same inst + suffix + currency)
      else if (instA.code !== "UNKNOWN" && instA.code === instB.code && suffixA && suffixB && suffixA === suffixB && curA === curB) {
        shouldGroup = true;
      }

      if (shouldGroup) {
        adj.get(cA.candidateId)!.add(cB.candidateId);
        adj.get(cB.candidateId)!.add(cA.candidateId);
      }
    }
  }

  // Step 3: Connected components
  const visited = new Set<string>();
  const sortedCandidateIds = candidates.map((c) => c.candidateId).sort();

  for (const seedId of sortedCandidateIds) {
    if (visited.has(seedId)) continue;
    const componentIds: string[] = [];
    const queue = [seedId];
    visited.add(seedId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      componentIds.push(curr);
      const neighbors = Array.from(adj.get(curr) || []).sort();
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    componentIds.sort();
    const groupId = `account-group-${componentIds[0]}`;
    groups[groupId] = componentIds;

    for (const memberId of componentIds) {
      const res = resolutions[memberId];
      res.batchGroupId = groupId;
      res.groupMemberCount = componentIds.length;
      res.isGroupPrimary = memberId === componentIds[0];

      if (componentIds.length > 1) {
        res.matchReasons.push(`Grouped with ${componentIds.length - 1} other statement(s) in this batch for the same account.`);
      }
    }
  }

  return { resolutions, groups };
}
