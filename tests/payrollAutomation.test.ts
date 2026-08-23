import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayrollDraft,
  classifyPayrollExceptions,
  resolveCompensation,
  type PayrollException,
} from '../src/lib/payrollAutomation.ts';

const period = { id: 'p1', startDate: '2026-01-01', endDate: '2026-01-31' };


test('gives an effective assignment override precedence over a profile', () => {
    const resolved = resolveCompensation('w1', '2026-01-15', [
      { id: 'profile', workerId: 'w1', effectiveFrom: '2026-01-01', frequency: 'HOURLY', rate: 20, defaultLaborContext: 'PROJECT' },
    ], [
      { id: 'assignment', workerId: 'w1', effectiveFrom: '2026-01-10', rate: 30, frequency: 'HOURLY', laborContext: 'ADMIN_OFFICE' },
    ]);
    assert.equal(resolved?.rate, 30);
    assert.equal(resolved?.laborContext, 'ADMIN_OFFICE');
    assert.equal(resolved?.source.kind, 'ASSIGNMENT_OVERRIDE');
  });

test('selects the latest effective profile and respects its end date', () => {
    const profiles = [
      { id: 'old', workerId: 'w1', effectiveFrom: '2026-01-01', effectiveTo: '2026-01-14', frequency: 'DAILY' as const, rate: 100, defaultLaborContext: 'PROJECT' as const },
      { id: 'new', workerId: 'w1', effectiveFrom: '2026-01-15', frequency: 'DAILY' as const, rate: 120, defaultLaborContext: 'PROJECT' as const },
    ];
    assert.equal(resolveCompensation('w1', '2026-01-14', profiles)?.rate, 100);
    assert.equal(resolveCompensation('w1', '2026-01-15', profiles)?.rate, 120);
  });

test('applies only active effective recurring components', () => {
    const draft = buildPayrollDraft({
      period,
      mode: 'AUTOMATED',
      workers: [{ id: 'w1' }],
      profiles: [{ workerId: 'w1', effectiveFrom: '2026-01-01', frequency: 'MONTHLY', rate: 1000, defaultLaborContext: 'ADMIN_OFFICE' }],
      workEntries: [{ id: 'e1', workerId: 'w1', workDate: '2026-01-15', approved: true }],
      recurringComponents: [
        { id: 'allowance', workerId: 'w1', type: 'EARNING', amount: 100, effectiveFrom: '2026-01-01', active: true },
        { id: 'old', workerId: 'w1', type: 'EARNING', amount: 500, effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', active: true },
        { id: 'off', workerId: 'w1', type: 'DEDUCTION', amount: 50, effectiveFrom: '2026-01-01', active: false },
      ],
    });
    assert.equal(draft.entries[0].grossEarnings, 1100);
    assert.deepEqual(draft.entries[0].components.map((component) => component.id), ['allowance']);
  });

test('uses admin defaults without inventing a project', () => {
    const draft = buildPayrollDraft({
      period,
      profiles: [{ workerId: 'w1', effectiveFrom: '2026-01-01', frequency: 'HOURLY', rate: 25, defaultLaborContext: 'ADMIN_OFFICE' }],
      workEntries: [{ id: 'e1', workerId: 'w1', workDate: '2026-01-10', hours: 4, approved: true }],
    });
    assert.equal(draft.allocations[0].laborContext, 'ADMIN_OFFICE');
    assert.equal(draft.allocations[0].projectId, undefined);
  });

test('does not multiply monthly base by days or duplicate estimated cost', () => {
    const draft = buildPayrollDraft({
      period,
      profiles: [{ workerId: 'w1', effectiveFrom: '2026-01-01', frequency: 'MONTHLY', rate: 2000, defaultLaborContext: 'PROJECT', defaultProjectId: 'project-1' }],
      workEntries: [
        { id: 'e1', workerId: 'w1', workDate: '2026-01-01', days: 10, estimatedCost: 2000, approved: true, projectId: 'project-1' },
        { id: 'e2', workerId: 'w1', workDate: '2026-01-15', days: 10, estimatedCost: 2000, approved: true, projectId: 'project-1' },
      ],
      existingPayrollAllocations: [{ workEntryId: 'e1', workerId: 'w1', amount: 2000, confirmed: true }],
    });
    assert.equal(draft.entries[0].grossEarnings, 2000);
    assert.equal(draft.totals.grossEarnings, 2000);
    assert.equal(draft.totals.allocated, 2000);
    assert.notEqual(draft.totals.allocated, 4000);
  });

test('preserves manual, assisted, and automated mode in the draft', () => {
    for (const mode of ['MANUAL', 'ASSISTED', 'AUTOMATED'] as const) {
      assert.equal(buildPayrollDraft({ period, mode, workEntries: [] }).mode, mode);
    }
  });

test('classifies exception severity and becomes ready with no exceptions', () => {
    const exceptions: PayrollException[] = [
      { code: 'MISSING_RATE', severity: 'BLOCKING', message: 'missing' },
      { code: 'NO_ENTRIES', severity: 'WARNING', message: 'none' },
    ];
    assert.equal(classifyPayrollExceptions(exceptions), 'BLOCKING');
    assert.equal(classifyPayrollExceptions([exceptions[1]]), 'WARNING');
    assert.equal(classifyPayrollExceptions([]), 'READY');
    const draft = buildPayrollDraft({ period, workEntries: [] });
    assert.equal(draft.readiness, 'READY');
  });

test('flags overtime without a rule and invalid project context', () => {
    const draft = buildPayrollDraft({
      period,
      profiles: [{ workerId: 'w1', effectiveFrom: '2026-01-01', frequency: 'HOURLY', rate: 25, defaultLaborContext: 'PROJECT' }],
      workEntries: [{ id: 'e1', workerId: 'w1', workDate: '2026-01-05', hours: 8, overtimeHours: 2, approved: true }],
    });
    assert.deepEqual(draft.exceptions.map((item) => item.code).sort(), ['INVALID_PROJECT_CONTEXT', 'OVERTIME_WITHOUT_RULE']);
    assert.equal(draft.readiness, 'BLOCKING');
  });
