import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Header } from "../src/components/Header.tsx";
import { InvoiceDirectory } from "../src/components/InvoiceDirectory.tsx";
import { InvoiceDirectoryReadOnly } from "../src/components/InvoiceDirectoryReadOnly.tsx";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import type { WorkspaceSyncStatus } from "../src/lib/workspaceSync.ts";

function renderHeader(workspaceSyncStatus: WorkspaceSyncStatus, collapsed = false) {
  return renderToStaticMarkup(createElement(Header, {
    activeTab: "dashboard",
    setActiveTab: () => undefined,
    invoicesCount: 7,
    reviewCount: 2,
    workspaceSyncStatus,
    accountEmail: "operator@example.com",
    onSignOut: () => undefined,
    collapsed,
  }));
}

function headerMarkup(markup: string) {
  return markup.match(/<header data-app-shell-header="true"[\s\S]*?<\/header>/)?.[0] || "";
}

function sidebarMarkup(markup: string) {
  return markup.match(/<aside[\s\S]*?<\/aside>/)?.[0] || "";
}

test("desktop identity and account actions live in the sidebar while the narrow header only opens navigation", () => {
  const markup = renderHeader("synced");
  const header = headerMarkup(markup);
  const sidebar = sidebarMarkup(markup);

  assert.ok(header, "the mobile navigation header remains rendered");
  assert.match(header, /aria-label="Open navigation"/);
  assert.match(header, /lg:hidden/);
  assert.doesNotMatch(header, /HydroQualiSense|Hydroqualisense|Dashboard|Export|Synced|operator@example\.com/);
  assert.match(sidebar, /operator@example\.com/);
  assert.match(sidebar, /Log out/);
  assert.doesNotMatch(header, /aria-label="Account menu"/);
});

test("successful sync is silent while temporary syncing and offline states remain visible", () => {
  const syncedHeader = headerMarkup(renderHeader("synced"));
  const syncingHeader = headerMarkup(renderHeader("syncing"));
  const offlineHeader = headerMarkup(renderHeader("offline"));

  assert.doesNotMatch(syncedHeader, /Synced|sync-status/);
  assert.match(syncingHeader, /Syncing/);
  assert.match(offlineHeader, /Offline/);
});

test("collapsed sidebar keeps an accessible account control", () => {
  const sidebar = sidebarMarkup(renderHeader("synced", true));
  assert.match(sidebar, /aria-label="Account: operator@example\.com"/);
});

test("invoice register keeps batch export beside its own upload action", () => {
  const markup = renderToStaticMarkup(createElement(InvoiceDirectory, {
    invoices: [],
    onSelectInvoice: () => undefined,
    onAddNew: () => undefined,
    onExportInvoicesExcel: () => undefined,
  } as never));

  assert.match(markup, /Upload supplier invoice/);
  assert.match(markup, /Export invoices to Excel/);
});

test("authorized read-only invoice register can export, while missing capability hides the action", () => {
  const withExport = renderToStaticMarkup(createElement(InvoiceDirectoryReadOnly, {
    invoices: [],
    onSelectInvoice: () => undefined,
    onExportInvoicesExcel: () => undefined,
  } as never));
  const withoutExport = renderToStaticMarkup(createElement(InvoiceDirectoryReadOnly, {
    invoices: [],
    onSelectInvoice: () => undefined,
  }));

  assert.match(withExport, /Export invoices to Excel/);
  assert.doesNotMatch(withoutExport, /Export invoices to Excel/);
});

test("read-only invoice register renders a touch-readable phone card path", () => {
  const invoices = createDemoWorkspace().invoices.slice(0, 1);
  const markup = renderToStaticMarkup(createElement(InvoiceDirectoryReadOnly, {
    invoices,
    onSelectInvoice: () => undefined,
    onExportInvoicesExcel: () => undefined,
  }));

  assert.match(markup, /data-invoice-mobile-card="true"/);
  assert.match(markup, /xl:hidden/);
});
