import type { DailySiteLogsWorkspaceData, DailySiteLogStatus } from "../../lib/dailySiteLogs.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

function logId(key: string) { return `demo-daily-log-${key}`; }
function created(anchorDate: string, offset: number, hour = 17) { return demoTimestamp(addDemoDays(anchorDate, offset), hour, 15); }

export function createDemoDailySiteLogs(anchorDate: string): DailySiteLogsWorkspaceData {
  const specs: Array<{
    key: string; projectId: string; offset: number; status: DailySiteLogStatus; work: string; delay?: string; safety?: string; quality?: string; notes?: string;
    weather: { condition: string; temperatureC: number; precipitationMm: number; windKph: number; humidityPercent: number; impact: "NONE" | "LOW" | "MODERATE" | "HIGH" | "STOPPAGE"; notes?: string };
    crews: Array<[string, string, number, number, number, number]>;
    equipment: Array<[string, string, number, number, "OPERATING" | "IDLE" | "DOWN" | "MAINTENANCE", string?]>;
    events?: Array<["WORK" | "DELIVERY" | "VISITOR" | "DELAY" | "SAFETY" | "QUALITY", string, string, "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", boolean]>;
  }> = [
    {
      key: "warehouse-today", projectId: DEMO_PROJECT_IDS.warehouse, offset: 0, status: "DRAFT",
      work: "Loading-bay slab reinforcement continued at Grid C. Electrical team pulled feeders to Panel LP-2 while steel crew completed remaining roof-bracing punch items.",
      safety: "Morning toolbox talk covered lifting-zone exclusion and heat stress. No recordable incident reported.",
      quality: "Rebar spacing and cover checked before afternoon concrete readiness review.",
      weather: { condition: "Partly cloudy", temperatureC: 32, precipitationMm: 0, windKph: 9, humidityPercent: 68, impact: "NONE" },
      crews: [["Civil crew", "Civil", 14, 14, 8, 0], ["Electrical crew", "Electrical", 8, 8, 8, 1], ["Steel punch crew", "Structural", 6, 6, 8, 0]],
      equipment: [["Mobile crane 25T", "EQ-CR-04", 5.5, 1.5, "OPERATING"], ["Concrete vibrator set", "EQ-CV-02", 0, 0, "IDLE"]],
      events: [["WORK", "Slab reinforcement inspection", "Foreman completed internal check prior to consultant inspection request.", "INFO", false]],
    },
    {
      key: "warehouse-rain", projectId: DEMO_PROJECT_IDS.warehouse, offset: -1, status: "REVIEWED",
      work: "Completed warehouse electrical rough-in at the west bay and installed loading-bay formwork until weather interruption.",
      delay: "Heavy rain from 14:10 to 16:05 stopped exterior slab preparation and crane lifting. Indoor electrical work continued.",
      safety: "Exterior lifting area was secured during heavy rain. No incident.",
      weather: { condition: "Heavy afternoon rain", temperatureC: 29, precipitationMm: 31.4, windKph: 24, humidityPercent: 89, impact: "HIGH", notes: "Exterior lifting and slab preparation stopped for almost two hours." },
      crews: [["Civil crew", "Civil", 14, 14, 6, 0], ["Electrical crew", "Electrical", 8, 8, 8, 0], ["Steel crew", "Structural", 7, 7, 6, 0]],
      equipment: [["Mobile crane 25T", "EQ-CR-04", 3.5, 3, "IDLE", "Parked and secured during heavy rain."], ["Boom lift", "EQ-BL-01", 4, 2, "IDLE"]],
      events: [["DELAY", "Weather work stoppage", "Heavy rainfall suspended exterior lifting and slab preparation.", "MEDIUM", true], ["SAFETY", "Wet-weather exclusion", "Exterior lifting area closed until surface and wind conditions were acceptable.", "INFO", false]],
    },
    {
      key: "warehouse-delivery", projectId: DEMO_PROJECT_IDS.warehouse, offset: -2, status: "SUBMITTED",
      work: "Roof-bracing correction work and loading-bay formwork progressed. Electrical sleeves installed ahead of slab activity.",
      quality: "Received reinforcing steel checked against delivery documents and visible condition before release to laydown area.",
      notes: "Supplier delivered 11.2 t reinforcing steel in two trucks.",
      weather: { condition: "Sunny", temperatureC: 33, precipitationMm: 0, windKph: 11, humidityPercent: 61, impact: "NONE" },
      crews: [["Civil crew", "Civil", 13, 13, 8, 2], ["Steel crew", "Structural", 7, 7, 8, 1]],
      equipment: [["Forklift 5T", "EQ-FL-02", 3, 1, "OPERATING"], ["Mobile crane 25T", "EQ-CR-04", 6, 1, "OPERATING"]],
      events: [["DELIVERY", "Reinforcing steel delivery", "Two trucks delivered 11.2 t of reinforcing steel to the approved laydown zone.", "INFO", false], ["QUALITY", "Incoming material inspection", "Tags, size markings, quantity and visible condition checked before acceptance.", "INFO", false]],
    },
    {
      key: "drainage-equipment", projectId: DEMO_PROJECT_IDS.drainage, offset: -1, status: "REVIEWED",
      work: "Catch-basin demolition and pipe bedding preparation continued at Work Front B. Crew shifted excavation sequencing after equipment issue.",
      delay: "Backhoe hydraulic hose failure caused 2.5 hours downtime; second machine covered critical excavation while repair was completed.",
      safety: "Excavation barricades and access ladder inspected after lunch. No incident.",
      weather: { condition: "Cloudy with light showers", temperatureC: 30, precipitationMm: 3.6, windKph: 8, humidityPercent: 79, impact: "LOW" },
      crews: [["Drainage crew A", "Civil", 11, 11, 8, 0], ["Drainage crew B", "Civil", 10, 10, 8, 0], ["Traffic marshals", "Traffic", 4, 4, 8, 0]],
      equipment: [["Backhoe A", "EQ-BH-01", 5.5, 2.5, "MAINTENANCE", "Hydraulic hose replaced on site."], ["Backhoe B", "EQ-BH-02", 7.5, 0.5, "OPERATING"]],
      events: [["DELAY", "Backhoe hydraulic hose failure", "Backhoe A was unavailable while the hydraulic line was replaced.", "MEDIUM", false]],
    },
    {
      key: "drainage-safety", projectId: DEMO_PROJECT_IDS.drainage, offset: -3, status: "SUBMITTED",
      work: "Installed 18 m of replacement drainage pipe and formed catch-basin wall section.",
      safety: "Minor housekeeping observation: loose spoil encroached on pedestrian bypass. Area was cleared immediately and access restored.",
      weather: { condition: "Partly cloudy", temperatureC: 31, precipitationMm: 0.8, windKph: 7, humidityPercent: 75, impact: "NONE" },
      crews: [["Drainage crew A", "Civil", 12, 12, 8, 1], ["Traffic marshals", "Traffic", 4, 4, 8, 0]],
      equipment: [["Backhoe A", "EQ-BH-01", 7, 1, "OPERATING"], ["Plate compactor", "EQ-PC-03", 3.5, 0, "OPERATING"]],
      events: [["SAFETY", "Pedestrian bypass housekeeping", "Loose spoil was found within the edge of the protected pedestrian bypass and removed immediately.", "LOW", false]],
    },
    {
      key: "solar-overtime", projectId: DEMO_PROJECT_IDS.solar, offset: -1, status: "REVIEWED",
      work: "Grading continued on inverter block 2. Survey crew set pad control points and civil team prepared two underground crossing locations.",
      notes: "Extended shift used to finish compaction before forecast overnight rain.",
      weather: { condition: "Hot, mostly sunny", temperatureC: 34, precipitationMm: 0, windKph: 13, humidityPercent: 58, impact: "NONE" },
      crews: [["Earthworks crew", "Civil", 18, 18, 8, 2], ["Survey crew", "Survey", 4, 4, 8, 1], ["Electrical civil crew", "Electrical", 8, 8, 8, 2]],
      equipment: [["Motor grader", "EQ-MG-01", 9, 0.5, "OPERATING"], ["Vibratory roller", "EQ-VR-02", 9, 0.5, "OPERATING"], ["Water truck", "EQ-WT-03", 8, 1, "OPERATING"]],
      events: [["WORK", "Extended compaction shift", "Crew completed the planned compaction zone before forecast overnight rain.", "INFO", false]],
    },
    {
      key: "solar-quality", projectId: DEMO_PROJECT_IDS.solar, offset: -4, status: "SUBMITTED",
      work: "Finished subgrade preparation at inverter pad IP-03 and continued access-road embankment placement.",
      quality: "Field density test at IP-03 initially below project target; area was reworked, moisture conditioned and retested satisfactorily.",
      weather: { condition: "Sunny", temperatureC: 33, precipitationMm: 0, windKph: 10, humidityPercent: 60, impact: "NONE" },
      crews: [["Earthworks crew", "Civil", 16, 16, 8, 0], ["Survey crew", "Survey", 3, 3, 8, 0]],
      equipment: [["Vibratory roller", "EQ-VR-02", 7.5, 0.5, "OPERATING"], ["Motor grader", "EQ-MG-01", 6.5, 1, "OPERATING"]],
      events: [["QUALITY", "IP-03 density retest", "Initial field density result required rework; retest was satisfactory after moisture conditioning and recompaction.", "MEDIUM", false]],
    },
  ];

  const logs = specs.map((spec) => {
    const timestamp = created(anchorDate, spec.offset);
    return {
      id: logId(spec.key), projectId: spec.projectId, logDate: addDemoDays(anchorDate, spec.offset), shiftCode: "DAY" as const, sequenceNo: 1,
      status: spec.status, workSummary: spec.work, delaySummary: spec.delay, safetySummary: spec.safety, qualitySummary: spec.quality, generalNotes: spec.notes,
      preparedAt: timestamp, submittedAt: spec.status !== "DRAFT" ? timestamp : undefined, reviewedAt: spec.status === "REVIEWED" ? demoTimestamp(addDemoDays(anchorDate, spec.offset + 1), 8, 30) : undefined,
      createdAt: timestamp, updatedAt: spec.status === "REVIEWED" ? demoTimestamp(addDemoDays(anchorDate, spec.offset + 1), 8, 30) : timestamp,
    };
  });
  const weather = specs.map((spec) => {
    const timestamp = created(anchorDate, spec.offset, 16);
    return { id: `demo-weather-${spec.key}`, dailyLogId: logId(spec.key), condition: spec.weather.condition, temperatureC: spec.weather.temperatureC, precipitationMm: spec.weather.precipitationMm, windKph: spec.weather.windKph, humidityPercent: spec.weather.humidityPercent, workImpact: spec.weather.impact, source: "MANUAL" as const, observedAt: timestamp, notes: spec.weather.notes, createdAt: timestamp, updatedAt: timestamp };
  });
  const crews = specs.flatMap((spec) => spec.crews.map(([crewLabel, trade, plannedCount, actualCount, regularHours, overtimeHours], index) => ({ id: `demo-crew-${spec.key}-${index + 1}`, dailyLogId: logId(spec.key), crewLabel, trade, plannedCount, actualCount, regularHours, overtimeHours, createdAt: created(anchorDate, spec.offset), updatedAt: created(anchorDate, spec.offset) })));
  const equipment = specs.flatMap((spec) => spec.equipment.map(([equipmentLabel, equipmentReference, operatingHours, idleHours, status, issueNote], index) => ({ id: `demo-equipment-${spec.key}-${index + 1}`, dailyLogId: logId(spec.key), equipmentLabel, equipmentReference, quantity: 1, operatingHours, idleHours, status, issueNote, createdAt: created(anchorDate, spec.offset), updatedAt: created(anchorDate, spec.offset) })));
  const events = specs.flatMap((spec) => (spec.events || []).map(([eventType, title, description, severity, workStoppage], index) => ({ id: `demo-event-${spec.key}-${index + 1}`, dailyLogId: logId(spec.key), eventType, occurredAt: demoTimestamp(addDemoDays(anchorDate, spec.offset), 14 + index, 10), title, description, severity, workStoppage, createdAt: created(anchorDate, spec.offset) })));
  return { logs, weather, crews, equipment, events, amendments: [], attachments: [] };
}
