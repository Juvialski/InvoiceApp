import type { AssistantContext } from "./assistantTypes.ts";

export function createAssistantContext(input: Omit<AssistantContext, "companyId" | "generation"> & { companyId: string; generation?: number }): AssistantContext {
  return {
    ...input,
    companyId: input.companyId,
    generation: input.generation ?? 0,
  };
}

/** Drop accidental large/non-operational context before it reaches the server. */
export function compactAssistantContext(context: AssistantContext): AssistantContext {
  return {
    route: context.route?.slice(0, 240),
    companyId: context.companyId,
    companyName: context.companyName?.slice(0, 160),
    companyTimezone: context.companyTimezone?.slice(0, 80),
    selectedInvoiceId: context.selectedInvoiceId,
    selectedProjectId: context.selectedProjectId,
    selectedSiteLogId: context.selectedSiteLogId,
    selectedPayrollPeriodId: context.selectedPayrollPeriodId,
    selectedPayrollRunId: context.selectedPayrollRunId,
    attendanceDate: context.attendanceDate,
    activeFilters: context.activeFilters ? Object.fromEntries(Object.entries(context.activeFilters).slice(0, 20)) : undefined,
    currency: context.currency?.slice(0, 8),
    locale: context.locale?.slice(0, 32),
    generation: Number.isFinite(context.generation) ? context.generation : 0,
  };
}
