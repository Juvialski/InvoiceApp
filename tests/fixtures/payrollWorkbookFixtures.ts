import type { PayrollCellValue } from "../../src/lib/payrollImport.ts";

export const projectSiteTemplateRows: PayrollCellValue[][] = [
  ["PROJECT NAME: North River Pump Station"],
  ["PROJECT LOCATION: San Pedro, Laguna"],
  ["PERIOD COVERED: August 18, 2026 - August 23, 2026"],
  ["PROJECT-IN-CHARGE/FOREMAN: Alex Rivera", null, null, null, null, null, "CONTACT NUMBER: 0917 555 0101"],
  [null, "NAME", "POSITION", "DAILY SALARY", "NUMBER OF WORK-DAYS", "AMOUNT", "NUMBER OF HOURS-OVERTIME", "AMOUNT", "TOTAL AMOUNT"],
  [1, "Mara Santos", "Site Engineer", "₱750.00", 5, 3_750, 4, 500, 4_250],
  ["GRAND TOTAL", null, null, null, null, 3_750, null, 500, 4_250],
];

export const adminOfficeTemplateRows: PayrollCellValue[][] = [
  ["ADMINISTRATIVE/OFFICE"],
  ["PERIOD COVERED: 08/18/2026 - 08/23/2026"],
  ["NO.", "NAME", "POSITION", "DAILY RATE", "NUMBER OF WORK-DAYS", "AMOUNT", "NUMBER OF HOURS-OVERTIME", "AMOUNT", "TOTAL AMOUNT"],
  [1, "Noel Cruz", "Office Administrator", "PHP 800", 5, 4_000, 2, 300, 4_300],
  [2, null, null, null, null, null, null, null, null],
  ["GRAND TOTAL", null, null, null, null, 4_000, null, 300, 4_300],
];

export const reorderedCsv = [
  "EMPLOYEE,NOTES,OT HOURS,AMOUNT,DAILY RATE,DAYS WORKED,AMOUNT,TOTAL AMOUNT,UNUSED CLIENT FIELD",
  '"Dela Cruz, Ana",Night shift,2,"₱300.00","₱1,000.00",5,"₱5,000.00","₱5,300.00",retain raw',
  "GRAND TOTAL,,,,,,5000,5300,",
].join("\n");
