import type { QaScenarioDefinition } from "./structuredEvidence.ts";
import { DEMO_QA_SCENARIO_METADATA } from "./demoScenarioMetadata.ts";
import { resolveDemoQaScenarioAction } from "./demoScenarioActions.ts";

export const DEMO_QA_SCENARIOS: readonly QaScenarioDefinition[] = DEMO_QA_SCENARIO_METADATA.map(({ actionId, ...scenario }) => ({
  ...scenario,
  ...(actionId === undefined ? {} : { action: resolveDemoQaScenarioAction(actionId) }),
}));
