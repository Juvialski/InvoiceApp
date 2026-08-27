import React from "react";
import { ProjectsPage } from "../../components/projects/ProjectsPage";
import { ProjectWorkspace, type WorkspaceTab } from "../../components/projects/ProjectWorkspace";
import type {
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollPeriod,
  PayrollProjectAllocation,
  Project,
  ProjectCostSummary,
  ProjectWorkerAssignment,
  Worker,
} from "../../types";
import type { ProjectDashboardViewData } from "../../utils/projectDashboardViewModel";

export interface ProjectsRouteProps {
  projects: Project[];
  selectedProject?: Project | null;
  summaries: Record<string, ProjectCostSummary>;
  projectDashboard?: ProjectDashboardViewData;
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  workers?: Worker[];
  assignments?: ProjectWorkerAssignment[];
  payrollAllocations?: PayrollProjectAllocation[];
  payrollPeriods?: PayrollPeriod[];
  projectFormSeed?: Project | null;
  initialTab?: WorkspaceTab;
  initialDocumentId?: string;
  initialRevisionId?: string;
  initialRfiId?: string;
  initialSubmittalId?: string;
  initialSubmittalRoundId?: string;
  companyId?: string;
  engineeringDocumentsCanRead?: boolean;
  engineeringDocumentsCanCreate?: boolean;
  engineeringDocumentsCanAnnotate?: boolean;
  engineeringDocumentsCanManage?: boolean;
  engineeringRfisCanRead?: boolean;
  engineeringRfisCanCreate?: boolean;
  engineeringRfisCanRespond?: boolean;
  engineeringRfisCanManage?: boolean;
  engineeringSubmittalsCanRead?: boolean;
  engineeringSubmittalsCanCreate?: boolean;
  engineeringSubmittalsCanReview?: boolean;
  engineeringSubmittalsCanManage?: boolean;
  engineeringDocumentsGuestMode?: boolean;
  onTabChange?: (tab: WorkspaceTab) => void;
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => Promise<void> | void;
  onArchiveProject: (project: Project) => Promise<void> | void;
  onEditProject?: () => void;
  onSaveInvoiceAllocations: (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => Promise<void>;
  onBack: () => void;
  onOpenInvoice: (invoice: InvoiceData) => void;
  onUploadInvoice: () => void;
  onAddExpense?: () => void;
  onOpenPayroll?: () => void;
}

export const ProjectsRoute: React.FC<ProjectsRouteProps> = ({
  projects,
  selectedProject,
  summaries,
  projectDashboard,
  invoices,
  invoiceAllocations,
  expenses,
  workers = [],
  assignments = [],
  payrollAllocations = [],
  payrollPeriods = [],
  projectFormSeed,
  initialTab = "overview",
  initialDocumentId,
  initialRevisionId,
  initialRfiId,
  initialSubmittalId,
  initialSubmittalRoundId,
  companyId,
  engineeringDocumentsCanRead,
  engineeringDocumentsCanCreate,
  engineeringDocumentsCanAnnotate,
  engineeringDocumentsCanManage,
  engineeringRfisCanRead,
  engineeringRfisCanCreate,
  engineeringRfisCanRespond,
  engineeringRfisCanManage,
  engineeringSubmittalsCanRead,
  engineeringSubmittalsCanCreate,
  engineeringSubmittalsCanReview,
  engineeringSubmittalsCanManage,
  engineeringDocumentsGuestMode,
  onTabChange,
  onOpenProject,
  onSaveProject,
  onArchiveProject,
  onEditProject,
  onSaveInvoiceAllocations,
  onBack,
  onOpenInvoice,
  onUploadInvoice,
  onAddExpense,
  onOpenPayroll,
}) => {
  if (selectedProject) {
    const summary = summaries[selectedProject.id] || ({
      budget: selectedProject.projectBudget,
      totalActualCost: 0,
      remainingBudget: selectedProject.projectBudget,
      budgetUsedPercent: 0,
      invoiceCost: 0,
      payrollCost: 0,
      otherExpenseCost: 0,
    } as ProjectCostSummary);

    return (
      <ProjectWorkspace
        project={selectedProject}
        summary={summary}
        dashboard={projectDashboard}
        invoices={invoices}
        invoiceAllocations={invoiceAllocations}
        expenses={expenses}
        workers={workers}
        assignments={assignments}
        payrollAllocations={payrollAllocations}
        payrollPeriods={payrollPeriods}
        initialTab={initialTab}
        initialDocumentId={initialDocumentId}
        initialRevisionId={initialRevisionId}
        initialRfiId={initialRfiId}
        initialSubmittalId={initialSubmittalId}
        initialSubmittalRoundId={initialSubmittalRoundId}
        companyId={companyId}
        engineeringDocumentsCanRead={engineeringDocumentsCanRead}
        engineeringDocumentsCanCreate={engineeringDocumentsCanCreate}
        engineeringDocumentsCanAnnotate={engineeringDocumentsCanAnnotate}
        engineeringDocumentsCanManage={engineeringDocumentsCanManage}
        engineeringRfisCanRead={engineeringRfisCanRead}
        engineeringRfisCanCreate={engineeringRfisCanCreate}
        engineeringRfisCanRespond={engineeringRfisCanRespond}
        engineeringRfisCanManage={engineeringRfisCanManage}
        engineeringSubmittalsCanRead={engineeringSubmittalsCanRead}
        engineeringSubmittalsCanCreate={engineeringSubmittalsCanCreate}
        engineeringSubmittalsCanReview={engineeringSubmittalsCanReview}
        engineeringSubmittalsCanManage={engineeringSubmittalsCanManage}
        engineeringDocumentsGuestMode={engineeringDocumentsGuestMode}
        onTabChange={onTabChange}
        onSaveInvoiceAllocations={onSaveInvoiceAllocations}
        onBack={onBack}
        onOpenInvoice={onOpenInvoice}
        onUploadInvoice={onUploadInvoice}
        onEditProject={onEditProject || (() => {})}
        onArchiveProject={() => void onArchiveProject(selectedProject)}
        onAddExpense={onAddExpense}
        onOpenPayroll={onOpenPayroll}
      />
    );
  }

  return (
    <ProjectsPage
      projects={projects}
      summaries={summaries}
      initialEditingProject={projectFormSeed}
      onOpenProject={onOpenProject}
      onSaveProject={onSaveProject}
      onArchiveProject={onArchiveProject}
    />
  );
};
