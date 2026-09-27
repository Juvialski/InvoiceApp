import type { QaScenarioAction } from "./structuredEvidence.ts";
import { sharedScenarioActions } from "./scenarios/shared.ts";
import { cashScenarioActions } from "./scenarios/cash.ts";
import { documentsScenarioActions } from "./scenarios/documents.ts";
import { engineeringScenarioActions } from "./scenarios/engineering.ts";
import { expensesScenarioActions } from "./scenarios/expenses.ts";
import { helpScenarioActions } from "./scenarios/help.ts";
import { inventoryScenarioActions } from "./scenarios/inventory.ts";
import { invoicesScenarioActions } from "./scenarios/invoices.ts";
import { messagingScenarioActions } from "./scenarios/messaging.ts";
import { payrollScenarioActions } from "./scenarios/payroll.ts";
import { procurementScenarioActions } from "./scenarios/procurement.ts";
import { projectsScenarioActions } from "./scenarios/projects.ts";
import { settingsScenarioActions } from "./scenarios/settings.ts";
import { workbookScenarioActions } from "./scenarios/workbook.ts";

const actionGroups: readonly Readonly<Record<string, QaScenarioAction>>[] = [
  sharedScenarioActions,
  cashScenarioActions,
  documentsScenarioActions,
  engineeringScenarioActions,
  expensesScenarioActions,
  helpScenarioActions,
  inventoryScenarioActions,
  invoicesScenarioActions,
  messagingScenarioActions,
  payrollScenarioActions,
  procurementScenarioActions,
  projectsScenarioActions,
  settingsScenarioActions,
  workbookScenarioActions,
];
const actionMap = new Map<string, QaScenarioAction>();
for (const group of actionGroups) {
  for (const [id, action] of Object.entries(group)) {
    if (actionMap.has(id)) throw new Error("Duplicate Demo QA action id: " + id);
    actionMap.set(id, action);
  }
}

export function resolveDemoQaScenarioAction(actionId: string): QaScenarioAction {
  const action = actionMap.get(actionId);
  if (!action) throw new Error("Demo QA action is not registered: " + actionId);
  return action;
}
