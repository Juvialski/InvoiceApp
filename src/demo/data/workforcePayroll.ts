import type {
  AttendanceRecord,
  Department,
  LeaveRequest,
  OvertimeRequest,
  PayrollEntry,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  ProjectWorkerAssignment,
  Worker,
  WorkEntry,
} from "../../types.ts";
import type { PayrollWorkspaceData } from "../../lib/payroll.ts";
import type { PayrollSchedule } from "../../lib/payrollSchedule.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { addDemoDays, demoTimestamp, endOfDemoWeek, startOfDemoWeek } from "./demoDates.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

interface WorkerSpec {
  firstName: string;
  lastName: string;
  jobTitle: string;
  payType: Worker["defaultPayType"];
  rate: number;
  employmentType: Worker["employmentType"];
  department: string;
  projectId?: string;
}

const WORKER_SPECS: WorkerSpec[] = [
  { firstName: "Miguel", lastName: "Reyes", jobTitle: "Project Manager", payType: "MONTHLY", rate: 72_000, employmentType: "REGULAR", department: "Project Operations", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Angela", lastName: "Cruz", jobTitle: "Project Engineer", payType: "MONTHLY", rate: 58_000, employmentType: "REGULAR", department: "Engineering", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Carlo", lastName: "Mendoza", jobTitle: "Project Engineer", payType: "MONTHLY", rate: 56_000, employmentType: "REGULAR", department: "Engineering", projectId: DEMO_PROJECT_IDS.solar },
  { firstName: "Patricia", lastName: "Santos", jobTitle: "Site Engineer", payType: "MONTHLY", rate: 48_000, employmentType: "REGULAR", department: "Engineering", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Ramon", lastName: "Bautista", jobTitle: "Safety Officer", payType: "MONTHLY", rate: 42_000, employmentType: "REGULAR", department: "HSE", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Joel", lastName: "Dela Cruz", jobTitle: "Foreman", payType: "DAILY", rate: 1_450, employmentType: "PROJECT_BASED", department: "Field Operations", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Mark", lastName: "Villanueva", jobTitle: "Foreman", payType: "DAILY", rate: 1_400, employmentType: "PROJECT_BASED", department: "Field Operations", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Jerome", lastName: "Garcia", jobTitle: "Electrician", payType: "DAILY", rate: 1_250, employmentType: "PROJECT_BASED", department: "Electrical", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Noel", lastName: "Ramos", jobTitle: "Electrician", payType: "DAILY", rate: 1_200, employmentType: "PROJECT_BASED", department: "Electrical", projectId: DEMO_PROJECT_IDS.solar },
  { firstName: "Arvin", lastName: "Flores", jobTitle: "Welder", payType: "HOURLY", rate: 155, employmentType: "HOURLY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Dennis", lastName: "Navarro", jobTitle: "Welder", payType: "DAILY", rate: 1_150, employmentType: "PROJECT_BASED", department: "Field Operations", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Paolo", lastName: "Aquino", jobTitle: "Carpenter", payType: "DAILY", rate: 1_050, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.solar },
  { firstName: "Jun", lastName: "Mercado", jobTitle: "Carpenter", payType: "DAILY", rate: 1_000, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Edgar", lastName: "Castillo", jobTitle: "Mason", payType: "DAILY", rate: 1_050, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Luis", lastName: "Torres", jobTitle: "Mason", payType: "DAILY", rate: 1_020, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.solar },
  { firstName: "Victor", lastName: "Salazar", jobTitle: "Heavy Equipment Operator", payType: "HOURLY", rate: 185, employmentType: "HOURLY", department: "Equipment", projectId: DEMO_PROJECT_IDS.solar },
  { firstName: "Mario", lastName: "Evangelista", jobTitle: "Heavy Equipment Operator", payType: "DAILY", rate: 1_350, employmentType: "PROJECT_BASED", department: "Equipment", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Ryan", lastName: "Padilla", jobTitle: "Laborer", payType: "DAILY", rate: 780, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Kevin", lastName: "Soriano", jobTitle: "Laborer", payType: "DAILY", rate: 760, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.warehouse },
  { firstName: "Joshua", lastName: "Manalo", jobTitle: "Laborer", payType: "DAILY", rate: 760, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Bernard", lastName: "Lim", jobTitle: "Laborer", payType: "DAILY", rate: 750, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Francis", lastName: "Ong", jobTitle: "Laborer", payType: "DAILY", rate: 750, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.solar },
  { firstName: "Nina", lastName: "Valdez", jobTitle: "Admin", payType: "MONTHLY", rate: 38_000, employmentType: "REGULAR", department: "Administration" },
  { firstName: "Grace", lastName: "Tan", jobTitle: "Payroll Officer", payType: "MONTHLY", rate: 45_000, employmentType: "REGULAR", department: "Finance & Payroll" },
  { firstName: "Elena", lastName: "Pascual", jobTitle: "Admin", payType: "MONTHLY", rate: 36_000, employmentType: "REGULAR", department: "Administration" },
  { firstName: "Ricardo", lastName: "Natividad", jobTitle: "Site Engineer", payType: "MONTHLY", rate: 47_000, employmentType: "REGULAR", department: "Engineering", projectId: DEMO_PROJECT_IDS.solar },
  { firstName: "Marvin", lastName: "Co", jobTitle: "Safety Officer", payType: "MONTHLY", rate: 41_000, employmentType: "REGULAR", department: "HSE", projectId: DEMO_PROJECT_IDS.drainage },
  { firstName: "Leo", lastName: "Hernandez", jobTitle: "Laborer", payType: "DAILY", rate: 770, employmentType: "DAILY", department: "Field Operations", projectId: DEMO_PROJECT_IDS.solar },
];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function weeklyBasePay(worker: Worker): number {
  if (worker.defaultPayType === "MONTHLY") return roundMoney(worker.defaultRate * 12 / 52);
  if (worker.defaultPayType === "HOURLY") return roundMoney(worker.defaultRate * 48);
  return roundMoney(worker.defaultRate * 6);
}

export function createDemoPayroll(anchorDate: string): PayrollWorkspaceData {
  const departments: Department[] = [
    ["demo-dept-engineering", "Engineering"],
    ["demo-dept-field", "Field Operations"],
    ["demo-dept-hse", "HSE"],
    ["demo-dept-electrical", "Electrical"],
    ["demo-dept-equipment", "Equipment"],
    ["demo-dept-admin", "Administration"],
    ["demo-dept-payroll", "Finance & Payroll"],
    ["demo-dept-project", "Project Operations"],
  ].map(([id, name]) => ({ id, name, active: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -300)), updatedAt: demoTimestamp(anchorDate) }));

  const departmentIdByName = new Map(departments.map((department) => [department.name, department.id]));
  const workers: Worker[] = WORKER_SPECS.map((spec, index) => ({
    id: `demo-worker-${String(index + 1).padStart(2, "0")}`,
    employeeCode: `MEC-${String(index + 1).padStart(3, "0")}`,
    firstName: spec.firstName,
    lastName: spec.lastName,
    displayName: `${spec.firstName} ${spec.lastName}`,
    employmentType: spec.employmentType,
    employmentStatus: "ACTIVE",
    jobTitle: spec.jobTitle,
    department: spec.department,
    departmentId: departmentIdByName.get(spec.department),
    defaultPayType: spec.payType,
    defaultRate: spec.rate,
    active: true,
    hireDate: addDemoDays(anchorDate, -(380 + index * 9)),
    workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
    workingHoursStart: "07:00",
    workingHoursEnd: "16:00",
    notes: spec.projectId ? "Active field assignment in the demo workspace." : "Head-office support role.",
    createdAt: demoTimestamp(addDemoDays(anchorDate, -(390 + index * 9))),
    updatedAt: demoTimestamp(anchorDate, 7, 30),
  }));

  const assignments: ProjectWorkerAssignment[] = WORKER_SPECS.flatMap((spec, index) => spec.projectId ? [{
    id: `demo-assignment-${String(index + 1).padStart(2, "0")}`,
    workerId: workers[index].id,
    projectId: spec.projectId,
    startDate: addDemoDays(anchorDate, -(100 + (index % 5) * 16)),
    payType: spec.payType,
    rate: spec.rate,
    roleOnProject: spec.jobTitle,
    active: true,
    notes: "Current primary project assignment.",
  }] : []);

  const weekStart = startOfDemoWeek(anchorDate);
  const weekEnd = endOfDemoWeek(anchorDate);
  const schedule: PayrollSchedule = {
    id: "demo-payroll-schedule-weekly",
    name: "Weekly Field & Operations Payroll",
    effectiveFrom: addDemoDays(weekStart, -280),
    frequency: "WEEKLY",
    weekEndDay: 6,
    anchorPeriodEnd: weekEnd,
    payDateRule: { type: "CALENDAR_DAYS", offsetDays: 3 },
    autoGeneratePeriods: true,
    autoCalculate: false,
    autoCreateRuns: true,
    autoSelectCurrentPeriod: true,
    automationMode: "ASSISTED",
    active: true,
    versions: [{
      id: "demo-payroll-schedule-version-1",
      scheduleId: "demo-payroll-schedule-weekly",
      version: 1,
      effectiveFrom: addDemoDays(weekStart, -280),
      frequency: "WEEKLY",
      weekEndDay: 6,
      anchorPeriodEnd: weekEnd,
      payDateRule: { type: "CALENDAR_DAYS", offsetDays: 3 },
      autoGeneratePeriods: true,
      autoCalculate: false,
      autoCreateRuns: true,
      autoSelectCurrentPeriod: true,
      automationMode: "ASSISTED",
      active: true,
      createdAt: demoTimestamp(addDemoDays(anchorDate, -280)),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, -30)),
    }],
    createdAt: demoTimestamp(addDemoDays(anchorDate, -280)),
    updatedAt: demoTimestamp(addDemoDays(anchorDate, -30)),
  };

  const periods: PayrollPeriod[] = [];
  const runs: PayrollRun[] = [];
  for (let offset = -10; offset <= 1; offset += 1) {
    const start = addDemoDays(weekStart, offset * 7);
    const end = addDemoDays(start, 6);
    const periodId = `demo-payroll-period-${offset + 10}`;
    const isCurrent = offset === 0;
    const isFuture = offset === 1;
    const status: PayrollPeriod["status"] = isFuture ? "DRAFT" : isCurrent ? "OPEN" : offset === -1 ? "APPROVED" : "PAID";
    periods.push({
      id: periodId,
      periodStart: start,
      periodEnd: end,
      payDate: addDemoDays(end, 3),
      scheduleId: schedule.id,
      scheduleVersionId: schedule.versions?.[0]?.id,
      autoGenerated: true,
      lockedAt: status === "PAID" || status === "APPROVED" ? demoTimestamp(addDemoDays(end, 2), 16, 30) : undefined,
      sourceRevision: isCurrent ? 4 : 2,
      sourceRevisionUpdatedAt: demoTimestamp(isCurrent ? anchorDate : end, 17, 0),
      status,
      notes: isCurrent ? "Current open demo payroll period." : isFuture ? "Next scheduled payroll period." : "Historical demo payroll period.",
      createdAt: demoTimestamp(addDemoDays(start, -2)),
      updatedAt: demoTimestamp(isCurrent ? anchorDate : addDemoDays(end, 2)),
    });
    runs.push({
      id: `demo-payroll-run-${offset + 10}`,
      periodId,
      status: isFuture || isCurrent ? "DRAFT" : offset === -1 ? "APPROVED" : "PAID",
      createdAt: demoTimestamp(addDemoDays(start, -1)),
      calculatedAt: isFuture ? undefined : demoTimestamp(end, 18, 0),
      approvedAt: offset < 0 ? demoTimestamp(addDemoDays(end, 2), 15, 0) : undefined,
      paidAt: offset < -1 ? demoTimestamp(addDemoDays(end, 3), 11, 0) : undefined,
      notes: isCurrent ? "Open run accumulating attendance, leave, and overtime." : "Demo payroll history.",
    });
  }

  const entries: PayrollEntry[] = [];
  const allocations: PayrollProjectAllocation[] = [];
  for (const run of runs.filter((item) => periods.find((period) => period.id === item.periodId)?.periodEnd! <= weekEnd)) {
    const period = periods.find((item) => item.id === run.periodId)!;
    for (let index = 0; index < workers.length; index += 1) {
      const worker = workers[index];
      const basePay = weeklyBasePay(worker);
      const overtimePay = run.status === "DRAFT" && [5, 9, 15, 17, 25].includes(index) ? roundMoney(basePay * 0.08) : roundMoney(basePay * ((index % 7) * 0.006));
      const allowances = worker.jobTitle?.includes("Engineer") || worker.jobTitle === "Project Manager" ? 750 : worker.department === "Field Operations" ? 300 : 0;
      const grossPay = roundMoney(basePay + overtimePay + allowances);
      const deductions = roundMoney(grossPay * 0.0825);
      const entryId = `demo-payroll-entry-${run.id}-${worker.id}`;
      const assignment = assignments.find((item) => item.workerId === worker.id && item.active);
      entries.push({
        id: entryId,
        payrollRunId: run.id,
        workerId: worker.id,
        basePay,
        regularPay: basePay,
        overtimePay,
        allowances,
        grossPay,
        deductions,
        netPay: roundMoney(grossPay - deductions),
        employerCosts: roundMoney(grossPay * 0.0475),
        projectAllocatedCost: assignment ? grossPay : 0,
        costContext: assignment
          ? { type: "PROJECT", projectId: assignment.projectId, label: "Primary project assignment", needsReview: false }
          : { type: "ADMIN_OFFICE", label: "Head office", needsReview: false },
        calculationSnapshot: { periodStart: period.periodStart, periodEnd: period.periodEnd, demo: true },
        createdAt: demoTimestamp(period.periodEnd, 18, 5),
      });
      if (assignment) {
        allocations.push({
          id: `demo-payroll-allocation-${run.id}-${worker.id}`,
          payrollEntryId: entryId,
          projectId: assignment.projectId,
          allocationAmount: grossPay,
          allocationPercentage: 100,
          source: "DEFAULT_ASSIGNMENT",
        });
      }
    }
  }

  const currentPeriod = periods.find((period) => period.status === "OPEN")!;
  const currentWeekDays = Array.from({ length: 6 }, (_, index) => addDemoDays(weekStart, index + 1)).filter((date) => date <= anchorDate);
  const attendanceRecords: AttendanceRecord[] = [];
  for (const date of currentWeekDays) {
    for (let index = 0; index < workers.length; index += 1) {
      const worker = workers[index];
      let attendanceStatus: AttendanceRecord["attendanceStatus"] = "PRESENT";
      let paidDayFraction = 1;
      let regularMinutes = 480;
      let notes = "Confirmed demo attendance.";
      if (date === addDemoDays(anchorDate, -1) && index === 18) {
        attendanceStatus = "ABSENT";
        paidDayFraction = 0;
        regularMinutes = 0;
        notes = "Unplanned absence reported by site foreman.";
      } else if (date === anchorDate && index === 13) {
        attendanceStatus = "PARTIAL";
        paidDayFraction = 0.5;
        regularMinutes = 240;
        notes = "Half-day field duty.";
      } else if (date === addDemoDays(anchorDate, -2) && index === 24) {
        attendanceStatus = "ON_LEAVE";
        paidDayFraction = 1;
        regularMinutes = 0;
        notes = "Approved paid leave.";
      } else if (date === anchorDate && index === 1) {
        attendanceStatus = "OFFICIAL_BUSINESS";
        notes = "Client coordination and drainage inspection.";
      }
      attendanceRecords.push({
        id: `demo-attendance-${date}-${worker.id}`,
        companyId: DEMO_COMPANY_ID,
        workerId: worker.id,
        periodId: currentPeriod.id,
        attendanceDate: date,
        scheduledStart: "07:00",
        scheduledEnd: "16:00",
        scheduledMinutes: 480,
        breakMinutes: 60,
        actualTimeIn: attendanceStatus === "ABSENT" || attendanceStatus === "ON_LEAVE" ? undefined : "06:55",
        actualTimeOut: attendanceStatus === "ABSENT" || attendanceStatus === "ON_LEAVE" ? undefined : attendanceStatus === "PARTIAL" ? "12:00" : "16:05",
        regularMinutes,
        lateMinutes: index % 11 === 0 && attendanceStatus === "PRESENT" ? 8 : 0,
        undertimeMinutes: attendanceStatus === "PARTIAL" ? 240 : 0,
        overtimeMinutes: [5, 9, 15, 17].includes(index) && date === addDemoDays(anchorDate, -1) ? 120 : 0,
        paidDayFraction,
        attendanceStatus,
        recordStatus: "CONFIRMED",
        source: attendanceStatus === "ON_LEAVE" ? "LEAVE" : "MANUAL",
        notes,
        createdAt: demoTimestamp(date, 17, 5),
        updatedAt: demoTimestamp(date, 17, 10),
      });
    }
  }

  const overtimeRequests: OvertimeRequest[] = [
    [5, DEMO_PROJECT_IDS.warehouse, 180, "Warehouse concrete-pour overtime"],
    [9, DEMO_PROJECT_IDS.warehouse, 120, "Steel framing alignment and welding close-out"],
    [15, DEMO_PROJECT_IDS.solar, 150, "Access-road compaction before forecast rain"],
    [16, DEMO_PROJECT_IDS.drainage, 120, "Drainage emergency clearing and excavation"],
    [8, DEMO_PROJECT_IDS.solar, 90, "Electrical crossing installation overtime"],
  ].map(([workerIndex, projectId, minutes, reason], index) => ({
    id: `demo-overtime-${index + 1}`,
    companyId: DEMO_COMPANY_ID,
    workerId: workers[Number(workerIndex)].id,
    periodId: currentPeriod.id,
    overtimeDate: addDemoDays(anchorDate, -(index % 3)),
    projectId: String(projectId),
    laborContext: "PROJECT",
    requestedMinutes: Number(minutes),
    approvedMinutes: index === 4 ? 0 : Number(minutes),
    reason: String(reason),
    status: index === 4 ? "PENDING" : "APPROVED",
    approvedBy: index === 4 ? undefined : "demo-manager-miguel",
    approvedAt: index === 4 ? undefined : demoTimestamp(anchorDate, 10, 30),
    source: "MANUAL",
    createdAt: demoTimestamp(addDemoDays(anchorDate, -(index % 3)), 16, 30),
    updatedAt: demoTimestamp(anchorDate, 10, 30),
  }));

  const leaveRequests: LeaveRequest[] = [
    { id: "demo-leave-1", companyId: DEMO_COMPANY_ID, workerId: workers[24].id, leaveType: "Vacation Leave", startDate: addDemoDays(anchorDate, -2), endDate: addDemoDays(anchorDate, -2), partialDay: "FULL", paid: true, status: "APPROVED", notes: "Approved personal leave.", createdAt: demoTimestamp(addDemoDays(anchorDate, -14)), updatedAt: demoTimestamp(addDemoDays(anchorDate, -10)) },
    { id: "demo-leave-2", companyId: DEMO_COMPANY_ID, workerId: workers[11].id, leaveType: "Sick Leave", startDate: addDemoDays(anchorDate, 5), endDate: addDemoDays(anchorDate, 5), partialDay: "FULL", paid: true, status: "PENDING", notes: "Pending supervisor review.", createdAt: demoTimestamp(addDemoDays(anchorDate, -1)), updatedAt: demoTimestamp(addDemoDays(anchorDate, -1)) },
    { id: "demo-leave-3", companyId: DEMO_COMPANY_ID, workerId: workers[20].id, leaveType: "Emergency Leave", startDate: addDemoDays(anchorDate, -18), endDate: addDemoDays(anchorDate, -18), partialDay: "FULL", paid: false, status: "REJECTED", notes: "Insufficient supporting information in demo workflow.", createdAt: demoTimestamp(addDemoDays(anchorDate, -24)), updatedAt: demoTimestamp(addDemoDays(anchorDate, -20)) },
    { id: "demo-leave-4", companyId: DEMO_COMPANY_ID, workerId: workers[3].id, leaveType: "Vacation Leave", startDate: addDemoDays(anchorDate, 9), endDate: addDemoDays(anchorDate, 10), partialDay: "FULL", paid: true, status: "APPROVED", notes: "Approved in advance; project coverage arranged.", createdAt: demoTimestamp(addDemoDays(anchorDate, -20)), updatedAt: demoTimestamp(addDemoDays(anchorDate, -17)) },
  ];

  const workEntries: WorkEntry[] = [];
  for (const date of currentWeekDays) {
    workers.forEach((worker, index) => {
      if (worker.defaultPayType === "MONTHLY") return;
      const assignment = assignments.find((item) => item.workerId === worker.id && item.active);
      if (!assignment) return;
      const attendance = attendanceRecords.find((item) => item.workerId === worker.id && item.attendanceDate === date);
      if (!attendance || attendance.attendanceStatus === "ABSENT" || attendance.attendanceStatus === "ON_LEAVE") return;
      workEntries.push({
        id: `demo-work-${date}-${worker.id}`,
        workerId: worker.id,
        projectId: assignment.projectId,
        laborContext: "PROJECT",
        periodId: currentPeriod.id,
        workDate: date,
        regularHours: roundMoney(attendance.regularMinutes / 60),
        overtimeHours: roundMoney(attendance.overtimeMinutes / 60),
        daysWorked: worker.defaultPayType === "DAILY" ? attendance.paidDayFraction : undefined,
        rate: worker.defaultRate,
        overtimeRate: worker.defaultRate,
        description: `${worker.jobTitle || "Field worker"} — ${assignment.roleOnProject || "project duty"}`,
        status: "APPROVED",
      });
      void index;
    });
  }

  return {
    departments,
    workers,
    assignments,
    schedules: [schedule],
    compensationProfiles: [],
    recurringComponents: [],
    periods,
    runs,
    entries,
    allocations,
    workEntries,
    adjustments: [],
    attendanceRecords,
    leaveRequests,
    overtimeRequests,
    holidays: [],
  };
}
