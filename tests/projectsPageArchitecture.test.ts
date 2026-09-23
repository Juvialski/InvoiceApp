import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const projectsPagePath = new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url);
const projectRegisterSectionPath = new URL(
  "../src/components/projects/ProjectPortfolioRegisterSection.tsx",
  import.meta.url,
);
const operationsGridPath = new URL("../src/components/ui/OperationsGrid.tsx", import.meta.url);
const projectDetailsWorksheetPath = new URL("../src/components/projects/ProjectDetailsWorksheet.tsx", import.meta.url);

function readIfPresent(path: URL): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

test("projects portfolio and register presentation has explicit architectural boundaries", () => {
  const projectsPage = readIfPresent(projectsPagePath);
  const projectRegisterSection = readIfPresent(projectRegisterSectionPath);
  const operationsGrid = readIfPresent(operationsGridPath);
  const projectDetailsWorksheet = readIfPresent(projectDetailsWorksheetPath);

  assert.ok(projectsPage, "ProjectsPage.tsx must exist");
  assert.ok(projectRegisterSection, "ProjectPortfolioRegisterSection.tsx must exist");
  assert.ok(projectDetailsWorksheet, "ProjectDetailsWorksheet.tsx must exist");

  // 1. ProjectsPage imports and renders the new register section
  assert.match(
    projectsPage,
    /import\s+\{\s*ProjectPortfolioRegisterSection[\s\S]*?\}\s+from\s+"\.\/ProjectPortfolioRegisterSection\.tsx"/,
  );
  assert.match(projectsPage, /<ProjectPortfolioRegisterSection\b/);
  assert.match(projectsPage, /const\s+PROJECT_STATUSES:\s*readonly\s+ProjectStatus\[\]/);
  assert.match(projectsPage, /projectStatuses=\{PROJECT_STATUSES\}/);
  assert.doesNotMatch(projectRegisterSection, /export\s+const\s+PROJECT_STATUSES/);

  // 2. Authoritative project management derivation remains in ProjectsPage.tsx
  assert.match(projectsPage, /buildProjectManagementView\(/);
  assert.match(projectsPage, /buildPortfolioManagementSummary\(/);
  assert.match(projectsPage, /filterAndSortProjectViews\(/);
  assert.match(projectsPage, /managerOptions\s*=\s*useMemo/);
  assert.match(projectsPage, /currencyOptions\s*=\s*useMemo/);

  // 3. Project editing remains in the parent
  assert.match(projectsPage, /const\s+\[editing,\s*setEditing\]\s*=\s*useState/);
  assert.match(projectsPage, /ProjectDetailsWorksheet/);
  assert.match(projectsPage, /isClassifiedProjectTaxTreatment/);
  assert.doesNotMatch(projectsPage, /project-dialog-title/);
  assert.match(projectDetailsWorksheet, /WorksheetEditor/);
  assert.match(projectDetailsWorksheet, /Project Code/);
  assert.match(projectDetailsWorksheet, /Project Name/);
  assert.match(projectDetailsWorksheet, /Tax Treatment/);
  assert.match(projectDetailsWorksheet, /Status/);

  // 4. Lifecycle orchestration remains in the parent
  assert.match(projectsPage, /const\s+openLifecycle\s*=/);
  assert.match(projectsPage, /const\s+applyLifecycle\s*=/);
  assert.match(projectsPage, /const\s+closeLifecycle\s*=/);
  assert.match(projectsPage, /role="dialog"[\s\S]*?aria-labelledby="project-lifecycle-title"/);

  // 5. New register component does NOT import project persistence / lifecycle modules or internal dialog focus
  assert.doesNotMatch(
    projectRegisterSection,
    /from\s+["']\.\.\/\.\.\/lib\/projects(?:\.ts)?["']/,
  );
  assert.doesNotMatch(
    projectRegisterSection,
    /from\s+["']\.\.\/ui\/useDialogFocus(?:\.ts)?["']/,
  );
  assert.doesNotMatch(
    projectRegisterSection,
    /from\s+["']\.\.\/\.\.\/app\/AppPermissionContext(?:\.tsx)?["']/,
  );

  // 6. The new component owns register, table, card, and filter presentation
  assert.match(projectRegisterSection, /function\s+ProjectRegisterCard\b/);
  assert.match(projectRegisterSection, /export\s+function\s+ProjectPortfolioRegisterSection\b/);
  assert.match(projectRegisterSection, /aria-label="Portfolio Management Summary"/);
  assert.match(projectRegisterSection, /aria-label="Projects table"/);
  assert.match(projectRegisterSection, /aria-label="Projects list cards"/);
  assert.match(projectRegisterSection, /ariaLabel:\s*"Search projects"/);
  assert.match(projectRegisterSection, /CompactActionBar/);
  assert.match(projectRegisterSection, /countActiveFilters/);
  assert.match(projectRegisterSection, /activeFilterValues/);
  assert.match(projectRegisterSection, /Filter by project manager/);
  assert.match(projectRegisterSection, /Filter by project currency/);
  assert.match(projectRegisterSection, /Filter by financial health and attention signals/);
  assert.match(projectRegisterSection, /Filter by attention category/);
  assert.match(projectRegisterSection, /onClearAll=\{activeFilterCount > 0 \? onClearFilters : undefined\}/);
  assert.match(projectRegisterSection, /OperationsGrid/);
  assert.match(operationsGrid, /data-operations-grid/);
  assert.match(operationsGrid, /data-field-protected/);

  // 7. The register uses the shared grid while keeping the domain parent-owned
  assert.match(projectRegisterSection, /import\s+\{\s*OperationsGrid\s*\}/);
  assert.match(projectRegisterSection, /onRowActivate/);
  assert.match(projectRegisterSection, /protected:\s*true/);
});

test("Project cards keep identity prominent and cards/list share the same filtered, sorted views", () => {
  const cardsAndList = readIfPresent(projectRegisterSectionPath);
  assert.ok(/projectMonogram\(/.test(cardsAndList), "project cards should use a deterministic identity mark");
  assert.ok(/data-project-identity-mark/.test(cardsAndList), "the identity mark should be accessible for visual QA");
  assert.ok(/h3 className="hqs-primary-text[^"]*text-lg/.test(cardsAndList), "the project name should be visually dominant");
  assert.ok(/line-clamp-2/.test(cardsAndList), "project names should wrap before truncating");
  assert.ok(/aria-label="Project status and attention"/.test(cardsAndList), "status and attention should not compress project identity");
  for (const label of ["Contract Value", "Approved Project Budget", "Actual Cost", "Committed Cost"]) {
    assert.ok(cardsAndList.includes(label), `${label} should retain its distinct financial meaning`);
  }
  assert.ok(/<ProjectPortfolioOperationsGrid displayedViews=\{displayedViews\}/.test(cardsAndList), "Compact List should use the filtered views");
  assert.ok(/displayedViews\.map\(\(view\) => <ProjectRegisterCard/.test(cardsAndList), "Cards should use the same filtered views");
});
