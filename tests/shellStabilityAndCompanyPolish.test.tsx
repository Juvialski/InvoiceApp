import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanySwitcher } from "../src/components/access/AccessStates.tsx";
import { Settings } from "../src/components/Settings.tsx";
import { RouteLoadingSkeleton } from "../src/components/ui/RouteSkeleton.tsx";
import { AppPermissionProvider } from "../src/app/AppPermissionContext.tsx";
import { DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "../src/config/regional.ts";
import type { CompanySummary } from "../src/lib/companyAccess.ts";

test("CompanySwitcher renders short and long company names with multi-line wrapping and accessibility attributes", () => {
  const shortCompany: CompanySummary = {
    id: "comp-1",
    name: "Acme Corp",
    status: "ACTIVE",
    defaultCurrency: "PHP",
    timezone: "Asia/Manila",
  };
  const longCompany: CompanySummary = {
    id: "comp-2",
    name: "HYDROQUALISENSE SOLUTIONS CORP · Heavy Industrial & Marine Systems",
    status: "ACTIVE",
    defaultCurrency: "PHP",
    timezone: "Asia/Manila",
  };

  // Test expanded view with long name
  const expandedMarkup = renderToStaticMarkup(
    <CompanySwitcher companies={[longCompany]} activeCompanyId="comp-2" collapsed={false} />
  );
  assert.match(expandedMarkup, /HYDROQUALISENSE SOLUTIONS CORP/);
  assert.match(expandedMarkup, /line-clamp-2/);
  assert.match(expandedMarkup, /break-words/);
  assert.match(expandedMarkup, /aria-label="Deployment company: HYDROQUALISENSE SOLUTIONS CORP/);

  // Test collapsed view with short name
  const collapsedMarkup = renderToStaticMarkup(
    <CompanySwitcher companies={[shortCompany]} activeCompanyId="comp-1" collapsed={true} />
  );
  assert.match(collapsedMarkup, /aria-label="Deployment company: Acme Corp"/);
  assert.match(collapsedMarkup, /title="Deployment company: Acme Corp"/);
  assert.doesNotMatch(collapsedMarkup, /line-clamp-2/);
});

test("Settings component renders full-width layout without max-w-7xl constraint", () => {
  const settings = {
    country: DEFAULT_COUNTRY,
    locale: DEFAULT_LOCALE,
    currency: DEFAULT_CURRENCY,
    timezone: DEFAULT_TIMEZONE,
  };
  const markup = renderToStaticMarkup(
    <Settings settings={settings} onChange={() => {}} showDeploymentAccessManagement={false} />
  );
  assert.match(markup, /Operational settings/);
  assert.doesNotMatch(markup, /max-w-7xl/);
});

test("RouteLoadingSkeleton renders with accessible loading status and structured skeletons", () => {
  const markup = renderToStaticMarkup(<RouteLoadingSkeleton />);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-label="Loading workspace page"/);
  assert.match(markup, /animate-pulse/);
});

test("AppPermissionProvider resolves stable completeness when workspaceDataPending is true", () => {
  const markup = renderToStaticMarkup(
    <AppPermissionProvider
      permissions={["projects.read", "invoices.read", "expenses.read", "payroll.read"]}
      workspaceDataPending={true}
    >
      <div data-testid="child">Loaded</div>
    </AppPermissionProvider>
  );
  assert.match(markup, /Loaded/);
});
