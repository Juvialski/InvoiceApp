import React, { useMemo, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Command, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { BRAND } from "../config/brand.ts";
import { formatMoney } from "../config/regional.ts";
import { buildDemoProjectSummaries } from "./demoSelectors.ts";
import { useDemoWorkspace } from "./DemoWorkspaceProvider.tsx";
import { demoPathForProject, demoPathForTab } from "./demoRouting.ts";
import { DEMO_PROJECT_IDS } from "./data/projects.ts";
import { addDemoDays } from "./data/demoDates.ts";

const SUGGESTED_PROMPTS = [
  "Which projects are over budget?",
  "What invoices need attention?",
  "Show payroll due this week.",
  "Which project has the highest labor cost?",
  "Take me to the Laguna Solar project.",
  "Show the outstanding invoices for the warehouse project.",
  "Show site logs with safety incidents",
  "Which projects had rain delays this week?",
  "How many workers were reported on the warehouse yesterday?",
  "Add an employee named Alex Santos at ₱500 per hour.",
] as const;

interface DemoMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function DemoAssistant({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { data, preparedAction, prepareAddWorker, confirmPreparedAction, cancelPreparedAction } = useDemoWorkspace();
  const summaries = useMemo(() => buildDemoProjectSummaries(data), [data]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DemoMessage[]>([{ id: "welcome", role: "assistant", text: `I’m the demo-safe ${BRAND.assistantName}. I can answer questions from Meridian’s sample workspace, navigate the demo, and prepare sandboxed actions for confirmation.` }]);

  const reply = (question: string): string => {
    const normalized = question.toLowerCase();
    if (normalized.includes("over budget")) {
      const over = data.projects.filter((project) => (summaries[project.id]?.totalActualCost || 0) > project.projectBudget);
      if (!over.length) {
        const highest = data.projects.slice().sort((a, b) => (summaries[b.id]?.budgetUsedPercent || 0) - (summaries[a.id]?.budgetUsedPercent || 0))[0];
        return `No project is over its confirmed budget in the demo. ${highest.projectName} currently has the highest confirmed budget utilization at ${(summaries[highest.id]?.budgetUsedPercent || 0).toFixed(1)}%.`;
      }
      return `${over.map((project) => project.projectName).join(", ")} ${over.length === 1 ? "is" : "are"} over confirmed budget.`;
    }
    if (normalized.includes("invoice") && normalized.includes("attention")) {
      const review = data.invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW");
      const overdue = data.invoices.filter((invoice) => invoice.status === "OVERDUE" && (invoice.balanceDue || 0) > 0);
      return `${review.length} invoices need verification and ${overdue.length} verified invoices are overdue. The highest overdue balance is ${formatMoney(Math.max(0, ...overdue.map((invoice) => invoice.balanceDue || 0)), "PHP")}.`;
    }
    if (normalized.includes("payroll") && (normalized.includes("week") || normalized.includes("due"))) {
      const current = data.payroll.periods.find((period) => period.status === "OPEN");
      const run = current && data.payroll.runs.find((item) => item.periodId === current.id);
      const gross = run ? data.payroll.entries.filter((entry) => entry.payrollRunId === run.id).reduce((sum, entry) => sum + entry.grossPay, 0) : 0;
      return current ? `The open payroll period is ${current.periodStart} to ${current.periodEnd}, with pay date ${current.payDate || "not set"}. Current gross payroll is ${formatMoney(gross, "PHP")} across ${data.payroll.workers.length} active demo workers.` : "There is no open demo payroll period.";
    }
    if (normalized.includes("highest labor") || normalized.includes("highest payroll")) {
      const ranked = data.projects.slice().sort((a, b) => (summaries[b.id]?.payrollCost || 0) - (summaries[a.id]?.payrollCost || 0));
      const top = ranked[0];
      return `${top.projectName} has the highest confirmed labor cost in the demo at ${formatMoney(summaries[top.id]?.payrollCost || 0, "PHP")}.`;
    }
    if (normalized.includes("laguna") && (normalized.includes("take me") || normalized.includes("go to") || normalized.includes("open"))) {
      onNavigate(demoPathForProject(DEMO_PROJECT_IDS.solar));
      return "Opening the Laguna Solar Facility Civil Works project workspace.";
    }
    if (normalized.includes("outstanding") && normalized.includes("warehouse")) {
      const invoiceIds = new Set(data.invoiceAllocations.filter((allocation) => allocation.projectId === DEMO_PROJECT_IDS.warehouse).map((allocation) => allocation.invoiceId));
      const outstanding = data.invoices.filter((invoice) => invoiceIds.has(invoice.id) && (invoice.balanceDue || 0) > 0);
      const total = outstanding.reduce((sum, invoice) => sum + (invoice.balanceDue || 0), 0);
      return `${outstanding.length} warehouse invoices have an outstanding balance totaling ${formatMoney(total, "PHP")}. Open Invoices to review the overdue electrical bill and current supplier commitments.`;
    }
    if (normalized.includes("site log") || normalized.includes("daily log") || normalized.includes("site happened") || normalized.includes("rain delay")) {
      const logs = data.siteLogs.logs;
      if (normalized.includes("safety")) {
        const safetyLogs = logs.filter((log) => data.siteLogs.safety.some((row) => row.siteLogId === log.id));
        return `${safetyLogs.length} demo Site Logs include safety observations. The latest is ${safetyLogs[0]?.siteDate || "not available"}; open Projects to inspect the project-scoped field record.`;
      }
      if (normalized.includes("rain")) {
        const rainLogIds = new Set(data.siteLogs.weather.filter((row) => row.condition === "RAIN" || row.condition === "STORM").map((row) => row.siteLogId));
        const projectNames = data.projects.filter((project) => logs.some((log) => log.projectId === project.id && rainLogIds.has(log.id))).map((project) => project.projectName);
        return projectNames.length ? `${projectNames.join(", ")} had rain-affected demo Site Logs this week. These are field observations only; no payroll attendance was changed.` : "No rain-affected demo Site Logs were found.";
      }
      const warehouseLog = logs.find((log) => log.projectId === DEMO_PROJECT_IDS.warehouse && log.siteDate === addDemoDays(data.anchorDate, -1)) || logs.find((log) => log.projectId === DEMO_PROJECT_IDS.warehouse);
      if (warehouseLog && (normalized.includes("open") || normalized.includes("take me") || normalized.includes("show"))) {
        onNavigate(demoPathForProject(DEMO_PROJECT_IDS.warehouse, "site-logs", { siteLogId: warehouseLog.id }));
        return `Opening the warehouse Site Log for ${warehouseLog.siteDate}. Weather, crew, equipment, delays, safety, and lifecycle history are available there.`;
      }
      return `${logs.length} Daily Site Logs are available across Meridian's projects, including a current draft, rain-affected days, equipment downtime, concrete work, safety observations, and finalized history.`;
    }
    if (normalized.includes("how many") && normalized.includes("worker") && normalized.includes("warehouse") && normalized.includes("yesterday")) {
      const date = addDemoDays(data.anchorDate, -1);
      const log = data.siteLogs.logs.find((item) => item.projectId === DEMO_PROJECT_IDS.warehouse && item.siteDate === date);
      const count = log ? data.siteLogs.crew.filter((row) => row.siteLogId === log.id).reduce((sum, row) => sum + row.headcount, 0) : 0;
      return log ? `${count} workers were reported on the warehouse project on ${date}. This is an operational headcount observation, not a payroll attendance record.` : `No warehouse Site Log was found for ${date}.`;
    }
    if (normalized.includes("add") && normalized.includes("alex santos") && normalized.includes("500")) {
      const action = prepareAddWorker({ firstName: "Alex", lastName: "Santos", rate: 500, jobTitle: "Field Engineer" });
      return `Prepared: ${action.summary} Nothing has changed yet. Confirm the prepared action below to update Demo Workforce only.`;
    }
    if (normalized.includes("invoice")) {
      onNavigate(demoPathForTab("invoices"));
      return "Opening the demo invoice workspace. Supplier records, verification states, VAT fields, and project allocations are all sample data.";
    }
    if (normalized.includes("payroll") || normalized.includes("attendance") || normalized.includes("overtime") || normalized.includes("leave")) {
      onNavigate(demoPathForTab("payroll"));
      return "Opening Workforce & Payroll. The demo includes an open period, paid history, attendance, leave, and overtime records.";
    }
    return "I can answer operational questions from the sample workspace, open Projects, Invoices, Payroll, Cash & Banking, or prepare the Alex Santos demo action. Try one of the suggested prompts.";
  };

  const submit = (value = input) => {
    const question = value.trim();
    if (!question) return;
    const sequence = messages.length + 1;
    let answer: string;
    try { answer = reply(question); } catch (error) { answer = error instanceof Error ? error.message : "The demo action could not be prepared."; }
    setMessages((current) => [...current, { id: `user-${sequence}`, role: "user", text: question }, { id: `assistant-${sequence}`, role: "assistant", text: answer }]);
    setInput("");
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">{BRAND.assistantName} • Demo-safe mode</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Ask about Meridian operations</h1>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">This public demo uses a deterministic assistant adapter. It reads only sample state; mutations stay PREPARED until explicit confirmation and execute only against the demo store.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 sm:self-auto"><ShieldCheck className="h-3.5 w-3.5" /> Production isolated</span>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[52vh] min-h-[360px] space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-lg px-3.5 py-3 text-xs leading-5 sm:max-w-[76%] ${message.role === "user" ? "bg-indigo-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-700"}`}>
                  {message.role === "assistant" && <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-indigo-600"><Bot className="h-3 w-3" /> Assistant</span>}
                  {message.text}
                </div>
              </div>
            ))}
          </div>
          {preparedAction && (
            <div className="border-t border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">Prepared action — confirmation required</p>
                  <p className="mt-1 text-xs font-semibold text-amber-950">{preparedAction.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { confirmPreparedAction(); setMessages((current) => [...current, { id: `confirmed-${current.length}`, role: "assistant", text: "Confirmed. Alex Santos was added to Demo Workforce only. No production persistence was called." }]); }} className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-2 text-[10px] font-black text-white hover:bg-amber-800"><CheckCircle2 className="h-3.5 w-3.5" /> Confirm demo action</button>
                    <button type="button" onClick={cancelPreparedAction} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-[10px] font-black text-amber-800 hover:bg-amber-100"><XCircle className="h-3.5 w-3.5" /> Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex gap-2 border-t border-slate-200 p-3 sm:p-4">
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about projects, invoices, payroll, or demo actions…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-black text-white hover:bg-indigo-700"><ArrowRight className="h-4 w-4" /><span className="hidden sm:inline">Send</span></button>
          </form>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-black text-slate-800"><Command className="h-4 w-4 text-indigo-600" /> Suggested prompts</div>
          <div className="mt-3 space-y-2">
            {SUGGESTED_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => submit(prompt)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-[10px] font-semibold leading-4 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800">{prompt}</button>)}
          </div>
        </aside>
      </section>
    </div>
  );
}
