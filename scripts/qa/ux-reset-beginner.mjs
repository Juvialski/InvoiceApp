import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Uses only the isolated repository-pinned browser runtime and synthetic /demo/app routes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(root, 'scripts/qa/browser-runtime/package.json'));
const { chromium } = require('playwright');
const base = process.env.UX_RESET_BASE_URL || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'This synthetic journey runner requires a local server.');
const output = path.join(root, 'artifacts/ux-reset-1');
await fs.mkdir(path.join(output, 'screenshots'), { recursive: true });
const diff = execFileSync('git', ['diff', 'HEAD', '--', 'src'], { cwd: root });
const source = { sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), dirtyRuntime: diff.length > 0, runtimeDiffSha256: createHash('sha256').update(diff).digest('hex') };
const allViewports = [{ name: 'desktop', width: 1920, height: 1080 }, { name: 'laptop', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }];
const viewports = allViewports.filter((viewport) => !process.env.UX_RESET_VIEWPORTS || process.env.UX_RESET_VIEWPORTS.split(',').includes(viewport.name));
const routes = ['dashboard', 'invoices', 'projects', 'workbook', 'warehouse', 'documents', 'expenses', 'cash', 'procurement', 'equipment', 'payroll', 'reports', 'email-sms', 'settings', 'vendors', 'extract', 'review'];
const browser = await chromium.launch({ headless: true });
const results = [];
const storageKey = 'engoryx:client-demo:v1';
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const steps = [];
    async function goto(route) { await page.goto(`${base}/demo/app/${route}`, { waitUntil: 'networkidle' }); }
    async function capture(state) {
      const screenshot = `screenshots/${viewport.name}-${state.replaceAll('/', '-')}.png`;
      await page.screenshot({ path: path.join(output, screenshot), fullPage: false });
      const geometry = await page.evaluate(() => ({ width: window.innerWidth, documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
      assert.ok(geometry.documentWidth <= geometry.width + 2, `${state}: horizontal page overflow`);
      steps.push({ state, route: new URL(page.url()).pathname + new URL(page.url()).search, viewport, screenshot, geometry });
    }
    try {
      for (const route of routes) { await goto(route); await capture(route); }
      await goto('dashboard');
      assert.equal(await page.locator('[data-home-task]').count(), 4);
      await page.locator('[data-home-task="add-bill"]').click();
      await page.getByRole('heading', { name: 'Add bill', exact: true }).waitFor();
      const upload = page.getByRole('button', { name: 'Choose bill files', exact: true });
      await upload.focus();
      await Promise.all([page.waitForEvent('filechooser'), upload.press('Enter')]);
      await goto('dashboard');
      await page.locator('[data-home-task="record-payment"]').click();
      await page.getByRole('heading', { name: 'Bills & Payments', exact: true }).waitFor();
      await page.getByRole('searchbox', { name: 'Search invoices', exact: true }).fill('BM-118204');
      await page.getByRole('button', { name: viewport.width < 1280 ? /Open invoice: BuildMix/ : /Open read-only: BuildMix/ }).click();
      await page.getByRole('button', { name: 'Record payment', exact: true }).waitFor();
      await capture('existing-bill-payment');

      // Seed unresolved evidence in this disposable browser session, then resolve using the actual UI.
      await page.evaluate((key) => {
        const d = JSON.parse(sessionStorage.getItem(key));
        const invoice = d.invoices.find((item) => item.id === 'demo-invoice-07');
        invoice.description = '';
        delete invoice.vendor.vendorId;
        delete invoice.entityResolution;
        invoice.duplicateStatus = 'POSSIBLE_DUPLICATE';
        sessionStorage.setItem(key, JSON.stringify(d));
      }, storageKey);
      await goto('review?invoiceId=demo-invoice-07');
      await page.getByRole('button', { name: 'Choose supplier', exact: true }).click();
      await page.locator('[data-testid="supplier-vendor-resolution"] input[data-supplier-field="vendor"]').fill('Axis');
      await page.getByRole('option', { name: /Axis Structural Services/ }).click();
      await page.getByRole('button', { name: 'Use this supplier', exact: true }).click();
      await page.getByRole('button', { name: 'Add description', exact: true }).click();
      await page.locator('[data-supplier-field="description"]').fill('Synthetic reviewed steel framing bill');
      await page.getByRole('button', { name: 'Save description', exact: true }).click();
      await page.getByRole('button', { name: 'Review possible duplicate', exact: true }).click();
      assert.equal(await page.locator('#supplier-invoice-review-notes[open]').count(), 1);
      await capture('issues-resolved');
      // Draft edits must be saved before confirmation; keyboard Escape restores the current value.
      const cell = page.locator('[data-worksheet-cell$=":invoiceNumber"]:visible').first();
      await cell.click();
      await cell.locator('input').fill('UX-RESET-UNSAVED');
      await page.keyboard.press('Enter');
      await page.getByText('Save worksheet edits before confirming this bill.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Confirm bill & next', exact: true }).isEnabled(), false);
      await page.getByRole('button', { name: 'Save worksheet edits', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm bill & next', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Confirm bill & next', exact: true }).click();
      const confirm = page.getByRole('button', { name: 'Confirm bill anyway', exact: true });
      await confirm.waitFor();
      await capture('confirmation-warning');
      await confirm.click();
      await page.getByRole('button', { name: 'Record payment', exact: true }).waitFor();
      const financial = await page.evaluate((key) => {
        const d = JSON.parse(sessionStorage.getItem(key));
        const invoice = d.invoices.find((item) => item.id === 'demo-invoice-07');
        return { status: invoice.reviewStatus, linkedExpenseId: invoice.linkedExpenseId, supplierId: invoice.entityResolution?.matchedEntityId, description: invoice.description, expenseCount: d.expenses.filter((item) => item.supplierInvoiceId === invoice.id && item.status !== 'VOID').length };
      }, storageKey);
      assert.equal(financial.status, 'VERIFIED');
      assert.equal(financial.expenseCount, 1);
      assert.equal(financial.supplierId, 'demo-vendor-subcontractor');
      assert.equal(financial.description, 'Synthetic reviewed steel framing bill');
      assert.ok(financial.linkedExpenseId.startsWith('demo-'));
      assert.equal(await page.getByRole('button', { name: 'Confirm bill & next', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Record payment', exact: true }).click();
      await page.locator('[data-testid="supplier-payment-dialog"]').waitFor();
      await page.getByRole('button', { name: 'Confirm Payment', exact: true }).waitFor();
      await capture('payment-workflow');
      // Deliberately stop before payment submission. Real settlement runtime is a hosted certification boundary.
      await goto('dashboard');
      await page.locator('[data-home-task="assign-stock"]').click();
      await page.getByRole('button', { name: 'Assign stock to a project', exact: true }).click();
      await page.getByRole('heading', { name: 'Issue to project', exact: true }).waitFor();
      await capture('stock-allocation');
      await goto('projects');
      await page.getByText('Quezon City Warehouse Expansion', { exact: true }).first().click();
      assert.match(page.url(), /projects\/demo-project-warehouse/);
      await capture('project-detail');
      await goto('dashboard');
      await page.locator('[data-home-task="open-workbook"]').click();
      await page.getByRole('heading', { name: 'Operations Workbook', exact: true }).waitFor();
      const projectName = page.locator('[data-worksheet-cell$=":projectName"][data-worksheet-editable="true"]:visible').first();
      await projectName.click();
      await projectName.locator('input').fill('Synthetic beginner worksheet edit');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Save demo edits', exact: true }).click();
      await page.getByText('Demo changes saved in this browser.', { exact: true }).waitFor();
      assert.match(await projectName.innerText(), /Synthetic beginner worksheet edit/);
      await capture('worksheet-saved');
      await goto('dashboard');
      if (viewport.width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      const more = page.getByRole('button', { name: 'More Tools', exact: true });
      await more.focus();
      await page.keyboard.press('Enter');
      assert.equal(await more.getAttribute('aria-expanded'), 'true');
      await capture('more-tools');
      await page.getByRole('button', { name: 'Procurement', exact: true }).click();
      assert.match(page.url(), /procurement/);
      assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
      results.push({ viewport, status: 'PASS', journeys: 8, financial, pageErrors, captures: steps });
      console.log(`PASS ${viewport.name}: beginner journeys and ${steps.length} captures`);
    } catch (error) {
      await page.screenshot({ path: path.join(output, `screenshots/${viewport.name}-failure.png`) }).catch(() => {});
      results.push({ viewport, status: 'FAIL', error: error.stack || String(error), pageErrors, captures: steps });
      console.error(`FAIL ${viewport.name}: ${error.stack || error}`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ source, environment: 'local isolated headless synthetic demo', productionWrites: false, results }, null, 2));
assert.ok(results.every((result) => result.status === 'PASS'), 'A beginner journey failed. Inspect artifacts/ux-reset-1/manifest.json.');
