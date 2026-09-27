import assert from "node:assert/strict";
import test from "node:test";
import {
  combinedWorkbookReviewForContext,
} from "../src/app/routes/OperationsWorkbookTransfer.tsx";
import { operationsWorkbookContextKey } from "../src/lib/operationsWorkbookModel.ts";
import type { CombinedOperationsWorkbookImportReview } from "../src/lib/combinedOperationsWorkbook.ts";

test("open combined workbook reviews are visible only in the company, permission, and demo context that created them", () => {
  const review = {} as CombinedOperationsWorkbookImportReview;
  const permissions = ["projects.read", "projects.manage"] as const;
  const contextKey = operationsWorkbookContextKey("company-a", permissions, false);
  const snapshot = { contextKey, generation: 4, review };

  assert.equal(combinedWorkbookReviewForContext(snapshot, contextKey, 4), review);
  assert.equal(combinedWorkbookReviewForContext(snapshot, operationsWorkbookContextKey("company-b", permissions, false), 5), null);
  assert.equal(combinedWorkbookReviewForContext(snapshot, operationsWorkbookContextKey("company-a", ["projects.read"], false), 5), null);
  assert.equal(combinedWorkbookReviewForContext(snapshot, operationsWorkbookContextKey("company-a", permissions, true), 5), null);
  assert.equal(
    combinedWorkbookReviewForContext(snapshot, contextKey, 6),
    null,
    "a return to an earlier context does not revive its previous review generation",
  );
});
