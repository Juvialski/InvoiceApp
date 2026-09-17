import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BRAND, formatBreadcrumb, formatPageTitle } from '../src/config/brand.ts';
import { PRODUCT_FEATURE_REGISTRY, getFeaturesByPhase, getFeaturesByStatus, getFeatureById } from '../src/features/registry.ts';

test('brand configuration contains canonical Hydroqualisense values', () => {
  assert.equal(BRAND.productName, 'Hydroqualisense');
  assert.equal(BRAND.shortName, 'Hydroqualisense');
  assert.equal(BRAND.companyName, 'Hydroqualisense Solutions Corp.');
  assert.equal(BRAND.logoPath, '/brand/hydroqualisense-logo.png');
  assert.equal(BRAND.displayUppercase, 'Hydroqualisense');
  assert.equal(BRAND.canonicalOrigin, 'https://hydroqualisense.com');
  assert.equal(BRAND.tagline, 'Hydroqualisense Solutions Corp.');
  assert.equal(BRAND.assistantName, 'Hydroqualisense Assistant');
  assert.equal(BRAND.browserTitle, 'Hydroqualisense | Hydroqualisense Solutions Corp.');
  assert.match(BRAND.description, /Hydroqualisense is a business operations platform/i);
  assert.match(BRAND.description, /projects.*procurement.*supplier invoices.*finance.*documents.*payroll.*inventory.*equipment.*business communications/i);
  assert.match(BRAND.footerText, /Hydroqualisense Solutions Corp\./);
  assert.equal(BRAND.companyContextLabel, 'Hydroqualisense Solutions Corp. workspace');
});

test('page title and breadcrumb formatting helpers produce correct branded labels', () => {
  assert.equal(formatPageTitle(), 'Hydroqualisense | Hydroqualisense Solutions Corp.');
  assert.equal(formatPageTitle('Projects'), 'Projects | Hydroqualisense');
  assert.equal(formatPageTitle('Cash and Banking'), 'Cash and Banking | Hydroqualisense');

  assert.equal(formatBreadcrumb(), 'Hydroqualisense');
  assert.equal(formatBreadcrumb('Invoices'), 'Hydroqualisense / Invoices');
  assert.equal(formatBreadcrumb('Payroll'), 'Hydroqualisense / Payroll');
});

test('repository and live UI entry points use the current Hydroqualisense identity', () => {
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /<title>Hydroqualisense \| Hydroqualisense Solutions Corp\.<\/title>/);
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/hydroqualisense\.com" \/>/);
  assert.match(indexHtml, /<meta property="og:url" content="https:\/\/hydroqualisense\.com" \/>/);
  assert.doesNotMatch(indexHtml, /My Google AI Studio App/);

  const metadataJson = JSON.parse(readFileSync(new URL('../metadata.json', import.meta.url), 'utf8'));
  assert.equal(metadataJson.name, 'Hydroqualisense');
  assert.match(metadataJson.description, /Hydroqualisense is a business operations platform/i);
  assert.match(metadataJson.description, /projects.*procurement.*supplier invoices.*finance.*documents.*payroll.*inventory.*equipment.*business communications/i);

  const pkgJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkgJson.name, 'hydroqualisense');
  assert.match(pkgJson.scripts['astryx:theme'], /hydroqualisenseTheme\.ts/);
  assert.match(pkgJson.scripts['astryx:theme'], /hydroqualisense\.css/);
  assert.doesNotMatch(pkgJson.scripts['astryx:theme'], /engoryx/i);

  const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const uiIndexSource = readFileSync(new URL('../src/ui/index.ts', import.meta.url), 'utf8');
  const providerSource = readFileSync(new URL('../src/ui/HydroqualisenseThemeProvider.tsx', import.meta.url), 'utf8');
  const themeSource = readFileSync(new URL('../src/ui/hydroqualisenseTheme.ts', import.meta.url), 'utf8');
  const iconSource = readFileSync(new URL('../src/ui/icons.ts', import.meta.url), 'utf8');
  const appCssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const authorizationSource = readFileSync(new URL('../src/server/auth/serverAuthorization.ts', import.meta.url), 'utf8');
  const extractionSource = readFileSync(new URL('../src/server/invoiceExtraction/invoiceExtractionRouter.ts', import.meta.url), 'utf8');

  assert.match(mainSource, /HydroqualisenseThemeProvider/);
  assert.doesNotMatch(mainSource, /EngoryxThemeProvider/);
  assert.match(uiIndexSource, /hydroqualisenseTheme/);
  assert.match(uiIndexSource, /hydroqualisenseIconRegistry/);
  assert.doesNotMatch(uiIndexSource, /engoryx/i);
  assert.match(providerSource, /hydroqualisenseTheme/);
  assert.doesNotMatch(providerSource, /engoryx/i);
  assert.match(themeSource, /name: "hydroqualisense"/);
  assert.doesNotMatch(themeSource, /engoryx/i);
  assert.match(iconSource, /hydroqualisenseIconRegistry/);
  assert.doesNotMatch(iconSource, /engoryx/i);
  assert.match(appCssSource, /\.\/ui\/hydroqualisense\.css/);
  assert.doesNotMatch(appCssSource, /engoryx\.css/i);
  assert.match(authorizationSource, /A valid Hydroqualisense session is required/);
  assert.match(authorizationSource, /another Hydroqualisense deployment company/);
  assert.match(extractionSource, /standard Hydroqualisense categories/);
  assert.doesNotMatch(serverSource, /InvoiceApp session|Engoryx deployment company|standard Engoryx categories/);

  assert.equal(existsSync(new URL('../src/ui/hydroqualisense.css', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/ui/hydroqualisense.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/ui/hydroqualisense.d.ts', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/ui/engoryxTheme.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/ui/EngoryxThemeProvider.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/ui/engoryx.css', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/ui/engoryx.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/ui/engoryx.d.ts', import.meta.url)), false);
});

test('feature registry covers all operational and roadmap engineering phases', () => {
  assert.ok(PRODUCT_FEATURE_REGISTRY.length >= 8);

  const phase0 = getFeaturesByPhase(0);
  assert.ok(phase0.length >= 7);
  assert.ok(phase0.every((f) => f.status === 'ACTIVE'));

  const activeFeatures = getFeaturesByStatus('ACTIVE');
  assert.ok(activeFeatures.some((f) => f.id === 'core-dashboard'));
  assert.ok(activeFeatures.some((f) => f.id === 'core-projects'));
  assert.ok(activeFeatures.some((f) => f.id === 'core-cash-banking'));
  assert.ok(activeFeatures.some((f) => f.id === 'eng-drawings-viewer'));
  assert.ok(activeFeatures.some((f) => f.id === 'eng-rfis-submittals'));
  assert.ok(activeFeatures.some((f) => f.id === 'eng-daily-site-logs'));

  const plannedFeatures = getFeaturesByStatus('PLANNED');
  assert.ok(plannedFeatures.some((f) => f.id === 'eng-schedule-gantt'));
  assert.equal(plannedFeatures.some((f) => f.id === 'eng-rfis-submittals'), false);

  const coordinationFeature = getFeatureById('eng-rfis-submittals');
  assert.equal(coordinationFeature?.status, 'ACTIVE');
  assert.equal(coordinationFeature?.documentationRef, 'docs/ENGORYX_PHASE_1B_RFIS_SUBMITTALS.md');

  const dailySiteLogsFeature = getFeatureById('eng-daily-site-logs');
  assert.equal(dailySiteLogsFeature?.status, 'ACTIVE');
  assert.equal(dailySiteLogsFeature?.documentationRef, 'docs/ENGORYX_PHASE_1C_DAILY_SITE_LOGS.md');

  const drawingsFeature = getFeatureById('eng-drawings-viewer');
  assert.ok(drawingsFeature);
  assert.ok(drawingsFeature.openSourceCandidates?.includes('Mozilla PDF.js'));
});
