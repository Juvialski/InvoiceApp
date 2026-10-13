import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd();
const require = createRequire(path.join(root, 'scripts/qa/browser-runtime/package.json'));
const { chromium } = require('playwright');
const base = process.env.UX_RESET_BASE_URL || 'http://127.0.0.1:3012';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = path.join(root, 'artifacts/ux-reset-2');
await fs.mkdir(output, { recursive: true });
const diff = execFileSync('git', ['diff', 'HEAD', '--', 'src'], { cwd: root });
const manifest = { sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), runtimeDiffSha256: createHash('sha256').update(diff).digest('hex'), environment: 'Local isolated headless synthetic Demo QA; no hosted or production writes', captures: [], journeys: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ name: 'desktop', width: 1920, height: 1080 }, { name: 'laptop', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }].filter((v) => !process.env.UX_RESET_VIEWPORTS || process.env.UX_RESET_VIEWPORTS.split(',').includes(v.name))) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const goto = async (route) => { await page.goto(`${base}/demo/app/${route}`, { waitUntil: 'networkidle' }); };
    const capture = async (state) => {
      const filename = `${viewport.name}-${state}.png`;
      await page.screenshot({ path: path.join(output, filename) });
      const geometry = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(geometry.scrollWidth <= geometry.width + 2, `${state}: viewport overflow`);
      const entry = { filename, viewport, route: page.url(), state, geometry };
      const previous = manifest.captures.findIndex((item) => item.filename === filename);
      if (previous >= 0) manifest.captures[previous] = entry; else manifest.captures.push(entry);
    };
    let stagedRowId;
    const addRow = async () => {
      await page.getByRole('button', { name: 'Add row', exact: true }).click();
      const remove = page.locator('[data-worksheet-remove-row]:visible').last();
      await remove.waitFor();
      stagedRowId = await remove.getAttribute('data-worksheet-remove-row');
    };
    const cell = (key) => page.locator(`[data-worksheet-cell="${stagedRowId}:${key}"]:visible`);
    const edit = async (key, value) => { if (!await cell(key).locator('input,select').count()) await cell(key).click(); const input = cell(key).locator('input,select'); if (await input.evaluate((node) => node.tagName === 'SELECT')) await input.selectOption(value); else { await input.fill(value); await input.press('Enter'); } };
    const save = async () => { await page.getByRole('button', { name: 'Save changes', exact: true }).click(); try { await page.getByRole('dialog', { name: 'Review changes' }).waitFor(); } catch (error) { await page.screenshot({ path: path.join(output, `${viewport.name}-save-failure.png`) }); console.log((await page.locator('[data-operations-workbook]').innerText()).slice(0, 5000)); throw error; } await capture('workbook-review'); await page.getByRole('button', { name: 'Confirm save', exact: true }).click(); await page.getByRole('dialog', { name: 'Review changes' }).waitFor({ state: 'hidden' }); await page.getByText(/row.*saved\.$/).waitFor(); };
    for (const route of ['dashboard', 'invoices', 'warehouse', 'projects', 'documents', 'workbook']) { await goto(route); await capture(route); }
    if (viewport.name === 'mobile') await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'More Tools', exact: true }).click(); await capture('more-tools');
    await goto('workbook');
    if (viewport.name === 'desktop') {
      await page.getByText('Import / export', { exact: true }).click();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download workbook', exact: true }).click();
      const download = await downloadEvent;
      await page.getByLabel('Import combined Operations Workbook').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await fs.readFile(await download.path()) });
      await page.getByRole('button', { name: 'Cancel review', exact: true }).waitFor();
      await capture('xlsx-v1-review');
      await page.getByRole('button', { name: 'Cancel review', exact: true }).click();
      manifest.journeys.push({ viewport: 'desktop', journey: 'Real legacy combined XLSX download and import review', result: 'PASS' });
    }
    await goto('review?invoiceId=demo-invoice-07'); await capture('invoice-review');
    await goto('workbook?sheet=vendors');
    const supplier = `Workbook Supplier ${viewport.name}`;
    await addRow();
    await page.locator('[data-worksheet-editor] input:visible').last().waitFor();
    await capture('workbook-add-row');
    await edit('email', 'invalid-email');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await capture('workbook-validation');
    await edit('name', supplier); await edit('email', `${viewport.name}@example.test`);
    await save();
    await page.reload({ waitUntil: 'networkidle' });
    assert.ok(await page.getByText(supplier, { exact: true }).count());
    const savedKey = await page.locator('[data-worksheet-cell$=":name"]:visible').filter({ hasText: supplier }).getAttribute('data-worksheet-cell');
    const savedCell = page.locator(`[data-worksheet-cell="${savedKey}"]:visible`);
    await savedCell.click(); await savedCell.locator('input').fill(`${supplier} Updated`); await page.keyboard.press('Enter');
    await save(); await page.reload({ waitUntil: 'networkidle' });
    assert.ok(await page.getByText(`${supplier} Updated`, { exact: true }).count());
    await addRow(); await edit('name', `${supplier} Two`);
    await addRow(); await edit('name', `${supplier} Three`); await save();
    await page.reload({ waitUntil: 'networkidle' });
    const data = await page.evaluate(() => JSON.parse(sessionStorage.getItem('engoryx:client-demo:v1')));
    assert.equal(data.vendors.filter((row) => row.name.startsWith(supplier)).length, 3);
    manifest.journeys.push({ viewport: viewport.name, journey: 'Supplier additions, invalid-field correction, edit, multiple rows and reload', result: 'PASS' });
    await goto('workbook?sheet=cost-codes');
    await addRow();
    const projects = await cell('projectId').locator('select').locator('option').evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
    await edit('projectId', projects[0]); await edit('code', `WB-${viewport.name}`); await edit('name', 'Workbook Work Package'); await save();
    await page.reload({ waitUntil: 'networkidle' }); assert.ok(await page.getByText(`WB-${viewport.name}`, { exact: true }).count());
    await goto('workbook?sheet=expenses'); await addRow();
    await edit('description', `Workbook Direct Expense ${viewport.name}`); await edit('projectId', projects[0]); await edit('category', 'Fuel'); await edit('amount', '125'); await save();
    await page.reload({ waitUntil: 'networkidle' });
    const expense = await page.evaluate((name) => JSON.parse(sessionStorage.getItem('engoryx:client-demo:v1')).expenses.find((row) => row.description === name), `Workbook Direct Expense ${viewport.name}`);
    assert.equal(expense.status, 'DRAFT'); assert.equal(expense.amount, 125); assert.equal(expense.projectId, projects[0]); assert.equal(expense.supplierInvoiceId, undefined);
    await goto('workbook?sheet=warehouse'); await addRow();
    await edit('itemName', `Workbook Item ${viewport.name}`); await edit('itemCode', `WB-${viewport.name}`); await save();
    await page.reload({ waitUntil: 'networkidle' }); assert.ok(await page.getByText(`Workbook Item ${viewport.name}`, { exact: true }).count());
    const stock = await page.evaluate((name) => { const data = JSON.parse(sessionStorage.getItem('engoryx:client-demo:v1')); const item = data.inventoryItems.find((row) => row.itemName === name); return data.inventoryMovements.filter((row) => row.inventoryItemId === item.id).length; }, `Workbook Item ${viewport.name}`);
    assert.equal(stock, 0);
    assert.equal(await page.locator('[data-worksheet-cell$=":onHandQuantity"][data-worksheet-editable="true"]').count(), 0);
    manifest.journeys.push({ viewport: viewport.name, journey: 'Cost code, draft expense and zero-stock item creation with reload', result: 'PASS' });
    await goto('workbook?sheet=supplier-invoices'); await capture('supplier-invoices');
    await page.getByRole('button', { name: 'Edit bill', exact: true }).first().click(); assert.match(page.url(), /review\?invoiceId=/);
    await goto('workbook?sheet=vendors'); await addRow(); await edit('name', 'Discard me');
    page.once('dialog', (dialog) => dialog.dismiss()); await page.getByRole('tab', { name: 'Warehouse', exact: true }).click(); assert.match(page.url(), /sheet=vendors/);
    await page.getByRole('button', { name: 'Discard edits', exact: true }).click(); assert.equal(await page.getByText('Discard me', { exact: true }).count(), 0);
    await goto('workbook?sheet=warehouse');
    await page.getByRole('button', { name: 'Stock In', exact: true }).click();
    await page.getByRole('dialog').waitFor(); await capture('stock-in-workflow');
    assert.match(page.url(), /task=receive/);
    await goto('workbook?sheet=projects');
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    await page.getByRole('dialog').waitFor(); await capture('project-setup-workflow');
    await context.close(); assert.deepEqual(errors, []);
  }
  for (const viewport of [{ name: 'laptop', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }].filter((v) => !process.env.UX_RESET_VIEWPORTS || process.env.UX_RESET_VIEWPORTS.split(',').includes(v.name))) {
    const context = await browser.newContext({ viewport, colorScheme: 'dark' });
    const page = await context.newPage();
    for (const route of ['dashboard', 'invoices', 'review?invoiceId=demo-invoice-07', 'workbook?sheet=vendors', 'warehouse', 'documents']) {
      await page.goto(`${base}/demo/app/${route}`, { waitUntil: 'networkidle' });
      const filename = `dark-${viewport.name}-${route.split('?')[0]}.png`;
      await page.screenshot({ path: path.join(output, filename) });
      manifest.captures.push({ filename, viewport, route: page.url(), state: route, theme: 'dark' });
    }
    await context.close();
  }
} finally { await browser.close(); await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2)); }
console.log(JSON.stringify({ captures: manifest.captures.length, journeys: manifest.journeys, output }));
