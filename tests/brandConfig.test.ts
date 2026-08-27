import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRAND, formatBreadcrumb, formatPageTitle } from '../src/config/brand.ts';
import { ENGORYX_FEATURE_REGISTRY, getFeaturesByPhase, getFeaturesByStatus, getFeatureById } from '../src/features/registry.ts';

test('brand configuration contains canonical Engoryx values', () => {
  assert.equal(BRAND.productName, 'Engoryx');
  assert.equal(BRAND.shortName, 'Engoryx');
  assert.equal(BRAND.displayUppercase, 'ENGORYX');
  assert.equal(BRAND.tagline, 'Engineering Operations');
  assert.equal(BRAND.assistantName, 'Engoryx Assistant');
  assert.equal(BRAND.browserTitle, 'Engoryx | Engineering Operations');
  assert.match(BRAND.description, /engineering operations platform/i);
  assert.match(BRAND.footerText, /Engoryx/);
});

test('page title and breadcrumb formatting helpers produce correct branded labels', () => {
  assert.equal(formatPageTitle(), 'Engoryx | Engineering Operations');
  assert.equal(formatPageTitle('Projects'), 'Projects | Engoryx');
  assert.equal(formatPageTitle('Cash and Banking'), 'Cash and Banking | Engoryx');

  assert.equal(formatBreadcrumb(), 'Engoryx');
  assert.equal(formatBreadcrumb('Invoices'), 'Engoryx / Invoices');
  assert.equal(formatBreadcrumb('Payroll'), 'Engoryx / Payroll');
});

test('index.html, metadata.json, and package.json are synchronized with Engoryx brand', () => {
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /<title>Engoryx \| Engineering Operations<\/title>/);
  assert.doesNotMatch(indexHtml, /My Google AI Studio App/);

  const metadataJson = JSON.parse(readFileSync(new URL('../metadata.json', import.meta.url), 'utf8'));
  assert.equal(metadataJson.name, 'Engoryx');
  assert.match(metadataJson.description, /engineering operations/i);

  const pkgJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkgJson.name, 'engoryx');
});

test('feature registry covers all operational and roadmap engineering phases', () => {
  assert.ok(ENGORYX_FEATURE_REGISTRY.length >= 8);

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
