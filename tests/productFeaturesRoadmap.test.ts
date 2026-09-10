import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CLIENT_PRODUCT_FEATURES,
  getProductFeatureById,
  PRODUCT_FEATURE_STATUS_LABELS,
  type ProductFeatureCategory,
} from "../src/config/productFeatures.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("client product roadmap covers the current and approved future status model", () => {
  assert.ok(CLIENT_PRODUCT_FEATURES.length > 0);
  assert.deepEqual(
    new Set(CLIENT_PRODUCT_FEATURES.map((feature) => feature.status)),
    new Set(["AVAILABLE", "PLANNED", "FUTURE_DESIGN"]),
  );
  assert.deepEqual(PRODUCT_FEATURE_STATUS_LABELS, {
    AVAILABLE: "Available",
    PLANNED: "Planned",
    FUTURE_DESIGN: "Future / Design Stage",
  });

  const availableCategories = new Set(CLIENT_PRODUCT_FEATURES.filter((feature) => feature.status === "AVAILABLE").map((feature) => feature.category));
  const expectedAvailableCategories: readonly ProductFeatureCategory[] = [
    "Projects & Operations",
    "Project Financial Visibility",
    "Supplier Invoices & Expenses",
    "Client Billing & Collections",
    "Cash & Banking",
    "Payroll & Workforce",
    "Procurement",
    "Engineering & Field Operations",
    "Warehouse & Inventory",
    "Equipment",
    "Reporting & Oversight",
    "Email & Document Intake",
    "AI Assistance",
    "Access & Administration",
  ];
  for (const category of expectedAvailableCategories) assert.ok(availableCategories.has(category), `missing available category: ${category}`);
});

test("supplier payment feature truth reflects the inline linked-Expense workflow", () => {
  const supplierFeature = getProductFeatureById("supplier-invoices-expenses");
  assert.equal(supplierFeature?.status, "AVAILABLE");
  const text = JSON.stringify(supplierFeature);
  assert.match(text, /Change Status/);
  assert.match(text, /full or partial payment/i);
  assert.match(text, /linked-Expense settlement evidence/i);
  assert.match(text, /Cash & Banking remains available for deeper reconciliation/i);
  assert.doesNotMatch(text, /continue to Cash & Banking without searching/i);
});

test("approved next and future items are explicit and do not imply unfinished access", () => {
  const templates = getProductFeatureById("company-document-templates");
  assert.equal(templates?.status, "AVAILABLE");
  assert.match(JSON.stringify(templates), /editable DOCX|immutable snapshot|mapping/i);
  assert.equal(getProductFeatureById("email-sms-documents-improvements")?.status, "PLANNED");
  assert.equal(getProductFeatureById("worker-registration")?.status, "PLANNED");
  assert.equal(getProductFeatureById("site-attendance")?.status, "PLANNED");
  assert.equal(getProductFeatureById("face-recognition-attendance")?.status, "FUTURE_DESIGN");

  const workerRegistration = getProductFeatureById("worker-registration");
  assert.match(JSON.stringify(workerRegistration), /QR|pending|supervisor|approval/i);
  const siteAttendance = getProductFeatureById("site-attendance");
  assert.match(JSON.stringify(siteAttendance), /time-in|time-out|duplicate-punch|correction/i);
  const faceAttendance = getProductFeatureById("face-recognition-attendance");
  assert.match(JSON.stringify(faceAttendance), /not currently active|privacy|consent|liveness|manual fallback/i);

  const roadmapText = JSON.stringify(CLIENT_PRODUCT_FEATURES);
  assert.doesNotMatch(roadmapText, /PR\s*#|migration|CI\/workflow|QA certification|Git SHA|Codex|subagent|\bRPC\b|\bRLS\b|service_role|test command/i);
  assert.doesNotMatch(roadmapText, /\b20\d\d[-/]\d\d/);
});

test("Settings mounts the client-facing roadmap as an informational surface", () => {
  const settings = source("src/components/Settings.tsx");
  const roadmap = source("src/components/ProductFeaturesRoadmap.tsx");
  assert.match(settings, /ProductFeaturesRoadmap/);
  assert.match(roadmap, /Hydroqualisense Features & Roadmap/);
  assert.match(roadmap, /Planned and future cards describe direction only/);
  assert.match(roadmap, /data-product-feature-status/);
  assert.doesNotMatch(roadmap, /onClick=|<button\b/);
});
