import type {
  EmailIntakeProfile,
  EmailSourceMetadata,
  EntityResolutionAction,
  EntityResolutionConflict,
  EntityResolutionEnrichmentField,
  EntityResolutionResult,
  Expense,
  FinancialAccountIdentityEvidence,
  InvoiceData,
  Vendor,
  VendorIdentityEvidence,
} from "../types.ts";
import type { FinancialAccount } from "./cashBanking.ts";
import { DISALLOWED_DOMAIN_RULES, normalizeDomain, normalizeEmail, parseSenderAddress } from "./emailIntake.ts";

export interface NormalizedTaxId {
  raw: string;
  normalized: string;
  baseTin: string;
  branchCode?: string;
  formatted: string;
  isValid: boolean;
}

const LEGAL_FORM_TOKENS = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "opc",
]);

function formatTin(baseTin: string, branchCode?: string) {
  const base = `${baseTin.slice(0, 3)}-${baseTin.slice(3, 6)}-${baseTin.slice(6, 9)}`;
  return branchCode ? `${base}-${branchCode}` : base;
}

/**
 * Philippine TIN normalization used for identity matching.
 * Only the documented 9-digit base or 12-digit base+branch forms are treated
 * as authoritative. Malformed lengths are ignored instead of being truncated.
 */
export function normalizeTaxId(value?: string | null): NormalizedTaxId | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 9 && digits.length !== 12) return null;
  const baseTin = digits.slice(0, 9);
  const branchCode = digits.length === 12 ? digits.slice(9, 12) : undefined;
  return {
    raw,
    normalized: digits,
    baseTin,
    branchCode,
    formatted: formatTin(baseTin, branchCode),
    isValid: true,
  };
}

export function compareTaxIds(tinA?: string | null, tinB?: string | null): {
  match: boolean;
  conflict: boolean;
  baseMatch: boolean;
  branchMatch: boolean;
  reason?: string;
} {
  const a = normalizeTaxId(tinA);
  const b = normalizeTaxId(tinB);
  if (!a || !b) return { match: false, conflict: false, baseMatch: false, branchMatch: false };
  if (a.baseTin !== b.baseTin) {
    return {
      match: false,
      conflict: true,
      baseMatch: false,
      branchMatch: false,
      reason: `Tax IDs conflict: ${a.formatted} vs ${b.formatted}.`,
    };
  }
  const branchA = a.branchCode || "000";
  const branchB = b.branchCode || "000";
  const branchMatch = branchA === branchB;
  return {
    match: true,
    conflict: false,
    baseMatch: true,
    branchMatch,
    reason: branchMatch
      ? `Exact tax ID match (${a.formatted}).`
      : `Base tax ID matches (${a.baseTin}), with branch difference (${branchA} vs ${branchB}).`,
  };
}

/**
 * Normalize legal/business names without removing descriptive words such as
 * "Trading", "Services", "Holdings", or "Enterprise". Removing those terms
 * can collapse distinct businesses into the same normalized identity.
 */
export function normalizeBusinessName(name?: string | null): string {
  if (!name) return "";
  const words = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_FORM_TOKENS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

export function businessNameSimilarity(nameA?: string | null, nameB?: string | null): number {
  const a = normalizeBusinessName(nameA);
  const b = normalizeBusinessName(nameB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  let intersection = 0;
  for (const word of wordsA) if (wordsB.has(word)) intersection += 1;
  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = union ? intersection / union : 0;
  const smaller = Math.min(wordsA.size, wordsB.size);
  const containment = smaller ? intersection / smaller : 0;
  if (a.includes(b) || b.includes(a)) return Math.max(jaccard, 0.85);
  return Math.max(jaccard, containment * 0.85);
}

export function normalizeInstitution(name?: string | null): { code: string; displayName: string } {
  const raw = String(name || "").trim();
  const upper = raw.toUpperCase();
  if (!upper) return { code: "UNKNOWN", displayName: "Unknown Institution" };
  if (/\b(BDO|BANCO DE ORO|BDO UNIBANK)\b/i.test(upper)) return { code: "BDO", displayName: "BDO Unibank" };
  if (/\b(BPI|BANK OF THE PHILIPPINE ISLANDS|BPI FAMILY)\b/i.test(upper)) return { code: "BPI", displayName: "Bank of the Philippine Islands" };
  if (/\b(METROBANK|MBTC|METROPOLITAN BANK)\b/i.test(upper)) return { code: "METROBANK", displayName: "Metrobank" };
  if (/\b(GCASH|MYNT|G-XCHANGE)\b/i.test(upper)) return { code: "GCASH", displayName: "GCash" };
  if (/\b(MAYA|PAYMAYA)\b/i.test(upper)) return { code: "MAYA", displayName: "Maya" };
  if (/\b(UNIONBANK|UBP|UNION BANK)\b/i.test(upper)) return { code: "UNIONBANK", displayName: "UnionBank of the Philippines" };
  if (/\b(SECURITY BANK|SBC)\b/i.test(upper)) return { code: "SECURITY_BANK", displayName: "Security Bank" };
  if (/\b(CHINABANK|CHINA BANK|CBC)\b/i.test(upper)) return { code: "CHINABANK", displayName: "China Bank" };
  if (/\b(RCBC|RIZAL COMMERCIAL)\b/i.test(upper)) return { code: "RCBC", displayName: "RCBC" };
  if (/\b(PNB|PHILIPPINE NATIONAL BANK)\b/i.test(upper)) return { code: "PNB", displayName: "PNB" };
  if (/\b(LANDBANK|LAND BANK)\b/i.test(upper)) return { code: "LANDBANK", displayName: "Landbank" };
  if (/\b(EASTWEST|EAST WEST)\b/i.test(upper)) return { code: "EASTWEST", displayName: "EastWest Bank" };
  const code = upper.replace(/[^A-Z0-9]/g, "").slice(0, 24);
  return { code: code || "OTHER", displayName: raw };
}

export function extractAccountSuffix(value?: string | null): string {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  return digits.length <= 4 ? digits : digits.slice(-4);
}

function candidateVendorProfileLink(evidence: VendorIdentityEvidence, profiles?: EmailIntakeProfile[]) {
  if (evidence.linkedProfileVendorId) return evidence.linkedProfileVendorId;
  if (!evidence.matchedProfileId) return undefined;
  const profile = (profiles || []).find((item) => item.id === evidence.matchedProfileId && item.enabled !== false);
  return profile?.linkedVendorId;
}

function candidateAccountProfileLink(evidence: FinancialAccountIdentityEvidence, profiles?: EmailIntakeProfile[]) {
  if (evidence.linkedProfileAccountId) return evidence.linkedProfileAccountId;
  if (!evidence.matchedProfileId) return undefined;
  const profile = (profiles || []).find((item) => item.id === evidence.matchedProfileId && item.enabled !== false);
  return profile?.linkedFinancialAccountId;
}

function vendorName(evidence: VendorIdentityEvidence) {
  return evidence.registeredName || evidence.companyName || evidence.name || "";
}

function resultBase(
  entityType: "VENDOR" | "FINANCIAL_ACCOUNT",
  candidateId: string,
  action: EntityResolutionAction,
  score: number,
  reasons: string[],
  conflicts: EntityResolutionConflict[],
  enrichments: EntityResolutionEnrichmentField[],
  evidence: object,
  normalizedEvidence: Record<string, string>,
  sourceRef?: EntityResolutionResult["sourceReference"],
): EntityResolutionResult {
  return {
    entityType,
    candidateId,
    proposedAction: action,
    confidence: score >= 85 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW",
    confidenceScore: score,
    matchReasons: reasons,
    conflicts,
    proposedEnrichments: enrichments,
    extractedEvidence: { ...evidence } as Record<string, any>,
    normalizedEvidence,
    sourceReference: sourceRef,
  };
}

function vendorDetails(vendor: Vendor) {
  return { taxId: vendor.taxId, email: vendor.email, phone: vendor.phone, address: vendor.address };
}

function addVendorEnrichments(
  vendor: Vendor,
  evidence: VendorIdentityEvidence,
  candidateTin: NormalizedTaxId | null,
): EntityResolutionEnrichmentField[] {
  const enrichments: EntityResolutionEnrichmentField[] = [];
  const email = normalizeEmail(evidence.email || evidence.senderEmail);
  if (candidateTin && !vendor.taxId) {
    enrichments.push({ field: "taxId", label: "Tax Identifier", currentValue: undefined, proposedValue: candidateTin.formatted });
  }
  if (email && !vendor.email) enrichments.push({ field: "email", label: "Email Address", currentValue: undefined, proposedValue: email });
  if (evidence.phone?.trim() && !vendor.phone) enrichments.push({ field: "phone", label: "Phone Number", currentValue: undefined, proposedValue: evidence.phone.trim() });
  if (evidence.address?.trim() && !vendor.address) enrichments.push({ field: "address", label: "Business Address", currentValue: undefined, proposedValue: evidence.address.trim() });
  return enrichments;
}

function vendorConflictResult(
  candidateId: string,
  vendor: Vendor,
  evidence: VendorIdentityEvidence,
  conflict: EntityResolutionConflict,
  reason: string,
  normalizedEvidence: Record<string, string>,
  sourceRef?: EntityResolutionResult["sourceReference"],
) {
  const result = resultBase("VENDOR", candidateId, "NEEDS_REVIEW", 60, [reason], [conflict], [], evidence, normalizedEvidence, sourceRef);
  result.matchedEntityId = vendor.id;
  result.matchedEntityName = vendor.name;
  result.matchedEntityDetails = vendorDetails(vendor);
  return result;
}

export function resolveVendorCandidate(
  candidate: {
    candidateId: string;
    evidence: VendorIdentityEvidence;
    sourceRef?: EntityResolutionResult["sourceReference"];
  },
  existingVendors: Vendor[],
  matchingProfiles?: EmailIntakeProfile[],
): EntityResolutionResult {
  const { candidateId, evidence, sourceRef } = candidate;
  const name = vendorName(evidence);
  const normalizedName = normalizeBusinessName(name);
  const candidateTin = normalizeTaxId(evidence.taxId);
  const email = normalizeEmail(evidence.email || evidence.senderEmail);
  const domain = normalizeDomain(evidence.senderDomain || (email.includes("@") ? email.split("@").pop() : ""));
  const normalizedEvidence: Record<string, string> = {
    name: normalizedName,
    email,
    domain,
    ...(candidateTin ? { taxId: candidateTin.formatted } : {}),
  };

  if (candidateTin) {
    const tinMatches = existingVendors.filter((vendor) => normalizeTaxId(vendor.taxId)?.baseTin === candidateTin.baseTin);
    if (tinMatches.length === 1) {
      const vendor = tinMatches[0];
      const comparison = compareTaxIds(evidence.taxId, vendor.taxId);
      const profileLink = candidateVendorProfileLink(evidence, matchingProfiles);
      if (profileLink && profileLink !== vendor.id) {
        const linked = existingVendors.find((item) => item.id === profileLink);
        const conflict: EntityResolutionConflict = {
          field: "taxId",
          label: "Tax Identifier",
          existingValue: linked?.taxId || undefined,
          candidateValue: candidateTin.formatted,
          reason: `Extracted tax ID matches '${vendor.name}', while the matched sender rule points to '${linked?.name || profileLink}'.`,
        };
        return vendorConflictResult(candidateId, vendor, evidence, conflict, conflict.reason, normalizedEvidence, sourceRef);
      }
      const enrichments = addVendorEnrichments(vendor, evidence, candidateTin);
      const action: EntityResolutionAction = enrichments.length ? "ENRICH_EXISTING" : "LINK_EXISTING";
      const result = resultBase("VENDOR", candidateId, action, 98, [comparison.reason || `Exact tax ID match (${candidateTin.formatted}).`], [], enrichments, evidence, normalizedEvidence, sourceRef);
      result.matchedEntityId = vendor.id;
      result.matchedEntityName = vendor.name;
      result.matchedEntityDetails = vendorDetails(vendor);
      return result;
    }
    if (tinMatches.length > 1) {
      return resultBase(
        "VENDOR",
        candidateId,
        "NEEDS_REVIEW",
        70,
        [`Tax ID ${candidateTin.formatted} matches multiple existing Vendors. Explicit selection is required.`],
        [{ field: "taxId", label: "Tax Identifier", candidateValue: candidateTin.formatted, reason: `Multiple Vendor records share tax ID ${candidateTin.formatted}.` }],
        [],
        evidence,
        normalizedEvidence,
        sourceRef,
      );
    }
  }

  const linkedVendorId = candidateVendorProfileLink(evidence, matchingProfiles);
  if (linkedVendorId) {
    const vendor = existingVendors.find((item) => item.id === linkedVendorId);
    if (vendor) {
      if (candidateTin && vendor.taxId) {
        const comparison = compareTaxIds(evidence.taxId, vendor.taxId);
        if (comparison.conflict) {
          const conflict: EntityResolutionConflict = {
            field: "taxId",
            label: "Tax Identifier",
            existingValue: vendor.taxId || undefined,
            candidateValue: candidateTin.formatted,
            reason: `Extracted tax ID (${candidateTin.formatted}) conflicts with linked Vendor tax ID (${vendor.taxId}).`,
          };
          return vendorConflictResult(candidateId, vendor, evidence, conflict, "Saved sender profile matches, but authoritative tax identity conflicts.", normalizedEvidence, sourceRef);
        }
      }
      const enrichments = addVendorEnrichments(vendor, evidence, candidateTin);
      const action: EntityResolutionAction = enrichments.length ? "ENRICH_EXISTING" : "LINK_EXISTING";
      const result = resultBase("VENDOR", candidateId, action, 92, [`Matched saved sender profile linked to vendor: ${vendor.name}.`], [], enrichments, evidence, normalizedEvidence, sourceRef);
      result.matchedEntityId = vendor.id;
      result.matchedEntityName = vendor.name;
      result.matchedEntityDetails = vendorDetails(vendor);
      return result;
    }
  }

  if (email) {
    const matches = existingVendors.filter((vendor) => normalizeEmail(vendor.email) === email);
    if (matches.length === 1) {
      const vendor = matches[0];
      if (candidateTin && vendor.taxId && compareTaxIds(evidence.taxId, vendor.taxId).conflict) {
        const conflict: EntityResolutionConflict = {
          field: "taxId",
          label: "Tax Identifier",
          existingValue: vendor.taxId || undefined,
          candidateValue: candidateTin.formatted,
          reason: `Email matches '${vendor.name}', but the extracted tax ID conflicts with its registered tax ID.`,
        };
        return vendorConflictResult(candidateId, vendor, evidence, conflict, "Exact email matches, but authoritative tax identity conflicts.", normalizedEvidence, sourceRef);
      }
      const enrichments = addVendorEnrichments(vendor, evidence, candidateTin);
      const action: EntityResolutionAction = enrichments.length ? "ENRICH_EXISTING" : "LINK_EXISTING";
      const result = resultBase("VENDOR", candidateId, action, 88, [`Exact email match with vendor: ${vendor.name} (${email}).`], [], enrichments, evidence, normalizedEvidence, sourceRef);
      result.matchedEntityId = vendor.id;
      result.matchedEntityName = vendor.name;
      result.matchedEntityDetails = vendorDetails(vendor);
      return result;
    }
    if (matches.length > 1) {
      return resultBase("VENDOR", candidateId, "NEEDS_REVIEW", 65, ["The same email address is attached to multiple Vendor records."], [], [], evidence, normalizedEvidence, sourceRef);
    }
  }

  if (normalizedName) {
    const matches = existingVendors.filter((vendor) => normalizeBusinessName(vendor.normalizedName || vendor.name) === normalizedName);
    if (matches.length === 1) {
      const vendor = matches[0];
      if (candidateTin && vendor.taxId && compareTaxIds(evidence.taxId, vendor.taxId).conflict) {
        const conflict: EntityResolutionConflict = {
          field: "taxId",
          label: "Tax Identifier",
          existingValue: vendor.taxId || undefined,
          candidateValue: candidateTin.formatted,
          reason: `Vendor name '${vendor.name}' matches, but tax IDs conflict.`,
        };
        return vendorConflictResult(candidateId, vendor, evidence, conflict, "Same normalized legal name, but authoritative tax identity conflicts.", normalizedEvidence, sourceRef);
      }
      const enrichments = addVendorEnrichments(vendor, evidence, candidateTin);
      const action: EntityResolutionAction = enrichments.length ? "ENRICH_EXISTING" : "LINK_EXISTING";
      const result = resultBase("VENDOR", candidateId, action, 85, [`Exact normalized registered-name match: ${vendor.name}.`], [], enrichments, evidence, normalizedEvidence, sourceRef);
      result.matchedEntityId = vendor.id;
      result.matchedEntityName = vendor.name;
      result.matchedEntityDetails = vendorDetails(vendor);
      return result;
    }
    if (matches.length > 1) {
      return resultBase("VENDOR", candidateId, "NEEDS_REVIEW", 65, ["The normalized business name matches multiple Vendor records."], [], [], evidence, normalizedEvidence, sourceRef);
    }
  }

  if (domain && !DISALLOWED_DOMAIN_RULES.has(domain)) {
    const matches = existingVendors.filter((vendor) => {
      const vendorEmail = normalizeEmail(vendor.email);
      const vendorDomain = vendorEmail.includes("@") ? normalizeDomain(vendorEmail.split("@").pop()) : "";
      return vendorDomain === domain;
    });
    if (matches.length === 1) {
      const vendor = matches[0];
      const similarity = businessNameSimilarity(name, vendor.name);
      if (similarity >= 0.7) {
        const result = resultBase(
          "VENDOR",
          candidateId,
          "LINK_EXISTING",
          78,
          [`Sender domain (@${domain}) and compatible name (${Math.round(similarity * 100)}%) support vendor: ${vendor.name}.`],
          [],
          [],
          evidence,
          normalizedEvidence,
          sourceRef,
        );
        result.matchedEntityId = vendor.id;
        result.matchedEntityName = vendor.name;
        result.matchedEntityDetails = vendorDetails(vendor);
        return result;
      }
    }
  }

  if (normalizedName) {
    let best: Vendor | undefined;
    let score = 0;
    for (const vendor of existingVendors) {
      const similarity = businessNameSimilarity(name, vendor.normalizedName || vendor.name);
      if (similarity > score) {
        best = vendor;
        score = similarity;
      }
    }
    if (best && score >= 0.5) {
      const result = resultBase(
        "VENDOR",
        candidateId,
        "POSSIBLE_DUPLICATE",
        65,
        [`Candidate name '${name}' is textually similar (${Math.round(score * 100)}%) to existing vendor '${best.name}', but lacks stronger identity evidence. Human review required.`],
        [],
        [],
        evidence,
        normalizedEvidence,
        sourceRef,
      );
      result.matchedEntityId = best.id;
      result.matchedEntityName = best.name;
      result.matchedEntityDetails = vendorDetails(best);
      return result;
    }
  }

  const result = resultBase(
    "VENDOR",
    candidateId,
    "CREATE_NEW",
    80,
    ["No matching Vendor was found by tax ID, matched sender profile, exact email, verified domain, or registered name. Creation remains a proposal until review."],
    [],
    [],
    evidence,
    normalizedEvidence,
    sourceRef,
  );
  result.matchedEntityName = name.trim() || "New Vendor";
  return result;
}

function sameNonGenericDomain(a: VendorIdentityEvidence, b: VendorIdentityEvidence) {
  const emailA = normalizeEmail(a.email || a.senderEmail);
  const emailB = normalizeEmail(b.email || b.senderEmail);
  const domainA = normalizeDomain(a.senderDomain || (emailA.includes("@") ? emailA.split("@").pop() : ""));
  const domainB = normalizeDomain(b.senderDomain || (emailB.includes("@") ? emailB.split("@").pop() : ""));
  return Boolean(domainA && domainB && domainA === domainB && !DISALLOWED_DOMAIN_RULES.has(domainA));
}

function sameExactEmail(a: VendorIdentityEvidence, b: VendorIdentityEvidence) {
  const emailA = normalizeEmail(a.email || a.senderEmail);
  const emailB = normalizeEmail(b.email || b.senderEmail);
  return Boolean(emailA && emailB && emailA === emailB);
}

export function resolveBatchVendors(
  candidates: Array<{ candidateId: string; evidence: VendorIdentityEvidence; sourceRef?: EntityResolutionResult["sourceReference"] }>,
  existingVendors: Vendor[],
  matchingProfiles?: EmailIntakeProfile[],
): { resolutions: Record<string, EntityResolutionResult>; groups: Record<string, string[]> } {
  const resolutions: Record<string, EntityResolutionResult> = {};
  const groups: Record<string, string[]> = {};
  for (const candidate of candidates) resolutions[candidate.candidateId] = resolveVendorCandidate(candidate, existingVendors, matchingProfiles);
  if (!candidates.length) return { resolutions, groups };

  const adjacency = new Map<string, Set<string>>();
  for (const candidate of candidates) adjacency.set(candidate.candidateId, new Set([candidate.candidateId]));

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      const resA = resolutions[a.candidateId];
      const resB = resolutions[b.candidateId];
      const tinA = normalizeTaxId(a.evidence.taxId);
      const tinB = normalizeTaxId(b.evidence.taxId);
      const nameA = vendorName(a.evidence);
      const nameB = vendorName(b.evidence);
      let group = false;

      if (tinA && tinB) {
        if (tinA.baseTin === tinB.baseTin) group = true;
        else if ((sameExactEmail(a.evidence, b.evidence) || sameNonGenericDomain(a.evidence, b.evidence)) && businessNameSimilarity(nameA, nameB) >= 0.85) {
          const conflictA: EntityResolutionConflict = {
            field: "taxId",
            label: "Tax Identifier",
            candidateValue: tinA.formatted,
            reason: `Another candidate with matching sender/name evidence has a conflicting tax ID (${tinB.formatted}).`,
          };
          const conflictB: EntityResolutionConflict = {
            field: "taxId",
            label: "Tax Identifier",
            candidateValue: tinB.formatted,
            reason: `Another candidate with matching sender/name evidence has a conflicting tax ID (${tinA.formatted}).`,
          };
          resA.proposedAction = "NEEDS_REVIEW";
          resB.proposedAction = "NEEDS_REVIEW";
          if (!resA.conflicts.some((item) => item.field === "taxId" && item.reason === conflictA.reason)) resA.conflicts.push(conflictA);
          if (!resB.conflicts.some((item) => item.field === "taxId" && item.reason === conflictB.reason)) resB.conflicts.push(conflictB);
        }
      } else if (resA.matchedEntityId && resB.matchedEntityId && resA.matchedEntityId === resB.matchedEntityId) {
        group = true;
      } else {
        const sameName = Boolean(nameA && nameB && businessNameSimilarity(nameA, nameB) >= 0.85);
        if (sameName && (sameExactEmail(a.evidence, b.evidence) || sameNonGenericDomain(a.evidence, b.evidence))) group = true;
      }

      if (group) {
        adjacency.get(a.candidateId)!.add(b.candidateId);
        adjacency.get(b.candidateId)!.add(a.candidateId);
      }
    }
  }

  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const visited = new Set<string>();
  for (const seed of candidates.map((candidate) => candidate.candidateId).sort()) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    const members: string[] = [];
    visited.add(seed);
    while (queue.length) {
      const current = queue.shift()!;
      members.push(current);
      for (const next of Array.from(adjacency.get(current) || []).sort()) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    members.sort();
    const groupId = `vendor-group-${members[0]}`;
    groups[groupId] = members;
    const groupCandidates = members.map((id) => byId.get(id)!).filter(Boolean);
    const emails = Array.from(new Set(groupCandidates.map((item) => normalizeEmail(item.evidence.email || item.evidence.senderEmail)).filter(Boolean)));
    const phones = Array.from(new Set(groupCandidates.map((item) => item.evidence.phone?.trim()).filter(Boolean)));
    const addresses = Array.from(new Set(groupCandidates.map((item) => item.evidence.address?.trim()).filter(Boolean)));
    const primaryName = groupCandidates.find((item) => item.evidence.registeredName || item.evidence.companyName)?.evidence.registeredName
      || groupCandidates.find((item) => item.evidence.registeredName || item.evidence.companyName)?.evidence.companyName
      || groupCandidates[0]?.evidence.name
      || "New Vendor";

    for (const memberId of members) {
      const resolution = resolutions[memberId];
      resolution.batchGroupId = groupId;
      resolution.groupMemberCount = members.length;
      resolution.isGroupPrimary = memberId === members[0];
      if (members.length > 1) {
        resolution.matchReasons.push(`Grouped with ${members.length - 1} other candidate(s) in this intake batch using compatible identity evidence.`);
        if (resolution.proposedAction === "CREATE_NEW") {
          resolution.matchedEntityName = primaryName;
          resolution.extractedEvidence = {
            ...resolution.extractedEvidence,
            accumulatedEmails: emails,
            accumulatedPhones: phones,
            accumulatedAddresses: addresses,
          };
        }
      }
    }
  }

  return { resolutions, groups };
}

function accountDetails(account: FinancialAccount) {
  return { institution: account.institutionName, maskedIdentifier: account.maskedIdentifier, currency: account.currency };
}

export function normalizedAccountEvidence(evidence: FinancialAccountIdentityEvidence) {
  const institution = normalizeInstitution(evidence.institutionName || evidence.institutionCode);
  const suffix = extractAccountSuffix(evidence.maskedIdentifier || evidence.accountNumber);
  const currency = evidence.currency ? String(evidence.currency).trim().toUpperCase() : "";
  return { institution, suffix, currency };
}

function accountConflictResult(
  candidateId: string,
  account: FinancialAccount,
  evidence: FinancialAccountIdentityEvidence,
  conflicts: EntityResolutionConflict[],
  reasons: string[],
  sourceRef?: EntityResolutionResult["sourceReference"],
) {
  const normalized = normalizedAccountEvidence(evidence);
  const result = resultBase(
    "FINANCIAL_ACCOUNT",
    candidateId,
    "NEEDS_REVIEW",
    60,
    reasons,
    conflicts,
    [],
    evidence,
    { institution: normalized.institution.code, suffix: normalized.suffix, currency: normalized.currency },
    sourceRef,
  );
  result.matchedEntityId = account.id;
  result.matchedEntityName = account.displayName;
  result.matchedEntityDetails = accountDetails(account);
  return result;
}

export function resolveFinancialAccountCandidate(
  candidate: {
    candidateId: string;
    evidence: FinancialAccountIdentityEvidence;
    sourceRef?: EntityResolutionResult["sourceReference"];
  },
  existingAccounts: FinancialAccount[],
  matchingProfiles?: EmailIntakeProfile[],
  importHistory?: readonly { accountId: string; fileFingerprint?: string; fileName?: string }[],
): EntityResolutionResult {
  const { candidateId, evidence, sourceRef } = candidate;
  const { institution, suffix, currency } = normalizedAccountEvidence(evidence);
  const normalizedEvidence = { institution: institution.code, suffix, currency };
  const accounts = existingAccounts.filter((account) => account.active !== false);

  const linkedAccountId = candidateAccountProfileLink(evidence, matchingProfiles);
  if (linkedAccountId) {
    const account = accounts.find((item) => item.id === linkedAccountId);
    if (account) {
      const conflicts: EntityResolutionConflict[] = [];
      const accountInstitution = normalizeInstitution(account.institutionName || account.institutionCode);
      const accountSuffix = extractAccountSuffix(account.maskedIdentifier);
      const accountCurrency = String(account.currency || "").trim().toUpperCase();
      if (institution.code !== "UNKNOWN" && accountInstitution.code !== institution.code) {
        conflicts.push({
          field: "institution",
          label: "Financial Institution",
          existingValue: account.institutionName,
          candidateValue: evidence.institutionName || evidence.institutionCode,
          reason: `Statement institution (${institution.displayName}) conflicts with the account linked by the saved sender profile (${account.institutionName}).`,
        });
      }
      if (suffix && accountSuffix && suffix !== accountSuffix) {
        conflicts.push({
          field: "accountSuffix",
          label: "Account Number Suffix",
          existingValue: accountSuffix,
          candidateValue: suffix,
          reason: `Statement account suffix (•••• ${suffix}) conflicts with the account linked by the saved sender profile (•••• ${accountSuffix}).`,
        });
      }
      if (currency && accountCurrency && currency !== accountCurrency) {
        conflicts.push({
          field: "currency",
          label: "Account Currency",
          existingValue: account.currency,
          candidateValue: currency,
          reason: `Statement currency (${currency}) conflicts with the account linked by the saved sender profile (${account.currency}).`,
        });
      }
      if (conflicts.length) {
        return accountConflictResult(
          candidateId,
          account,
          evidence,
          conflicts,
          [`Saved sender rule suggested ${account.displayName}, but this statement appears to belong to ${institution.displayName !== "Unknown Institution" ? institution.displayName : "an account"} ending in ${suffix || "a different identifier"}.`],
          sourceRef,
        );
      }
      const result = resultBase(
        "FINANCIAL_ACCOUNT",
        candidateId,
        "LINK_EXISTING",
        95,
        [`Matched saved sender profile linked to account: ${account.displayName}.`],
        [],
        [],
        evidence,
        normalizedEvidence,
        sourceRef,
      );
      result.matchedEntityId = account.id;
      result.matchedEntityName = account.displayName;
      result.matchedEntityDetails = accountDetails(account);
      return result;
    }
  }

  // Check import history for advisory correlation
  let historyMatchedAccount: FinancialAccount | undefined;
  if (importHistory && importHistory.length > 0) {
    const historyMatches = importHistory.filter((h) => {
      const targetAcc = accounts.find((a) => a.id === h.accountId);
      if (!targetAcc) return false;
      const accInst = normalizeInstitution(targetAcc.institutionName || targetAcc.institutionCode);
      const accSuffix = extractAccountSuffix(targetAcc.maskedIdentifier);
      const instMatches = institution.code === "UNKNOWN" || accInst.code === institution.code;
      const suffixMatches = !suffix || accSuffix === suffix;
      return instMatches && suffixMatches;
    });
    if (historyMatches.length > 0) {
      const historyAccountId = historyMatches[0].accountId;
      historyMatchedAccount = accounts.find((a) => a.id === historyAccountId);
    }
  }

  if (institution.code !== "UNKNOWN" && suffix) {
    const matches = accounts.filter((account) => {
      const accountInstitution = normalizeInstitution(account.institutionName || account.institutionCode);
      const accountSuffix = extractAccountSuffix(account.maskedIdentifier);
      const accountCurrency = String(account.currency || "").trim().toUpperCase();
      return accountInstitution.code === institution.code && accountSuffix === suffix && (!currency || !accountCurrency || accountCurrency === currency);
    });
    if (matches.length === 1) {
      const account = matches[0];
      const matchReasons = [`Institution (${institution.displayName}), account suffix (•••• ${suffix})${currency ? `, and currency (${currency})` : ""} uniquely match account: ${account.displayName}.`];
      if (historyMatchedAccount && historyMatchedAccount.id === account.id) {
        matchReasons.push(`Import history supports match with ${account.displayName}.`);
      }
      const result = resultBase(
        "FINANCIAL_ACCOUNT",
        candidateId,
        "LINK_EXISTING",
        historyMatchedAccount ? 98 : 96,
        matchReasons,
        [],
        [],
        evidence,
        normalizedEvidence,
        sourceRef,
      );
      result.matchedEntityId = account.id;
      result.matchedEntityName = account.displayName;
      result.matchedEntityDetails = accountDetails(account);
      return result;
    }
    if (matches.length > 1) {
      return resultBase("FINANCIAL_ACCOUNT", candidateId, "NEEDS_REVIEW", 70, [`Multiple ${institution.displayName} accounts end in ${suffix}${currency ? ` (${currency})` : ""}. Explicit account selection is required.`], [], [], evidence, normalizedEvidence, sourceRef);
    }
  }

  if (institution.code !== "UNKNOWN" && !suffix) {
    const matches = accounts.filter((account) => {
      const accountInstitution = normalizeInstitution(account.institutionName || account.institutionCode);
      const accountCurrency = String(account.currency || "").trim().toUpperCase();
      return accountInstitution.code === institution.code && (!currency || !accountCurrency || accountCurrency === currency);
    });
    if (matches.length === 1) {
      const account = matches[0];
      const result = resultBase(
        "FINANCIAL_ACCOUNT",
        candidateId,
        "NEEDS_REVIEW",
        75,
        [`Only one active ${institution.displayName}${currency ? ` (${currency})` : ""} account exists (${account.displayName}), but no account suffix was extracted. Confirm explicitly.`],
        [],
        [],
        evidence,
        normalizedEvidence,
        sourceRef,
      );
      result.matchedEntityId = account.id;
      result.matchedEntityName = account.displayName;
      result.matchedEntityDetails = accountDetails(account);
      return result;
    }
    if (matches.length > 1) {
      return resultBase("FINANCIAL_ACCOUNT", candidateId, "NEEDS_REVIEW", 50, [`Multiple ${institution.displayName} accounts exist. Explicit account selection is required.`], [], [], evidence, normalizedEvidence, sourceRef);
    }
  }

  const result = resultBase(
    "FINANCIAL_ACCOUNT",
    candidateId,
    "CREATE_NEW",
    80,
    [`No existing ${institution.displayName} account ending in ${suffix || "unknown"}${currency ? ` (${currency})` : ""} was found. Creation remains a proposal until review.`],
    [],
    [],
    evidence,
    normalizedEvidence,
    sourceRef,
  );
  result.matchedEntityName = `${institution.displayName}${suffix ? ` •••• ${suffix}` : ""}`;
  return result;
}

export function resolveBatchFinancialAccounts(
  candidates: Array<{ candidateId: string; evidence: FinancialAccountIdentityEvidence; sourceRef?: EntityResolutionResult["sourceReference"] }>,
  existingAccounts: FinancialAccount[],
  matchingProfiles?: EmailIntakeProfile[],
): { resolutions: Record<string, EntityResolutionResult>; groups: Record<string, string[]> } {
  const resolutions: Record<string, EntityResolutionResult> = {};
  const groups: Record<string, string[]> = {};
  for (const candidate of candidates) resolutions[candidate.candidateId] = resolveFinancialAccountCandidate(candidate, existingAccounts, matchingProfiles);
  if (!candidates.length) return { resolutions, groups };

  const adjacency = new Map<string, Set<string>>();
  for (const candidate of candidates) adjacency.set(candidate.candidateId, new Set([candidate.candidateId]));

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      const resA = resolutions[a.candidateId];
      const resB = resolutions[b.candidateId];
      const normA = normalizedAccountEvidence(a.evidence);
      const normB = normalizedAccountEvidence(b.evidence);
      const sameExisting = Boolean(resA.matchedEntityId && resB.matchedEntityId && resA.matchedEntityId === resB.matchedEntityId);
      const sameUnseen = Boolean(
        normA.institution.code !== "UNKNOWN"
        && normA.institution.code === normB.institution.code
        && normA.suffix
        && normA.suffix === normB.suffix
        && (!normA.currency || !normB.currency || normA.currency === normB.currency),
      );
      if (sameExisting || sameUnseen) {
        adjacency.get(a.candidateId)!.add(b.candidateId);
        adjacency.get(b.candidateId)!.add(a.candidateId);
      }
    }
  }

  const visited = new Set<string>();
  for (const seed of candidates.map((candidate) => candidate.candidateId).sort()) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    const members: string[] = [];
    visited.add(seed);
    while (queue.length) {
      const current = queue.shift()!;
      members.push(current);
      for (const next of Array.from(adjacency.get(current) || []).sort()) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    members.sort();
    const groupId = `account-group-${members[0]}`;
    groups[groupId] = members;
    for (const memberId of members) {
      const resolution = resolutions[memberId];
      resolution.batchGroupId = groupId;
      resolution.groupMemberCount = members.length;
      resolution.isGroupPrimary = memberId === members[0];
      if (members.length > 1) resolution.matchReasons.push(`Grouped with ${members.length - 1} other statement(s) in this batch for the same account identity.`);
    }
  }

  return { resolutions, groups };
}

/**
 * Extracts post-extraction Vendor identity evidence from an extracted InvoiceData object
 * combined with source email metadata and any matched saved sender profile.
 */
export function extractVendorEvidenceFromInvoice(
  invoice: InvoiceData,
  sourceMetadata?: EmailSourceMetadata,
  profile?: EmailIntakeProfile,
): VendorIdentityEvidence {
  const vendor = invoice.vendor || ({} as any);
  const emailMeta = sourceMetadata || invoice.sourceMetadata;
  const parsedSender = emailMeta?.sender ? parseSenderAddress(emailMeta.sender) : null;
  const senderEmail = parsedSender?.email || undefined;
  const senderDomain = parsedSender?.domain || undefined;

  const directTin = vendor.taxId || undefined;
  const branchCode = vendor.branchCode || undefined;
  const fullTin = directTin && branchCode && !directTin.includes(branchCode)
    ? `${directTin}-${branchCode}`
    : directTin;

  const name = vendor.registeredName || vendor.name || vendor.tradeName || parsedSender?.name || "Unknown Vendor";

  return {
    name,
    companyName: vendor.tradeName || vendor.name || undefined,
    registeredName: vendor.registeredName || vendor.name || undefined,
    tradeName: vendor.tradeName || undefined,
    taxId: fullTin,
    email: vendor.email || senderEmail,
    phone: vendor.phone || undefined,
    address: vendor.address || undefined,
    senderEmail,
    senderDomain,
    matchedProfileId: profile?.id,
    matchedProfileName: profile?.name,
    linkedProfileVendorId: profile?.linkedVendorId,
  };
}

/**
 * Extracts post-parse FinancialAccount identity evidence from a parsed statement spreadsheet document
 * (examining pre-header rows, sheetName, fileName) combined with source email metadata.
 * Missing currency remains unknown/empty and does not default to PHP.
 */
export function extractAccountEvidenceFromStatement(
  document: {
    fileName?: string;
    sheetName?: string;
    rawRows?: readonly (string | number | Date | null | undefined)[][];
    extractedMetadata?: {
      institutionName?: string;
      accountNumber?: string;
      maskedIdentifier?: string;
      currency?: string;
    };
  },
  sourceMetadata?: { sender?: string; subject?: string },
  profile?: EmailIntakeProfile,
): FinancialAccountIdentityEvidence {
  const parsedSender = sourceMetadata?.sender ? parseSenderAddress(sourceMetadata.sender) : null;
  const rows = document.rawRows || [];

  let detectedInstitution: string | undefined = document.extractedMetadata?.institutionName;
  let detectedAccountNumber: string | undefined = document.extractedMetadata?.accountNumber || document.extractedMetadata?.maskedIdentifier;
  let detectedCurrency: string | undefined = document.extractedMetadata?.currency;
  let detectedAccountName: string | undefined;

  // Search pre-header rows and all string cells up to row 25
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null || cell === undefined) continue;
      const text = String(cell).trim();
      if (!text) continue;

      // Institution check
      if (!detectedInstitution) {
        const inst = normalizeInstitution(text);
        if (inst.code !== "UNKNOWN" && inst.code !== "OTHER") {
          detectedInstitution = inst.displayName;
        }
      }

      // Account number / suffix check
      if (!detectedAccountNumber) {
        const acctMatch = text.match(/(?:account(?:\s*no\.?|\s*number)?|acct(?:\s*no\.?|\s*#)?)\s*[:#-]?\s*([0-9*•xX\-]{4,30})/i);
        if (acctMatch && acctMatch[1]) {
          detectedAccountNumber = acctMatch[1].trim();
        } else {
          const maskedMatch = text.match(/[•*xX]{2,}\s*(\d{4})/);
          if (maskedMatch && maskedMatch[1]) {
            detectedAccountNumber = maskedMatch[1];
          }
        }
      }

      // Currency check
      if (!detectedCurrency) {
        const currMatch = text.match(/\b(?:currency|curr)\s*[:#-]?\s*(PHP|USD|EUR|SGD|JPY|AUD|CAD|GBP|HKD|CNY|KRW)\b/i);
        if (currMatch && currMatch[1]) {
          detectedCurrency = currMatch[1].toUpperCase();
        } else if (/^(PHP|USD|EUR|SGD|JPY|AUD|CAD|GBP|HKD|CNY|KRW)$/i.test(text)) {
          detectedCurrency = text.toUpperCase();
        }
      }

      // Account name check
      if (!detectedAccountName) {
        const nameMatch = text.match(/(?:account\s*name|account\s*title)\s*[:#-]?\s*([^\n\r]+)/i);
        if (nameMatch && nameMatch[1]?.trim()) {
          detectedAccountName = nameMatch[1].trim();
        }
      }
    }
  }

  // Also inspect fileName & sheetName for hints if not found in cells
  if (!detectedInstitution && document.fileName) {
    const inst = normalizeInstitution(document.fileName);
    if (inst.code !== "UNKNOWN" && inst.code !== "OTHER") {
      detectedInstitution = inst.displayName;
    }
  }
  if (!detectedAccountNumber && document.fileName) {
    const fnMatch = document.fileName.match(/[_\-\s](\d{4})\b/);
    if (fnMatch && fnMatch[1]) {
      detectedAccountNumber = fnMatch[1];
    }
  }
  if (!detectedCurrency && document.fileName) {
    const fnCurr = document.fileName.match(/\b(PHP|USD|EUR|SGD|JPY)\b/i);
    if (fnCurr && fnCurr[1]) {
      detectedCurrency = fnCurr[1].toUpperCase();
    }
  }

  // Advisory hints from matched profile if not detected from sheet
  if (!detectedInstitution && profile?.expectedInstitution) {
    const inst = normalizeInstitution(profile.expectedInstitution);
    if (inst.code !== "UNKNOWN" && inst.code !== "OTHER") {
      detectedInstitution = inst.displayName;
    }
  }
  if (!detectedCurrency && profile?.expectedCurrency) {
    detectedCurrency = profile.expectedCurrency.trim().toUpperCase();
  }

  return {
    institutionName: detectedInstitution || parsedSender?.name || undefined,
    accountNumber: detectedAccountNumber,
    maskedIdentifier: detectedAccountNumber ? extractAccountSuffix(detectedAccountNumber) : undefined,
    currency: detectedCurrency || undefined, // Must remain undefined if not found
    displayName: detectedAccountName,
    senderEmail: parsedSender?.email || undefined,
    senderDomain: parsedSender?.domain || undefined,
    matchedProfileId: profile?.id,
    matchedProfileName: profile?.name,
    linkedProfileAccountId: profile?.linkedFinancialAccountId,
  };
}

/**
 * Extracts post-extraction Vendor identity evidence from an Expense / Receipt candidate.
 */
export function extractVendorEvidenceFromExpense(
  expense: {
    payee?: string;
    amount?: number;
    currency?: string;
    description?: string;
    merchantIdentityEvidence?: {
      rawName?: string;
      taxId?: string;
      address?: string;
      email?: string;
      phone?: string;
    };
  },
  sourceMetadata?: { sender?: string; subject?: string },
  profile?: EmailIntakeProfile,
): VendorIdentityEvidence {
  const parsedSender = sourceMetadata?.sender ? parseSenderAddress(sourceMetadata.sender) : null;
  const senderEmail = expense.merchantIdentityEvidence?.email || parsedSender?.email || undefined;
  const senderDomain = parsedSender?.domain || undefined;
  const directTin = expense.merchantIdentityEvidence?.taxId || undefined;
  const name = expense.merchantIdentityEvidence?.rawName || expense.payee || parsedSender?.name || "Expense Merchant";

  return {
    name,
    companyName: name,
    registeredName: expense.merchantIdentityEvidence?.rawName || name,
    taxId: directTin,
    email: senderEmail,
    phone: expense.merchantIdentityEvidence?.phone || undefined,
    address: expense.merchantIdentityEvidence?.address || undefined,
    senderEmail,
    senderDomain,
    matchedProfileId: profile?.id,
    matchedProfileName: profile?.name,
    linkedProfileVendorId: profile?.linkedVendorId,
  };
}
