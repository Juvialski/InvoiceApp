import test from "node:test";
import assert from "node:assert/strict";
import { resolveBatchFinancialAccounts } from "../src/lib/entityResolution.ts";
import type { FinancialAccount } from "../src/lib/cashBanking.ts";

const existingAccounts: FinancialAccount[] = [
  {
    id: "acc-bdo-php-1",
    companyId: "comp-1",
    accountType: "BANK",
    institutionCode: "BDO",
    institutionName: "BDO Unibank",
    displayName: "BDO Operating Account",
    maskedIdentifier: "•••• 4821",
    currency: "PHP",
    openingBalance: 100000,
    openingBalanceDate: "2026-01-01",
    connectionType: "STATEMENT",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

test("Same-batch account grouping: two compatible statements for unseen account form ONE proposed account group", () => {
  const candidateA = {
    candidateId: "stmt-jan",
    evidence: {
      institutionName: "BPI",
      maskedIdentifier: "1234",
      currency: "PHP",
    },
  };
  const candidateB = {
    candidateId: "stmt-feb",
    evidence: {
      institutionName: "Bank of the Philippine Islands",
      maskedIdentifier: "1234",
      currency: "PHP",
    },
  };

  const { resolutions, groups } = resolveBatchFinancialAccounts(
    [candidateA, candidateB],
    existingAccounts
  );

  const groupIds = Object.keys(groups);
  assert.equal(groupIds.length, 1);
  assert.deepEqual(groups[groupIds[0]].sort(), ["stmt-feb", "stmt-jan"]);

  assert.equal(resolutions["stmt-jan"].proposedAction, "CREATE_NEW");
  assert.equal(resolutions["stmt-feb"].proposedAction, "CREATE_NEW");
  assert.equal(resolutions["stmt-jan"].batchGroupId, resolutions["stmt-feb"].batchGroupId);
  assert.equal(resolutions["stmt-jan"].matchedEntityName, "Bank of the Philippine Islands •••• 1234");
});

test("Same-batch account grouping: conflicting suffixes form separate groups", () => {
  const candidateA = {
    candidateId: "stmt-bpi-1",
    evidence: {
      institutionName: "BPI",
      maskedIdentifier: "1111",
      currency: "PHP",
    },
  };
  const candidateB = {
    candidateId: "stmt-bpi-2",
    evidence: {
      institutionName: "BPI",
      maskedIdentifier: "2222",
      currency: "PHP",
    },
  };

  const { groups } = resolveBatchFinancialAccounts([candidateA, candidateB], existingAccounts);
  assert.equal(Object.keys(groups).length, 2);
});

test("Same-batch account grouping: conflicting currencies form separate groups", () => {
  const candidateA = {
    candidateId: "stmt-bdo-php",
    evidence: {
      institutionName: "Security Bank",
      maskedIdentifier: "5555",
      currency: "PHP",
    },
  };
  const candidateB = {
    candidateId: "stmt-bdo-usd",
    evidence: {
      institutionName: "Security Bank",
      maskedIdentifier: "5555",
      currency: "USD",
    },
  };

  const { groups } = resolveBatchFinancialAccounts([candidateA, candidateB], existingAccounts);
  assert.equal(Object.keys(groups).length, 2);
});

test("Same-batch account grouping: existing account matched by batch candidates are all linked to the same account", () => {
  const candidateA = {
    candidateId: "stmt-bdo-q1",
    evidence: {
      institutionName: "BDO",
      maskedIdentifier: "4821",
      currency: "PHP",
    },
  };
  const candidateB = {
    candidateId: "stmt-bdo-q2",
    evidence: {
      institutionName: "Banco De Oro",
      maskedIdentifier: "4821",
      currency: "PHP",
    },
  };

  const { resolutions, groups } = resolveBatchFinancialAccounts([candidateA, candidateB], existingAccounts);
  assert.equal(Object.keys(groups).length, 1);
  assert.equal(resolutions["stmt-bdo-q1"].matchedEntityId, "acc-bdo-php-1");
  assert.equal(resolutions["stmt-bdo-q2"].matchedEntityId, "acc-bdo-php-1");
  assert.equal(resolutions["stmt-bdo-q1"].proposedAction, "LINK_EXISTING");
  assert.equal(resolutions["stmt-bdo-q2"].proposedAction, "LINK_EXISTING");
});

test("Same-batch account grouping: order independence", () => {
  const c1 = {
    candidateId: "c1",
    evidence: { institutionName: "Metrobank", maskedIdentifier: "3333", currency: "PHP" },
  };
  const c2 = {
    candidateId: "c2",
    evidence: { institutionName: "Metrobank", maskedIdentifier: "3333", currency: "PHP" },
  };
  const c3 = {
    candidateId: "c3",
    evidence: { institutionName: "RCBC", maskedIdentifier: "9999", currency: "PHP" },
  };

  const order1 = [c1, c2, c3];
  const order2 = [c3, c1, c2];

  const res1 = resolveBatchFinancialAccounts(order1, existingAccounts);
  const res2 = resolveBatchFinancialAccounts(order2, existingAccounts);

  assert.deepEqual(
    Object.values(res1.groups).map((g) => g.sort()).sort(),
    Object.values(res2.groups).map((g) => g.sort()).sort()
  );
  assert.equal(res1.resolutions["c1"].batchGroupId, res2.resolutions["c1"].batchGroupId);
  assert.equal(res1.resolutions["c2"].batchGroupId, res2.resolutions["c2"].batchGroupId);
});
